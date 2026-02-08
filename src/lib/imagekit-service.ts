import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import https from 'https';

// ImageKit configuration
const IMAGEKIT_PUBLIC_KEY = 'public_fotFZX2VhvZjaJuGaTiCDQvstP0=';
const IMAGEKIT_PRIVATE_KEY = 'private_3QuRigyMS2nDaHYfYpZpVp0OWiU=';
const IMAGEKIT_URL_ENDPOINT = 'https://ik.imagekit.io/camhdr';

// Simple ImageKit API wrapper
class SimpleImageKit {
  private makeRequest(endpoint: string, method: string = 'GET', data?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = `https://api.imagekit.io/v1${endpoint}`;
      const auth = Buffer.from(`${IMAGEKIT_PRIVATE_KEY}:`).toString('base64');

      const options: https.RequestOptions = {
        hostname: 'api.imagekit.io',
        path: `/v1${endpoint}`,
        method: method,
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            const response = body ? JSON.parse(body) : {};
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(response);
            } else {
              reject(new Error(response.message || `HTTP ${res.statusCode}`));
            }
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      if (data) {
        req.write(JSON.stringify(data));
      }
      req.end();
    });
  }

  async upload(file: any, fileName: string, options: any = {}) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fileName', fileName);
    if (options.folder) formData.append('folder', options.folder);
    if (options.tags) formData.append('tags', options.tags);
    if (options.useUniqueFileName !== false) formData.append('useUniqueFileName', 'true');

    // For simplicity, let's use a direct approach with fetch
    const response = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${IMAGEKIT_PRIVATE_KEY}:`).toString('base64')}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Upload failed: ${error}`);
    }

    return response.json();
  }

  async deleteFile(fileId: string) {
    return this.makeRequest(`/files/${fileId}`, 'DELETE');
  }

  async listFiles(options: any = {}) {
    const queryParams = new URLSearchParams();
    if (options.path) queryParams.append('path', options.path);
    if (options.searchQuery) queryParams.append('searchQuery', options.searchQuery);
    if (options.limit) queryParams.append('limit', options.limit.toString());

    const query = queryParams.toString();
    return this.makeRequest(`/files${query ? `?${query}` : ''}`);
  }

  async createFolder(folderName: string, parentFolderPath: string = '/') {
    return this.makeRequest('/folders', 'POST', {
      folderName,
      parentFolderPath,
    });
  }
}

const imagekit = new SimpleImageKit();

// Folder structure constants
export const FOLDERS = {
  ROOT: '/doosplit',
  USER_PROFILES: '/doosplit/user-profiles',
  EXPENSE_IMAGES: '/doosplit/expense-images',
  GENERAL_IMAGES: '/doosplit/general',
} as const;

// Image types
export enum ImageType {
  USER_PROFILE = 'user_profile',
  EXPENSE = 'expense',
  GENERAL = 'general',
}

// Database reference interface
export interface ImageReference {
  id: string; // Unique reference ID for database
  fileId: string; // ImageKit file ID
  url: string; // ImageKit URL
  name: string; // Original name
  type: ImageType;
  entityId: string; // User ID, Expense ID, etc.
  size: number;
  format: string;
  uploadedAt: Date;
  tags: string[];
}

// Upload options interface
export interface UploadOptions {
  type: ImageType;
  entityId: string; // User ID for profiles, Expense ID for expense images
  customName?: string;
  tags?: string[];
  maxSize?: number; // in bytes
  allowedFormats?: string[];
}

// Validation constants
export const VALIDATION = {
  MAX_EXPENSE_IMAGES: 10,
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_FORMATS: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
} as const;

/**
 * Generate unique filename with proper structure
 */
function generateUniqueFilename(originalName: string, type: ImageType, entityId: string): string {
  const extension = originalName.split('.').pop()?.toLowerCase() || 'jpg';
  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString('hex');
  const typePrefix = type.replace('_', '-');

  return `${typePrefix}-${entityId}-${timestamp}-${random}.${extension}`;
}

/**
 * Validate image file
 */
