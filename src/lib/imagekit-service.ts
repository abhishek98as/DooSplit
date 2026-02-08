import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

// ImageKit configuration
const IMAGEKIT_PUBLIC_KEY = 'public_fotFZX2VhvZjaJuGaTiCDQvstP0=';
const IMAGEKIT_PRIVATE_KEY = 'private_3QuRigyMS2nDaHYfYpZpVp0OWiU=';
const IMAGEKIT_URL_ENDPOINT = 'https://ik.imagekit.io/camhdr';

// ImageKit API wrapper with proper CRUD operations
class ImageKitAPI {
  private baseUrl = 'https://api.imagekit.io/v1';

  private async makeRequest(endpoint: string, method: string = 'GET', data?: any): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const auth = Buffer.from(`${IMAGEKIT_PRIVATE_KEY}:`).toString('base64');

    const headers: Record<string, string> = {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    };

    const config: RequestInit = {
      method,
      headers,
    };

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      config.body = JSON.stringify(data);
    }

    const response = await fetch(url, config);

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;

      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }

      throw new Error(errorMessage);
    }

    // Some endpoints return empty responses
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return response.json();
    }

    return {};
  }

  // File operations
  async uploadFile(file: File | Buffer, fileName: string, options: {
    folder?: string;
    tags?: string[];
    useUniqueFileName?: boolean;
    isPrivateFile?: boolean;
  } = {}) {
    const formData = new FormData();

    if (file instanceof File) {
      formData.append('file', file);
    } else {
      // Convert Buffer to Uint8Array then to Blob
      const uint8Array = new Uint8Array(file);
      const blob = new Blob([uint8Array]);
      formData.append('file', blob, fileName);
    }

    formData.append('fileName', fileName);

    if (options.folder) formData.append('folder', options.folder);
    if (options.tags && options.tags.length > 0) {
      formData.append('tags', options.tags.join(','));
    }
    if (options.useUniqueFileName !== false) {
      formData.append('useUniqueFileName', 'true');
    }
    if (options.isPrivateFile) {
      formData.append('isPrivateFile', 'true');
    }

    const uploadUrl = 'https://upload.imagekit.io/api/v1/files/upload';
    const auth = Buffer.from(`${IMAGEKIT_PRIVATE_KEY}:`).toString('base64');

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload failed: ${errorText}`);
    }

    return response.json();
  }

  async getFileDetails(fileId: string) {
    return this.makeRequest(`/files/${fileId}`);
  }

  async updateFileDetails(fileId: string, updates: {
    tags?: string[];
    customCoordinates?: string;
    customMetadata?: Record<string, any>;
    webhookUrl?: string;
    extensions?: any[];
    [key: string]: any;
  }) {
    return this.makeRequest(`/files/${fileId}`, 'PATCH', updates);
  }

  async deleteFile(fileId: string) {
    return this.makeRequest(`/files/${fileId}`, 'DELETE');
  }

  async deleteMultipleFiles(fileIds: string[]) {
    return this.makeRequest('/files/bulk-delete', 'POST', { fileIds });
  }

  async listFiles(options: {
    path?: string;
    searchQuery?: string;
    fileType?: 'all' | 'image' | 'non-image';
    limit?: number;
    skip?: number;
    sort?: string;
    tags?: string[];
  } = {}) {
    const params = new URLSearchParams();

    if (options.path) params.append('path', options.path);
    if (options.searchQuery) params.append('searchQuery', options.searchQuery);
    if (options.fileType) params.append('fileType', options.fileType);
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.skip) params.append('skip', options.skip.toString());
    if (options.sort) params.append('sort', options.sort);

    const queryString = params.toString();
    const endpoint = `/files${queryString ? `?${queryString}` : ''}`;

    return this.makeRequest(endpoint);
  }

  // Folder operations
  async createFolder(folderName: string, parentFolderPath: string = '/') {
    // Ensure parent folder path ends with /
    const normalizedPath = parentFolderPath.endsWith('/') ? parentFolderPath : `${parentFolderPath}/`;

    return this.makeRequest('/folder', 'POST', {
      folderName,
      parentFolderPath: normalizedPath,
    });
  }

  async deleteFolder(folderPath: string) {
    return this.makeRequest(`/folder`, 'DELETE', { folderPath });
  }

  async copyFolder(sourceFolderPath: string, destinationPath: string) {
    return this.makeRequest('/folder/copy', 'POST', {
      sourceFolderPath,
      destinationPath,
    });
  }

  async moveFolder(sourceFolderPath: string, destinationPath: string) {
    return this.makeRequest('/folder/move', 'POST', {
      sourceFolderPath,
      destinationPath,
    });
  }

  async renameFolder(currentFolderPath: string, newFolderName: string) {
    return this.makeRequest('/folder/rename', 'POST', {
      currentFolderPath,
      newFolderName,
    });
  }

  // Bulk operations
  async addTags(fileIds: string[], tags: string[]) {
    return this.makeRequest('/files/add-tags', 'POST', {
      fileIds,
      tags,
    });
  }

  async removeTags(fileIds: string[], tags: string[]) {
    return this.makeRequest('/files/remove-tags', 'POST', {
      fileIds,
      tags,
    });
  }

  async removeAITags(fileIds: string[], AITags: string[]) {
    return this.makeRequest('/files/remove-ai-tags', 'POST', {
      fileIds,
      AITags,
    });
  }

  // Bulk job status
  async getBulkJobStatus(jobId: string) {
    return this.makeRequest(`/bulk-job/${jobId}`);
  }
}

const imagekit = new ImageKitAPI();

// Folder structure constants
export const FOLDERS = {
  ROOT: '/doosplit',
  USER_PROFILES: '/doosplit/user-profiles/',
  EXPENSE_IMAGES: '/doosplit/expense-images/',
  GENERAL_IMAGES: '/doosplit/general/',
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
  isPrivateFile?: boolean;
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
  file: Buffer | string | File,
  originalName: string,
  options: UploadOptions
): Promise<ImageReference> {
  try {
    // Validate image if it's a Buffer
    if (Buffer.isBuffer(file) || typeof file === 'string') {
      validateImage(file, options);
    }

    // Check expense image limit
    if (options.type === ImageType.EXPENSE) {
      await checkExpenseImageLimit(options.entityId);
    }

    // Generate unique filename
    const uniqueName = options.customName || generateUniqueFilename(originalName, options.type, options.entityId);

    // Get folder path
    const folder = getFolderPath(options.type);

    // Prepare tags
    const defaultTags = [options.type, `entity-${options.entityId}`, `ref-${uuidv4()}`];
    if (options.type === ImageType.EXPENSE) {
      defaultTags.push(`expense-${options.entityId}`);
    }
    const allTags = [...defaultTags, ...(options.tags || [])];

    // Convert file to proper format for upload
    let fileToUpload: File | Buffer;
    if (file instanceof File) {
      fileToUpload = file;
    } else if (Buffer.isBuffer(file)) {
      fileToUpload = file;
    } else if (typeof file === 'string' && file.startsWith('data:')) {
      // Convert base64 to buffer
      const base64Data = file.split(',')[1];
      fileToUpload = Buffer.from(base64Data, 'base64');
    } else {
      throw new Error('Invalid file format');
    }

    // Upload to ImageKit
    const uploadResult = await imagekit.uploadFile(fileToUpload, uniqueName, {
      folder: folder,
      tags: allTags,
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
    // Search ImageKit by tags using the reference ID
    const files = await imagekit.listFiles({
      searchQuery: `tags:"ref-${referenceId}"`,
      limit: 1,
    });

    if (!files || files.length === 0) {
      return null;
    }

    const file = files[0];

    // Extract type and entityId from tags
    let type = ImageType.GENERAL;
    let entityId = '';

    if (file.tags) {
      for (const tag of file.tags) {
        if (tag.startsWith('entity-')) {
          entityId = tag.replace('entity-', '');
        } else if (Object.values(ImageType).includes(tag as ImageType)) {
          type = tag as ImageType;
        }
      }
    }

    return {
      id: referenceId,
      fileId: file.fileId,
      url: file.url,
      name: file.name,
      type: type,
      entityId: entityId,
      size: file.size || 0,
      format: file.name.split('.').pop() || 'jpg',
      uploadedAt: new Date(file.createdAt || Date.now()),
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
      sort: 'DESC_CREATED', // Most recent first
    });

    return files.map((file: any) => {
      // Extract type from tags if not provided
      let actualType = type || ImageType.GENERAL;
      if (!type && file.tags) {
        for (const tag of file.tags) {
          if (Object.values(ImageType).includes(tag as ImageType)) {
            actualType = tag as ImageType;
            break;
          }
        }
      }

      // Extract reference ID from tags
      let referenceId = uuidv4(); // fallback
      if (file.tags) {
        for (const tag of file.tags) {
          if (tag.startsWith('ref-')) {
            referenceId = tag.replace('ref-', '');
            break;
          }
        }
      }

      return {
        id: referenceId,
        fileId: file.fileId,
        url: file.url,
        name: file.name,
        type: actualType,
        entityId: entityId,
        size: file.size || 0,
        format: file.name.split('.').pop() || 'jpg',
        uploadedAt: new Date(file.createdAt || Date.now()),
        tags: file.tags || [],
      };
    });

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
      console.warn(`⚠️ Image not found for reference ID: ${referenceId}`);
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
    console.log('🔄 Initializing ImageKit folders...');

    // Check if root folder exists by trying to list files in it
    const existingFiles = await imagekit.listFiles({
      path: '/doosplit',
      limit: 1
    });

    if (existingFiles && existingFiles.length > 0) {
      console.log('ℹ️ ImageKit folders already exist');
      return;
    }

    // Create main doosplit folder
    console.log('📁 Creating root folder: /doosplit');
    await imagekit.createFolder('doosplit', '/');

    // Create subfolders
    const subfolders = [
      { name: 'user-profiles', path: '/doosplit/' },
      { name: 'expense-images', path: '/doosplit/' },
      { name: 'general', path: '/doosplit/' }
    ];

    for (const folder of subfolders) {
      console.log(`📁 Creating subfolder: ${folder.path}${folder.name}`);
      await imagekit.createFolder(folder.name, folder.path);
    }

    console.log('✅ ImageKit folders initialized successfully');
  } catch (error: any) {
    // Folders might already exist, which is fine
    if (error.message?.includes('already exists') || error.message?.includes('exists')) {
      console.log('ℹ️ ImageKit folders already exist');
    } else {
      console.error('❌ Error initializing folders:', error.message);
      throw error;
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
    // Get all files in the doosplit folder structure
    const allFiles = await imagekit.listFiles({
      path: '/doosplit',
      limit: 1000, // Adjust as needed
    });

    const stats = {
      totalImages: allFiles.length,
      totalSize: allFiles.reduce((sum: number, file: any) => sum + (file.size || 0), 0),
      imagesByType: {
        [ImageType.USER_PROFILE]: 0,
        [ImageType.EXPENSE]: 0,
        [ImageType.GENERAL]: 0,
      },
    };

    // Count by type based on tags or file path
    allFiles.forEach((file: any) => {
      let type = ImageType.GENERAL;

      // Check tags first
      if (file.tags) {
        for (const tag of file.tags) {
          if (Object.values(ImageType).includes(tag as ImageType)) {
            type = tag as ImageType;
            break;
          }
        }
      }

      // Fallback to path-based detection
      if (type === ImageType.GENERAL) {
        if (file.filePath?.includes('/user-profiles/')) {
          type = ImageType.USER_PROFILE;
        } else if (file.filePath?.includes('/expense-images/')) {
          type = ImageType.EXPENSE;
        }
      }

      stats.imagesByType[type]++;
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