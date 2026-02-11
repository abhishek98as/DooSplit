import {
  deleteImage,
  getImageByReferenceId,
  getImagesForEntity,
  type ImageReference,
  type UploadOptions,
  uploadImage,
  ImageType,
} from "@/lib/imagekit-service";
import {
  deleteImageByReferenceIdFromSupabase,
  getImageByReferenceIdFromSupabase,
  getImagesForEntityFromSupabase,
  isSupabaseReference,
  isSupabaseStorageConfigured,
  uploadImageToSupabase,
} from "./supabase-storage";

type ManagedImage = ImageReference & { provider: "imagekit" | "supabase" };

function preferredProvider(): "supabase" | "imagekit" {
  const value = (process.env.IMAGE_STORAGE_PROVIDER || "supabase").toLowerCase();
  if (value === "imagekit") {
    return "imagekit";
  }
  return "supabase";
}

export async function uploadManagedImage(
  file: Buffer | string | File,
  originalName: string,
  options: UploadOptions
): Promise<ManagedImage> {
  const provider = preferredProvider();

  if (provider === "supabase" && isSupabaseStorageConfigured()) {
    return uploadImageToSupabase(file, originalName, options);
  }

  const image = await uploadImage(file, originalName, options);
  return {
    ...image,
    provider: "imagekit",
  };
}

export async function getManagedImageByReferenceId(
  referenceId: string
): Promise<ManagedImage | null> {
  if (isSupabaseReference(referenceId)) {
    return getImageByReferenceIdFromSupabase(referenceId);
  }

  const image = await getImageByReferenceId(referenceId);
  if (!image) {
    return null;
  }
  return {
    ...image,
    provider: "imagekit",
  };
}

export async function getManagedImagesForEntity(
  entityId: string,
  type?: ImageType
): Promise<ManagedImage[]> {
  const fromImageKit = await getImagesForEntity(entityId, type);
  const mappedImageKit = fromImageKit.map((image) => ({
    ...image,
    provider: "imagekit" as const,
  }));

  if (!isSupabaseStorageConfigured()) {
    return mappedImageKit;
  }

  const fromSupabase = await getImagesForEntityFromSupabase(entityId, type);
  return [...mappedImageKit, ...fromSupabase];
}

export async function deleteManagedImage(referenceId: string): Promise<boolean> {
  if (isSupabaseReference(referenceId)) {
    return deleteImageByReferenceIdFromSupabase(referenceId);
  }
  return deleteImage(referenceId);
}
