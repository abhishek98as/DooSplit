import {
  deleteImageByReferenceIdFromFirebase,
  getImageByReferenceIdFromFirebase,
  getImagesForEntityFromFirebase,
  isFirebaseReference,
  isFirebaseStorageConfigured,
  uploadImageToFirebase,
} from "./firebase-storage";
import type { ImageReference, UploadOptions } from "./image-types";
import { ImageType } from "./image-types";

type ManagedImage = ImageReference & { provider: "firebase" };

export async function uploadManagedImage(
  file: Buffer | string | File,
  originalName: string,
  options: UploadOptions
): Promise<ManagedImage> {
  if (!isFirebaseStorageConfigured()) {
    throw new Error(
      "Firebase Storage is not configured. Set FIREBASE_STORAGE_BUCKET or NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET."
    );
  }

  return uploadImageToFirebase(file, originalName, options);
}

export async function getManagedImageByReferenceId(
  referenceId: string
): Promise<ManagedImage | null> {
  if (!isFirebaseReference(referenceId)) {
    return null;
  }

  return getImageByReferenceIdFromFirebase(referenceId);
}

export async function getManagedImagesForEntity(
  entityId: string,
  type?: ImageType
): Promise<ManagedImage[]> {
  if (!isFirebaseStorageConfigured()) {
    return [];
  }

  return getImagesForEntityFromFirebase(entityId, type);
}

export async function deleteManagedImage(referenceId: string): Promise<boolean> {
  if (!isFirebaseReference(referenceId)) {
    return false;
  }

  return deleteImageByReferenceIdFromFirebase(referenceId);
}
