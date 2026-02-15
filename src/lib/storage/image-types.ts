export enum ImageType {
  USER_PROFILE = "user_profile",
  EXPENSE = "expense",
  GENERAL = "general",
}

export interface ImageReference {
  id: string;
  fileId: string;
  url: string;
  name: string;
  type: ImageType;
  entityId: string;
  size: number;
  format: string;
  uploadedAt: Date;
  tags: string[];
}

export interface UploadOptions {
  type: ImageType;
  entityId: string;
  customName?: string;
  tags?: string[];
  maxSize?: number;
  allowedFormats?: string[];
  isPrivateFile?: boolean;
}

export const VALIDATION = {
  MAX_EXPENSE_IMAGES: 10,
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_FORMATS: ["jpg", "jpeg", "png", "gif", "webp"],
} as const;