function validateImage(file: Buffer | string, options: UploadOptions): void {
  const { maxSize = VALIDATION.MAX_FILE_SIZE, allowedFormats = VALIDATION.ALLOWED_FORMATS } = options;

  // Check file size
  let fileSize: number;
  if (Buffer.isBuffer(file)) {
    fileSize = file.length;
  } else if (typeof file === 'string' && file.startsWith('data:')) {
    // Base64 encoded file
    const base64Data = file.split(',')[1];
    fileSize = Buffer.from(base64Data, 'base64').length;
  } else {
    throw new Error('Invalid file format');
  }

  if (fileSize > maxSize) {
    throw new Error(`File size exceeds maximum allowed size of ${maxSize / (1024 * 1024)}MB`);
  }

  // For expense images, check count limit
  if (options.type === ImageType.EXPENSE) {
    // This will be checked in the upload function
  }
}

/**
 * Get folder path based on image type
 */
function getFolderPath(type: ImageType): string {
  switch (type) {
    case ImageType.USER_PROFILE:
      return FOLDERS.USER_PROFILES;
    case ImageType.EXPENSE:
      return FOLDERS.EXPENSE_IMAGES;
    case ImageType.GENERAL:
      return FOLDERS.GENERAL_IMAGES;
    default:
      return FOLDERS.GENERAL_IMAGES;
  }
}

/**
 * Check expense image count limit
 */
async function checkExpenseImageLimit(expenseId: string): Promise<void> {
  try {
    const files = await imagekit.listFiles({
      searchQuery: `tags:"expense-${expenseId}"`,
    });

    if (files.length >= VALIDATION.MAX_EXPENSE_IMAGES) {
      throw new Error(`Maximum ${VALIDATION.MAX_EXPENSE_IMAGES} images allowed per expense`);
    }
  } catch (error) {
    console.error('Error checking expense image count:', error);
    // If we can't check, allow upload (fail-safe approach)
  }
}

/**
 * Upload image to ImageKit
 */
export async function uploadImage(
  file: Buffer | string,
  originalName: string,
  options: UploadOptions
): Promise<ImageReference> {
  try {
    // Validate image
    validateImage(file, options);

    // Check expense image limit
    if (options.type === ImageType.EXPENSE) {
      await checkExpenseImageLimit(options.entityId);
    }

    // Generate unique filename
    const uniqueName = options.customName || generateUniqueFilename(originalName, options.type, options.entityId);

    // Get folder path
    const folder = getFolderPath(options.type);

    // Prepare tags
    const defaultTags = [options.type, `entity-${options.entityId}`];
    if (options.type === ImageType.EXPENSE) {
      defaultTags.push(`expense-${options.entityId}`);
    }
    const allTags = [...defaultTags, ...(options.tags || [])];

    // Upload to ImageKit
    const uploadResult = await imagekit.upload(file, uniqueName, {
      folder: folder,
      tags: allTags.join(','),
      useUniqueFileName: false, // We're using our own unique naming
    });

    // Create image reference object
    const imageRef: ImageReference = {
      id: uuidv4(),
      fileId: uploadResult.fileId,
      url: uploadResult.url,
      name: uploadResult.name,
      type: options.type,
      entityId: options.entityId,
      size: uploadResult.size || 0,
      format: uniqueName.split('.').pop() || 'jpg',
      uploadedAt: new Date(),
      tags: uploadResult.tags || allTags,
    };

    console.log(`✅ Image uploaded successfully: ${imageRef.name}`);
    return imageRef;

  } catch (error: any) {
    console.error('❌ Image upload error:', error.message);
    throw new Error(`Failed to upload image: ${error.message}`);
  }
}

/**
 * Get image by reference ID (for database lookup)
 */
export async function getImageByReferenceId(referenceId: string): Promise<ImageReference | null> {
  try {
    // This would typically query your database for the reference
    // For now, we'll search ImageKit by tags (assuming referenceId is stored as a tag)
    const files = await imagekit.listFiles({
      searchQuery: `tags:"ref-${referenceId}"`,
    });

    if (files.length === 0) {
      return null;
    }

    const file = files[0];
    return {
      id: referenceId,
      fileId: file.fileId,
      url: file.url,
      name: file.name,
      type: ImageType.GENERAL, // Would need to be determined from tags
      entityId: '', // Would need to be determined from tags
      size: file.size || 0,
      format: file.name.split('.').pop() || 'jpg',
      uploadedAt: new Date(file.createdAt),
      tags: file.tags || [],
    };

  } catch (error: any) {
    console.error('❌ Error getting image by reference ID:', error.message);
    return null;
  }
}

/**
 * Get all images for an entity (user, expense, etc.)
 */
