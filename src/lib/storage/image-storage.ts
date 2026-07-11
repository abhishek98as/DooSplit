import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { newAppId } from "@/lib/ids";
import type { ImageReference, UploadOptions } from "./image-types";

const BUCKET = "doosplit-uploads";
const REGION = process.env.AWS_REGION || "eu-central-1";

function getS3() {
  return new S3Client({
    region: REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
}

export function isS3Configured(): boolean {
  return !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
}

type ManagedImage = ImageReference & { provider: "s3" };

export async function uploadManagedImage(
  file: Buffer | string | File,
  originalName: string,
  options: UploadOptions
): Promise<ManagedImage> {
  if (!isS3Configured()) {
    throw new Error("S3 is not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.");
  }

  const fileId = newAppId();
  const ext = originalName.split(".").pop()?.toLowerCase() || "jpg";
  const key = `images/${options.type}/${options.entityId}/${fileId}.${ext}`;

  let buffer: Buffer;
  if (typeof file === "string") {
    buffer = Buffer.from(file, "base64");
  } else if (file instanceof File) {
    const ab = await file.arrayBuffer();
    buffer = Buffer.from(ab);
  } else {
    buffer = file;
  }

  const s3 = getS3();
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: `image/${ext === "jpg" ? "jpeg" : ext}`,
    CacheControl: "max-age=31536000",
  }));

  const publicUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;

  return {
    fileId,
    name: originalName,
    url: publicUrl,
    key,
    type: options.type,
    entityId: options.entityId,
    size: buffer.length,
    provider: "s3",
    uploadedAt: new Date().toISOString(),
    referenceId: `s3:${key}`,
  } as ManagedImage;
}

export async function getManagedImageByReferenceId(
  referenceId: string
): Promise<ManagedImage | null> {
  if (!referenceId?.startsWith("s3:")) return null;

  const key = referenceId.replace("s3:", "");
  const s3 = getS3();

  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: 3600 });

    return {
      fileId: key.split("/").pop()?.split(".")[0] || "",
      name: key.split("/").pop() || "",
      url,
      key,
      referenceId,
      type: (key.split("/")[1] as any) || "expense_receipt",
      entityId: key.split("/")[2] || "",
      size: head.ContentLength || 0,
      provider: "s3",
      uploadedAt: head.LastModified?.toISOString() || "",
    } as ManagedImage;
  } catch {
    return null;
  }
}

export async function getManagedImagesForEntity(
  entityId: string,
  _type?: string
): Promise<ManagedImage[]> {
  // S3 doesn't support listing by prefix easily in a serverless context.
  // Images are accessed via referenceId stored in DynamoDB.
  return [];
}

export async function deleteManagedImage(referenceId: string): Promise<boolean> {
  if (!referenceId?.startsWith("s3:")) return false;

  const key = referenceId.replace("s3:", "");
  try {
    await getS3().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

export function isS3Reference(referenceId: string): boolean {
  return referenceId?.startsWith("s3:") ?? false;
}
