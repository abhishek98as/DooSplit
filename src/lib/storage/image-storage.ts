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
  deleteImageByReferenceIdFromFirebase,
  getImageByReferenceIdFromFirebase,
  getImagesForEntityFromFirebase,
  isFirebaseReference,
  isFirebaseStorageConfigured,
  uploadImageToFirebase,
} from "./firebase-storage";

type ManagedImage = ImageReference & { provider: "imagekit" | "firebase" };

function preferredProvider(): "firebase" | "imagekit" {
  const value = (process.env.IMAGE_STORAGE_PROVIDER || "firebase").toLowerCase();
  if (value === "imagekit") {
    return "imagekit";
  }
  return "firebase";
}

export async function uploadManagedImage(
  file: Buffer | string | File,
  originalName: string,
  options: UploadOptions
): Promise<ManagedImage> {
  const provider = preferredProvider();

  if (provider === "firebase" && isFirebaseStorageConfigured()) {
    return uploadImageToFirebase(file, originalName, options);
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
  if (isFirebaseReference(referenceId)) {
    return getImageByReferenceIdFromFirebase(referenceId);
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

  if (!isFirebaseStorageConfigured()) {
    return mappedImageKit;
  }

  const fromFirebase = await getImagesForEntityFromFirebase(entityId, type);
  return [...mappedImageKit, ...fromFirebase];
}

export async function deleteManagedImage(referenceId: string): Promise<boolean> {
  if (isFirebaseReference(referenceId)) {
    return deleteImageByReferenceIdFromFirebase(referenceId);
  }
  return deleteImage(referenceId);
}