export async function getImagesForEntity(entityId: string, type?: ImageType): Promise<ImageReference[]> {
  try {
    const searchQuery = type
      ? `tags:"entity-${entityId}" AND tags:"${type}"`
      : `tags:"entity-${entityId}"`;

    const files = await imagekit.listFiles({
      searchQuery: searchQuery,
    });

    return files.map((file: any) => ({
      id: uuidv4(), // Generate ID for compatibility (would be from DB in real implementation)
      fileId: file.fileId,
      url: file.url,
      name: file.name,
      type: type || ImageType.GENERAL,
      entityId: entityId,
      size: file.size || 0,
      format: file.name.split('.').pop() || 'jpg',
      uploadedAt: new Date(file.createdAt || Date.now()),
      tags: file.tags || [],
    }));

  } catch (error: any) {
    console.error('❌ Error getting images for entity:', error.message);
    return [];
  }
}

/**
 * Delete image by reference ID
 */
export async function deleteImage(referenceId: string): Promise<boolean> {
  try {
    // Get image details first
    const imageRef = await getImageByReferenceId(referenceId);
    if (!imageRef) {
      return false;
    }

    // Delete from ImageKit
    await imagekit.deleteFile(imageRef.fileId);

    console.log(`✅ Image deleted successfully: ${imageRef.name}`);
    return true;

  } catch (error: any) {
    console.error('❌ Error deleting image:', error.message);
    return false;
  }
}

/**
 * Delete all images for an entity
 */
export async function deleteImagesForEntity(entityId: string, type?: ImageType): Promise<number> {
  try {
    const images = await getImagesForEntity(entityId, type);
    let deletedCount = 0;

    for (const image of images) {
      const success = await deleteImage(image.id);
      if (success) {
        deletedCount++;
      }
    }

    console.log(`✅ Deleted ${deletedCount} images for entity ${entityId}`);
    return deletedCount;

  } catch (error: any) {
    console.error('❌ Error deleting images for entity:', error.message);
    return 0;
  }
}

/**
 * Get optimized image URL with transformations
 */
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
  const { width, height, quality = 80, format, crop } = options;

  let transformation = '';

  if (width) transformation += `w-${width},`;
  if (height) transformation += `h-${height},`;
  if (crop) transformation += `c-${crop},`;
  if (quality) transformation += `q-${quality},`;
  if (format) transformation += `f-${format},`;

  // Remove trailing comma
  transformation = transformation.replace(/,$/, '');

  if (transformation) {
    return `${imageUrl}?tr=${transformation}`;
  }

  return imageUrl;
}

/**
 * Initialize ImageKit folders (call once during setup)
 */
export async function initializeFolders(): Promise<void> {
  try {
    // Create main doosplit folder
    await imagekit.createFolder('doosplit', '/');

    // Create subfolders
    const subfolders = ['user-profiles', 'expense-images', 'general'];

    for (const folder of subfolders) {
      await imagekit.createFolder(folder, '/doosplit');
    }

    console.log('✅ ImageKit folders initialized successfully');
  } catch (error: any) {
    // Folders might already exist, which is fine
    if (error.message?.includes('already exists')) {
      console.log('ℹ️ ImageKit folders already exist');
    } else {
      console.error('❌ Error initializing folders:', error.message);
    }
  }
}

/**
 * Get image statistics
 */
export async function getImageStats(): Promise<{
  totalImages: number;
  totalSize: number;
  imagesByType: Record<ImageType, number>;
}> {
  try {
    const allFiles = await imagekit.listFiles();

    const stats = {
      totalImages: allFiles.length,
      totalSize: allFiles.reduce((sum: number, file: any) => sum + (file.size || 0), 0),
      imagesByType: {
        [ImageType.USER_PROFILE]: 0,
        [ImageType.EXPENSE]: 0,
        [ImageType.GENERAL]: 0,
      },
    };

    // Count by type (this is a simplified approach)
    allFiles.forEach((file: any) => {
      if (file.filePath?.includes('/user-profiles/')) {
        stats.imagesByType[ImageType.USER_PROFILE]++;
      } else if (file.filePath?.includes('/expense-images/')) {
        stats.imagesByType[ImageType.EXPENSE]++;
      } else {
        stats.imagesByType[ImageType.GENERAL]++;
      }
    });

    return stats;

  } catch (error: any) {
    console.error('❌ Error getting image stats:', error.message);
    return {
      totalImages: 0,
      totalSize: 0,
      imagesByType: {
        [ImageType.USER_PROFILE]: 0,
        [ImageType.EXPENSE]: 0,
        [ImageType.GENERAL]: 0,
      },
    };
  }
}