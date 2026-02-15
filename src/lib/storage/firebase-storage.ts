import crypto from "crypto";
import { getAdminStorage } from "@/lib/firestore/admin";
import {
  type ImageReference,
  type UploadOptions,
  ImageType,
  VALIDATION,
} from "@/lib/imagekit-service";

const FIREBASE_REF_PREFIX = "fb_";

function getBucketName(): string {
  return (
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    ""
  );
}

function getBucket() {
  const storage = getAdminStorage();
  const explicit = getBucketName();
  return explicit ? storage.bucket(explicit) : storage.bucket();
}

function encodeRef(payload: { bucket: string; path: string }): string {
  return `${FIREBASE_REF_PREFIX}${Buffer.from(JSON.stringify(payload)).toString(
    "base64url"
  )}`;
}

function decodeRef(referenceId: string): { bucket: string; path: string } | null {
  if (!referenceId.startsWith(FIREBASE_REF_PREFIX)) {
    return null;
  }

  try {
    const raw = referenceId.slice(FIREBASE_REF_PREFIX.length);
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!parsed?.bucket || !parsed?.path) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function extensionFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  if (!ext) {
    return "jpg";
  }
  return ext;
}

function detectMimeType(ext: string): string {
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
  };
  return map[ext] || "application/octet-stream";
}

function validateBuffer(buffer: Buffer, options: UploadOptions): void {
  const maxSize = options.maxSize || VALIDATION.MAX_FILE_SIZE;
  if (buffer.length > maxSize) {
    throw new Error(
      `File size exceeds maximum allowed size of ${maxSize / (1024 * 1024)}MB`
    );
  }
}

async function toBuffer(input: Buffer | string | File): Promise<Buffer> {
  if (Buffer.isBuffer(input)) {
    return input;
  }
  if (typeof input === "string" && input.startsWith("data:")) {
    const encoded = input.split(",")[1];
    return Buffer.from(encoded, "base64");
  }
  if (typeof File !== "undefined" && input instanceof File) {
    return Buffer.from(await input.arrayBuffer());
  }
  throw new Error("Invalid file format for Firebase storage upload");
}

function buildPath(type: ImageType, entityId: string, originalName: string): string {
  const ext = extensionFromName(originalName);
  const random = crypto.randomBytes(4).toString("hex");
  const timestamp = Date.now();
  return `doosplit/${type}/${entityId}/${timestamp}-${random}.${ext}`;
}

function buildPublicUrl(bucket: string, path: string): string {
  return `https://storage.googleapis.com/${bucket}/${encodeURI(path)}`;
}

export function isFirebaseStorageConfigured(): boolean {
  return Boolean(getBucketName());
}

export function isFirebaseReference(referenceId: string): boolean {
  return referenceId.startsWith(FIREBASE_REF_PREFIX);
}

export async function uploadImageToFirebase(
  file: Buffer | string | File,
  originalName: string,
  options: UploadOptions
): Promise<ImageReference & { provider: "firebase" }> {
  const bucket = getBucket();
  const bucketName = bucket.name;

  if (!bucketName) {
    throw new Error("Firebase storage bucket is not configured");
  }

  const buffer = await toBuffer(file);
  validateBuffer(buffer, options);

  const ext = extensionFromName(originalName);
  const allowedFormats = (options.allowedFormats ||
    VALIDATION.ALLOWED_FORMATS) as string[];
  if (!allowedFormats.includes(ext)) {
    throw new Error(`Invalid file extension "${ext}"`);
  }

  const path = buildPath(options.type, options.entityId, originalName);
  const mimeType = detectMimeType(ext);
  const fileRef = bucket.file(path);

  await fileRef.save(buffer, {
    metadata: {
      contentType: mimeType,
      metadata: {
        type: options.type,
        entityId: options.entityId,
      },
    },
    resumable: false,
    validation: false,
  });

  const [metadata] = await fileRef.getMetadata();
  const referenceId = encodeRef({ bucket: bucketName, path });

  return {
    id: referenceId,
    fileId: path,
    url: buildPublicUrl(bucketName, path),
    name: originalName,
    type: options.type,
    entityId: options.entityId,
    size: Number(metadata.size || buffer.length),
    format: ext,
    uploadedAt: metadata.timeCreated ? new Date(metadata.timeCreated) : new Date(),
    tags: [options.type, `entity-${options.entityId}`],
    provider: "firebase",
  };
}

export async function getImageByReferenceIdFromFirebase(
  referenceId: string
): Promise<(ImageReference & { provider: "firebase" }) | null> {
  const parsed = decodeRef(referenceId);
  if (!parsed) {
    return null;
  }

  const bucket = getAdminStorage().bucket(parsed.bucket);
  const fileRef = bucket.file(parsed.path);
  const [exists] = await fileRef.exists();
  if (!exists) {
    return null;
  }

  const [metadata] = await fileRef.getMetadata();
  const pathParts = parsed.path.split("/");
  const type = (pathParts[1] as ImageType) || ImageType.GENERAL;
  const entityId = pathParts[2] || "";
  const fileName = pathParts[pathParts.length - 1] || "image";

  return {
    id: referenceId,
    fileId: parsed.path,
    url: buildPublicUrl(parsed.bucket, parsed.path),
    name: fileName,
    type,
    entityId,
    size: Number(metadata.size || 0),
    format: extensionFromName(fileName),
    uploadedAt: metadata.timeCreated ? new Date(metadata.timeCreated) : new Date(),
    tags: [type, `entity-${entityId}`],
    provider: "firebase",
  };
}

export async function getImagesForEntityFromFirebase(
  entityId: string,
  type?: ImageType
): Promise<Array<ImageReference & { provider: "firebase" }>> {
  const bucket = getBucket();
  const bucketName = bucket.name;
  if (!bucketName) {
    return [];
  }

  const prefixes = type
    ? [`doosplit/${type}/${entityId}/`]
    : Object.values(ImageType).map((item) => `doosplit/${item}/${entityId}/`);

  const results: Array<ImageReference & { provider: "firebase" }> = [];
  for (const prefix of prefixes) {
    const [files] = await bucket.getFiles({
      prefix,
      autoPaginate: false,
      maxResults: 100,
    });

    for (const fileRef of files) {
      const fullPath = fileRef.name;
      if (!fullPath || fullPath.endsWith("/")) {
        continue;
      }

      const [metadata] = await fileRef.getMetadata();
      const referenceId = encodeRef({ bucket: bucketName, path: fullPath });
      const pathParts = fullPath.split("/");
      const itemType = (pathParts[1] as ImageType) || ImageType.GENERAL;
      const fileName = pathParts[pathParts.length - 1] || "image";

      results.push({
        id: referenceId,
        fileId: fullPath,
        url: buildPublicUrl(bucketName, fullPath),
        name: fileName,
        type: itemType,
        entityId,
        size: Number(metadata.size || 0),
        format: extensionFromName(fileName),
        uploadedAt: metadata.timeCreated ? new Date(metadata.timeCreated) : new Date(),
        tags: [itemType, `entity-${entityId}`],
        provider: "firebase",
      });
    }
  }

  return results;
}

export async function deleteImageByReferenceIdFromFirebase(
  referenceId: string
): Promise<boolean> {
  const parsed = decodeRef(referenceId);
  if (!parsed) {
    return false;
  }

  const bucket = getAdminStorage().bucket(parsed.bucket);
  const fileRef = bucket.file(parsed.path);
  try {
    await fileRef.delete({ ignoreNotFound: true });
    return true;
  } catch {
    return false;
  }
}
