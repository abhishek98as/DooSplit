import crypto from "crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseStorageBucket } from "@/lib/supabase/shared";
import {
  type ImageReference,
  type UploadOptions,
  ImageType,
  VALIDATION,
} from "@/lib/imagekit-service";

const SUPABASE_REF_PREFIX = "sb_";

function getBucketName(): string {
  return getSupabaseStorageBucket();
}

function encodeRef(payload: { bucket: string; path: string }): string {
  return `${SUPABASE_REF_PREFIX}${Buffer.from(JSON.stringify(payload)).toString("base64url")}`;
}

function decodeRef(referenceId: string): { bucket: string; path: string } | null {
  if (!referenceId.startsWith(SUPABASE_REF_PREFIX)) {
    return null;
  }
  try {
    const raw = referenceId.slice(SUPABASE_REF_PREFIX.length);
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
  throw new Error("Invalid file format for Supabase storage upload");
}

function buildPath(type: ImageType, entityId: string, originalName: string): string {
  const ext = extensionFromName(originalName);
  const random = crypto.randomBytes(4).toString("hex");
  const timestamp = Date.now();
  return `doosplit/${type}/${entityId}/${timestamp}-${random}.${ext}`;
}

export function isSupabaseStorageConfigured(): boolean {
  return (
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export function isSupabaseReference(referenceId: string): boolean {
  return referenceId.startsWith(SUPABASE_REF_PREFIX);
}

export async function uploadImageToSupabase(
  file: Buffer | string | File,
  originalName: string,
  options: UploadOptions
): Promise<ImageReference & { provider: "supabase" }> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase storage is not configured");
  }

  const buffer = await toBuffer(file);
  validateBuffer(buffer, options);

  const ext = extensionFromName(originalName);
  const allowedFormats = (options.allowedFormats ||
    VALIDATION.ALLOWED_FORMATS) as string[];
  if (!allowedFormats.includes(ext)) {
    throw new Error(`Invalid file extension "${ext}"`);
  }

  const bucket = getBucketName();
  const path = buildPath(options.type, options.entityId, originalName);
  const mimeType = detectMimeType(ext);

  const { error } = await supabase.storage.from(bucket).upload(path, buffer, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) {
    throw new Error(`Supabase upload failed: ${error.message}`);
  }

  const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(path);
  const referenceId = encodeRef({ bucket, path });

  return {
    id: referenceId,
    fileId: path,
    url: publicData.publicUrl,
    name: originalName,
    type: options.type,
    entityId: options.entityId,
    size: buffer.length,
    format: ext,
    uploadedAt: new Date(),
    tags: [options.type, `entity-${options.entityId}`],
    provider: "supabase",
  };
}

export async function getImageByReferenceIdFromSupabase(
  referenceId: string
): Promise<(ImageReference & { provider: "supabase" }) | null> {
  const parsed = decodeRef(referenceId);
  if (!parsed) {
    return null;
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.storage
    .from(parsed.bucket)
    .list(parsed.path.split("/").slice(0, -1).join("/"), {
      limit: 100,
    });
  if (error) {
    return null;
  }

  const filename = parsed.path.split("/").pop();
  const file = (data || []).find((entry) => entry.name === filename);
  if (!file) {
    return null;
  }

  const pathParts = parsed.path.split("/");
  const type = (pathParts[1] as ImageType) || ImageType.GENERAL;
  const entityId = pathParts[2] || "";
  const { data: publicData } = supabase.storage
    .from(parsed.bucket)
    .getPublicUrl(parsed.path);

  return {
    id: referenceId,
    fileId: parsed.path,
    url: publicData.publicUrl,
    name: file.name,
    type,
    entityId,
    size: file.metadata?.size || 0,
    format: extensionFromName(file.name),
    uploadedAt: file.created_at ? new Date(file.created_at) : new Date(),
    tags: [type, `entity-${entityId}`],
    provider: "supabase",
  };
}

export async function getImagesForEntityFromSupabase(
  entityId: string,
  type?: ImageType
): Promise<Array<ImageReference & { provider: "supabase" }>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return [];
  }

  const bucket = getBucketName();
  const prefixes = type
    ? [`doosplit/${type}/${entityId}`]
    : Object.values(ImageType).map((item) => `doosplit/${item}/${entityId}`);

  const results: Array<ImageReference & { provider: "supabase" }> = [];
  for (const prefix of prefixes) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: 100,
      sortBy: { column: "name", order: "desc" },
    });
    if (error || !data) {
      continue;
    }

    for (const file of data) {
      const fullPath = `${prefix}/${file.name}`;
      const referenceId = encodeRef({ bucket, path: fullPath });
      const pathParts = fullPath.split("/");
      const itemType = (pathParts[1] as ImageType) || ImageType.GENERAL;
      const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(fullPath);
      results.push({
        id: referenceId,
        fileId: fullPath,
        url: publicData.publicUrl,
        name: file.name,
        type: itemType,
        entityId,
        size: file.metadata?.size || 0,
        format: extensionFromName(file.name),
        uploadedAt: file.created_at ? new Date(file.created_at) : new Date(),
        tags: [itemType, `entity-${entityId}`],
        provider: "supabase",
      });
    }
  }

  return results;
}

export async function deleteImageByReferenceIdFromSupabase(
  referenceId: string
): Promise<boolean> {
  const parsed = decodeRef(referenceId);
  if (!parsed) {
    return false;
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return false;
  }

  const { error } = await supabase.storage.from(parsed.bucket).remove([parsed.path]);
  return !error;
}
