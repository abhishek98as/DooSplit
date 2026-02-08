/**
 * ImageKit Integration Test Suite
 *
 * Comprehensive tests for ImageKit.io integration in DooSplit
 * Tests image upload, retrieval, deletion, and validation
 */

const fs = require('fs');
const path = require('path');

// Import our ImageKit service
const {
  uploadImage,
  getImageByReferenceId,
  getImagesForEntity,
  deleteImage,
  deleteImagesForEntity,
  getOptimizedImageUrl,
  initializeFolders,
  getImageStats,
  ImageType,
  FOLDERS,
  VALIDATION
} = require('../src/lib/imagekit-service');

describe('ImageKit Integration Tests', () => {
  // Test data
  let testUserId;
  let testExpenseId;
  let uploadedImageRef;
  let uploadedProfileImageRef;

  beforeAll(async () => {
    // Generate test IDs
    testUserId = `test-user-${Date.now()}`;
    testExpenseId = `test-expense-${Date.now()}`;

    // Initialize folders (run once)
    try {
      await initializeFolders();
      console.log('✅ Test setup: Folders initialized');
    } catch (error) {
      console.log('ℹ️ Test setup: Folders may already exist');
    }
  });

  describe('Upload Image Tests', () => {
    test('should upload user profile image successfully', async () => {
      // Create a small test image buffer (1x1 pixel PNG)
      const testImageBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'base64'
      );

      const options = {
        type: ImageType.USER_PROFILE,
        entityId: testUserId,
        tags: ['test', 'profile']
      };

      uploadedProfileImageRef = await uploadImage(testImageBuffer, 'test-profile.png', options);

      expect(uploadedProfileImageRef).toBeDefined();
      expect(uploadedProfileImageRef.id).toBeDefined();
      expect(uploadedProfileImageRef.fileId).toBeDefined();
      expect(uploadedProfileImageRef.url).toContain('ik.imagekit.io');
      expect(uploadedProfileImageRef.type).toBe(ImageType.USER_PROFILE);
      expect(uploadedProfileImageRef.entityId).toBe(testUserId);
      expect(uploadedProfileImageRef.tags).toContain('test');
      expect(uploadedProfileImageRef.tags).toContain('profile');

      console.log('✅ Profile image uploaded:', uploadedProfileImageRef.url);
    });

    test('should upload expense image successfully', async () => {
      const testImageBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'base64'
      );

      const options = {
        type: ImageType.EXPENSE,
        entityId: testExpenseId,
        tags: ['test', 'receipt']
      };

      uploadedImageRef = await uploadImage(testImageBuffer, 'test-expense.jpg', options);

      expect(uploadedImageRef).toBeDefined();
      expect(uploadedImageRef.id).toBeDefined();
      expect(uploadedImageRef.fileId).toBeDefined();
      expect(uploadedImageRef.url).toContain('ik.imagekit.io');
      expect(uploadedImageRef.type).toBe(ImageType.EXPENSE);
      expect(uploadedImageRef.entityId).toBe(testExpenseId);

      console.log('✅ Expense image uploaded:', uploadedImageRef.url);
    });

    test('should enforce 10-image limit for expenses', async () => {
      const testImageBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'base64'
      );

      // Try to upload 11 images (should fail after 10)
      const uploadPromises = [];
      for (let i = 0; i < 11; i++) {
        uploadPromises.push(
          uploadImage(testImageBuffer, `test-expense-${i}.jpg`, {
            type: ImageType.EXPENSE,
            entityId: testExpenseId,
            tags: ['test', 'bulk']
          }).catch(error => error)
        );
      }

      const results = await Promise.all(uploadPromises);

      // First 10 should succeed, 11th should fail
      const successes = results.filter(r => r && !r.message).length;
      const failures = results.filter(r => r && r.message).length;

      expect(successes).toBeLessThanOrEqual(10);
      expect(failures).toBeGreaterThanOrEqual(1);

      console.log(`✅ Bulk upload test: ${successes} successes, ${failures} failures`);
    });

    test('should reject invalid file types', async () => {
      const invalidFile = Buffer.from('invalid file content');

      await expect(
        uploadImage(invalidFile, 'test.txt', {
          type: ImageType.GENERAL,
          entityId: 'test-entity',
        })
      ).rejects.toThrow();
    });

    test('should reject files over size limit', async () => {
      // Create a buffer larger than max size
      const largeBuffer = Buffer.alloc(VALIDATION.MAX_FILE_SIZE + 1);

      await expect(
        uploadImage(largeBuffer, 'large-file.jpg', {
          type: ImageType.GENERAL,
          entityId: 'test-entity',
        })
      ).rejects.toThrow(/File size exceeds/);
    });
  });

  describe('Retrieve Image Tests', () => {
    test('should retrieve image by reference ID', async () => {
      const image = await getImageByReferenceId(uploadedImageRef.id);

      expect(image).toBeDefined();
      expect(image?.id).toBe(uploadedImageRef.id);
      expect(image?.fileId).toBe(uploadedImageRef.fileId);
      expect(image?.url).toBe(uploadedImageRef.url);
      expect(image?.type).toBe(ImageType.EXPENSE);
      expect(image?.entityId).toBe(testExpenseId);
    });

    test('should return null for non-existent image', async () => {
      const image = await getImageByReferenceId('non-existent-id');
      expect(image).toBeNull();
    });

    test('should retrieve all images for entity', async () => {
      const images = await getImagesForEntity(testExpenseId, ImageType.EXPENSE);

      expect(Array.isArray(images)).toBe(true);
      expect(images.length).toBeGreaterThan(0);

      // Check that all images belong to the correct entity and type
      images.forEach(image => {
        expect(image.entityId).toBe(testExpenseId);
        expect(image.type).toBe(ImageType.EXPENSE);
      });
    });

    test('should retrieve all images for entity without type filter', async () => {
      const images = await getImagesForEntity(testUserId);

      expect(Array.isArray(images)).toBe(true);
      expect(images.length).toBeGreaterThan(0);

      // Should include profile images
      const profileImages = images.filter(img => img.type === ImageType.USER_PROFILE);
      expect(profileImages.length).toBeGreaterThan(0);
    });
  });

  describe('Image URL Optimization Tests', () => {
    test('should generate optimized image URL', () => {
      const originalUrl = 'https://ik.imagekit.io/camhdr/doosplit/expense-images/test.jpg';
      const optimizedUrl = getOptimizedImageUrl(originalUrl, {
        width: 400,
        height: 300,
        quality: 80,
      });

      expect(optimizedUrl).toContain('w-400');
      expect(optimizedUrl).toContain('h-300');
      expect(optimizedUrl).toContain('q-80');
      expect(optimizedUrl).toContain(originalUrl);
    });

    test('should return original URL when no transformations', () => {
      const originalUrl = 'https://ik.imagekit.io/camhdr/doosplit/expense-images/test.jpg';
      const optimizedUrl = getOptimizedImageUrl(originalUrl);

      expect(optimizedUrl).toBe(originalUrl);
    });
  });

  describe('Delete Image Tests', () => {
    test('should delete image successfully', async () => {
      const success = await deleteImage(uploadedImageRef.id);

      expect(success).toBe(true);

      // Verify image is deleted
      const image = await getImageByReferenceId(uploadedImageRef.id);
      expect(image).toBeNull();
    });

    test('should return false for non-existent image deletion', async () => {
      const success = await deleteImage('non-existent-id');
      expect(success).toBe(false);
    });

    test('should delete all images for entity', async () => {
      // First upload a few more images
      const testImageBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'base64'
      );

      const uploadPromises = [];
      for (let i = 0; i < 3; i++) {
        uploadPromises.push(
          uploadImage(testImageBuffer, `cleanup-test-${i}.jpg`, {
            type: ImageType.EXPENSE,
            entityId: testExpenseId,
            tags: ['cleanup-test']
          })
        );
      }

      await Promise.all(uploadPromises);

      // Delete all images for the expense
      const deletedCount = await deleteImagesForEntity(testExpenseId, ImageType.EXPENSE);

      expect(deletedCount).toBeGreaterThanOrEqual(3);

      // Verify no images remain
      const remainingImages = await getImagesForEntity(testExpenseId, ImageType.EXPENSE);
      expect(remainingImages.length).toBe(0);
    });
  });

  describe('Statistics Tests', () => {
    test('should get image statistics', async () => {
      const stats = await getImageStats();

      expect(stats).toBeDefined();
      expect(typeof stats.totalImages).toBe('number');
      expect(typeof stats.totalSize).toBe('number');
      expect(typeof stats.imagesByType).toBe('object');
      expect(Object.keys(stats.imagesByType)).toContain(ImageType.USER_PROFILE);
      expect(Object.keys(stats.imagesByType)).toContain(ImageType.EXPENSE);
      expect(Object.keys(stats.imagesByType)).toContain(ImageType.GENERAL);

      console.log('✅ Image stats:', stats);
    });
  });

  describe('Validation Tests', () => {
    test('should validate image types', () => {
      expect(Object.values(ImageType)).toContain(ImageType.USER_PROFILE);
      expect(Object.values(ImageType)).toContain(ImageType.EXPENSE);
      expect(Object.values(ImageType)).toContain(ImageType.GENERAL);
    });

    test('should validate folder constants', () => {
      expect(FOLDERS.ROOT).toBe('/doosplit');
      expect(FOLDERS.USER_PROFILES).toBe('/doosplit/user-profiles');
      expect(FOLDERS.EXPENSE_IMAGES).toBe('/doosplit/expense-images');
      expect(FOLDERS.GENERAL_IMAGES).toBe('/doosplit/general');
    });

    test('should validate limits', () => {
      expect(VALIDATION.MAX_EXPENSE_IMAGES).toBe(10);
      expect(VALIDATION.MAX_FILE_SIZE).toBeGreaterThan(0);
      expect(VALIDATION.ALLOWED_FORMATS.length).toBeGreaterThan(0);
    });
  });

  // Cleanup after all tests
  afterAll(async () => {
    try {
      // Clean up test images
      await deleteImagesForEntity(testUserId, ImageType.USER_PROFILE);
      await deleteImagesForEntity(testExpenseId, ImageType.EXPENSE);

      console.log('✅ Test cleanup completed');
    } catch (error) {
      console.error('❌ Test cleanup failed:', error);
    }
  });
});

// API Integration Tests (if running against live API)
if (process.env.RUN_API_TESTS === 'true') {
  describe('API Integration Tests', () => {
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';

    test('should upload image via API', async () => {
      const testImageBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'base64'
      );

      const formData = new FormData();
      formData.append('file', new Blob([testImageBuffer]), 'test.jpg');
      formData.append('type', ImageType.USER_PROFILE);
      formData.append('entityId', 'api-test-user');

      const response = await fetch(`${baseUrl}/api/images/upload`, {
        method: 'POST',
        body: formData,
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.image).toBeDefined();
      expect(data.image.url).toContain('ik.imagekit.io');
    });

    test('should retrieve images via API', async () => {
      const response = await fetch(`${baseUrl}/api/images/entity/api-test-user?type=${ImageType.USER_PROFILE}`);

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(Array.isArray(data.images)).toBe(true);
      expect(typeof data.count).toBe('number');
    });
  });
}

module.exports = {
  // Export for external usage
  runImageKitTests: () => {
    console.log('🚀 Running ImageKit Integration Tests...');
    // This would be called by a test runner
  }
};