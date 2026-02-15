/**
 * Deprecated compatibility module.
 * Image uploads are now handled via Firebase Storage.
 */
import { getAdminStorage } from "@/lib/firestore/admin";
import {
  deleteImageByReferenceIdFromFirebase,
  getImageByReferenceIdFromFirebase,
  getImagesForEntityFromFirebase,
  isFirebaseReference,
  uploadImageToFirebase,
} from "@/lib/storage/firebase-storage";
import {
  ImageType,
  type ImageReference,
  type UploadOptions,
  VALIDATION,
} from "@/lib/storage/image-types";

export { ImageType, VALIDATION };
export type { ImageReference, UploadOptions };

export const FOLDERS = {
  ROOT: "/doosplit",
  USER_PROFILES: "/doosplit/user-profiles/",
  EXPENSE_IMAGES: "/doosplit/expense-images/",
  GENERAL_IMAGES: "/doosplit/general/",
} as const;

export async function uploadImage(
  file: Buffer | string | File,
  originalName: string,
  options: UploadOptions
): Promise<ImageReference> {
  return uploadImageToFirebase(file, originalName, options);
}

export async function getImageByReferenceId(
  referenceId: string
): Promise<ImageReference | null> {
  if (!isFirebaseReference(referenceId)) {
    return null;
  }
  return getImageByReferenceIdFromFirebase(referenceId);
}

export async function getImagesForEntity(
  entityId: string,
  type?: ImageType
): Promise<ImageReference[]> {
  return getImagesForEntityFromFirebase(entityId, type);
}

export async function deleteImage(referenceId: string): Promise<boolean> {
  if (!isFirebaseReference(referenceId)) {
    return false;
  }
  return deleteImageByReferenceIdFromFirebase(referenceId);
}

export async function deleteImagesForEntity(
  entityId: string,
  type?: ImageType
): Promise<number> {
  const images = await getImagesForEntityFromFirebase(entityId, type);
  let deletedCount = 0;
  for (const image of images) {
    const deleted = await deleteImageByReferenceIdFromFirebase(image.id);
    if (deleted) {
      deletedCount += 1;
    }
  }
  return deletedCount;
}

export function getOptimizedImageUrl(
  imageUrl: string,
  options: {
    width?: number;
    height?: number;
    quality?: number;
    format?: string;
    crop?: string;
  } = {}
): string {
  const params = new URLSearchParams();
  if (options.width) params.set("w", String(options.width));
  if (options.height) params.set("h", String(options.height));
  if (options.quality) params.set("q", String(options.quality));
  if (options.format) params.set("f", options.format);
  if (options.crop) params.set("c", options.crop);

  const qs = params.toString();
  if (!qs) {
    return imageUrl;
  }

  return `${imageUrl}${imageUrl.includes("?") ? "&" : "?"}${qs}`;
}

export async function initializeFolders(): Promise<void> {
  // Firebase Storage creates virtual folders on upload, so no setup is required.
}

export async function getImageStats(): Promise<{
  totalImages: number;
  totalSize: number;
  imagesByType: Record<ImageType, number>;
}> {
  const storage = getAdminStorage();
  const explicitBucket =
    process.env.FIREBASE_STORAGE_BUCKET?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim();
  const bucket = explicitBucket ? storage.bucket(explicitBucket) : storage.bucket();

  const [files] = await bucket.getFiles({
    prefix: "doosplit/",
    autoPaginate: false,
    maxResults: 1000,
  });

  const imagesByType: Record<ImageType, number> = {
    [ImageType.USER_PROFILE]: 0,
    [ImageType.EXPENSE]: 0,
    [ImageType.GENERAL]: 0,
  };

  let totalSize = 0;
  for (const file of files) {
    const path = file.name || "";
    if (!path || path.endsWith("/")) {
      continue;
    }

    const [metadata] = await file.getMetadata();
    totalSize += Number(metadata.size || 0);

    const parts = path.split("/");
    const maybeType = parts[1] as ImageType | undefined;
    if (maybeType && imagesByType[maybeType] !== undefined) {
      imagesByType[maybeType] += 1;
    } else {
      imagesByType[ImageType.GENERAL] += 1;
    }
  }

  const totalImages =
    imagesByType[ImageType.USER_PROFILE] +
    imagesByType[ImageType.EXPENSE] +
    imagesByType[ImageType.GENERAL];

  return {
    totalImages,
    totalSize,
    imagesByType,
  };
}
