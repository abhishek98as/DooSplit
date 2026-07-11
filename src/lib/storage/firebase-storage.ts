// Firebase Storage removed — all storage now uses S3
export {
  uploadManagedImage as uploadImageToFirebase,
  getManagedImageByReferenceId as getImageByReferenceIdFromFirebase,
  getManagedImagesForEntity as getImagesForEntityFromFirebase,
  deleteManagedImage as deleteImageByReferenceIdFromFirebase,
  isS3Configured as isFirebaseStorageConfigured,
  isS3Reference as isFirebaseReference,
} from "./image-storage";
