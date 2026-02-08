/**
 * ImageKit.io CRUD Operations
 * Complete implementation of Create, Read, Update, Delete operations
 * 
 * Prerequisites:
 * npm install imagekit
 */

const ImageKit = require('imagekit');
const fs = require('fs');
const path = require('path');

// ============================================
// IMAGEKIT CONFIGURATION WITH CREDENTIALS
// ============================================
const imagekit = new ImageKit({
  urlEndpoint: 'https://ik.imagekit.io/camhdr',
  publicKey: 'public_fotFZX2VhvZjaJuGaTiCDQvstP0=',
  privateKey: 'private_3QuRigyMS2nDaHYfYpZpVp0OWiU=',
});

// ============================================
// CREATE OPERATIONS
// ============================================

/**
 * Upload image from local file
 * @param {string} filePath - Local file path
 * @param {string} fileName - Destination file name
 * @param {string} folder - ImageKit folder path (optional)
 * @returns {Promise<Object>} Upload result
 */
async function uploadImageFromFile(filePath, fileName, folder = '') {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    
    const uploadResult = await imagekit.upload({
      file: fileBuffer,
      fileName: fileName,
      folder: folder,
      useUniqueFileName: true,
      tags: ['wallpaper', 'uploaded'],
      responseFields: 'tags,customCoordinates,isPrivateFile,metadata',
    });

    console.log('✅ Upload successful:', uploadResult.name);
    return uploadResult;
  } catch (error) {
    console.error('❌ Upload error:', error.message);
    throw error;
  }
}

/**
 * Upload image from base64 string
 * @param {string} base64String - Base64 encoded image
 * @param {string} fileName - Destination file name
 * @param {string} folder - ImageKit folder path (optional)
 * @returns {Promise<Object>} Upload result
 */
async function uploadImageFromBase64(base64String, fileName, folder = '') {
  try {
    const uploadResult = await imagekit.upload({
      file: base64String,
      fileName: fileName,
      folder: folder,
      useUniqueFileName: true,
      tags: ['wallpaper', 'base64'],
    });

    console.log('✅ Base64 upload successful:', uploadResult.name);
    return uploadResult;
  } catch (error) {
    console.error('❌ Base64 upload error:', error.message);
    throw error;
  }
}

/**
 * Upload image from URL
 * @param {string} imageUrl - Source image URL
 * @param {string} fileName - Destination file name
 * @param {string} folder - ImageKit folder path (optional)
 * @returns {Promise<Object>} Upload result
 */
async function uploadImageFromURL(imageUrl, fileName, folder = '') {
  try {
    const uploadResult = await imagekit.upload({
      file: imageUrl,
      fileName: fileName,
      folder: folder,
      useUniqueFileName: true,
      tags: ['wallpaper', 'url'],
    });

    console.log('✅ URL upload successful:', uploadResult.name);
    return uploadResult;
  } catch (error) {
    console.error('❌ URL upload error:', error.message);
    throw error;
  }
}

/**
 * Bulk upload multiple images
 * @param {Array<Object>} files - Array of file objects [{path, name, folder}]
 * @returns {Promise<Array>} Array of upload results
 */
async function bulkUploadImages(files) {
  const results = [];
  
  for (const file of files) {
    try {
      const result = await uploadImageFromFile(file.path, file.name, file.folder);
      results.push({ success: true, data: result });
    } catch (error) {
      results.push({ success: false, error: error.message, file: file.name });
    }
  }
  
  console.log(`✅ Bulk upload completed: ${results.filter(r => r.success).length}/${files.length} successful`);
  return results;
}

// ============================================
// READ OPERATIONS
// ============================================

/**
 * List all files with optional filters
 * @param {Object} options - Filter options
 * @returns {Promise<Array>} List of files
 */
async function listFiles(options = {}) {
  try {
    const defaultOptions = {
      skip: 0,
      limit: 100,
      ...options,
    };

    const filesList = await imagekit.listFiles(defaultOptions);
    console.log(`✅ Found ${filesList.length} files`);
    return filesList;
  } catch (error) {
    console.error('❌ List files error:', error.message);
    throw error;
  }
}

/**
 * List files from specific folder
 * @param {string} folderPath - Folder path (e.g., "Special wallpaper")
 * @returns {Promise<Array>} List of files in folder
 */
async function listFilesFromFolder(folderPath) {
  try {
    const files = await imagekit.listFiles({
      path: folderPath,
      limit: 1000,
    });

    console.log(`✅ Found ${files.length} files in folder: ${folderPath}`);
    return files;
  } catch (error) {
    console.error('❌ List folder files error:', error.message);
    throw error;
  }
}

/**
 * Get file details by file ID
 * @param {string} fileId - ImageKit file ID
 * @returns {Promise<Object>} File details
 */
async function getFileDetails(fileId) {
  try {
    const fileDetails = await imagekit.getFileDetails(fileId);
    console.log('✅ File details retrieved:', fileDetails.name);
    return fileDetails;
  } catch (error) {
    console.error('❌ Get file details error:', error.message);
    throw error;
  }
}

/**
 * Get file metadata
 * @param {string} fileId - ImageKit file ID
 * @returns {Promise<Object>} File metadata
 */
async function getFileMetadata(fileId) {
  try {
    const metadata = await imagekit.getFileMetadata(fileId);
    console.log('✅ Metadata retrieved for file');
    return metadata;
  } catch (error) {
    console.error('❌ Get metadata error:', error.message);
    throw error;
  }
}

/**
 * Search files by tags
 * @param {Array<string>} tags - Array of tags to search
 * @returns {Promise<Array>} Filtered files
 */
async function searchFilesByTags(tags) {
  try {
    const files = await imagekit.listFiles({
      tags: tags.join(','),
      limit: 500,
    });

    console.log(`✅ Found ${files.length} files with tags: ${tags.join(', ')}`);
    return files;
  } catch (error) {
    console.error('❌ Search by tags error:', error.message);
    throw error;
  }
}

/**
 * Search files by name pattern
 * @param {string} searchQuery - Search query string
 * @returns {Promise<Array>} Matching files
 */
async function searchFilesByName(searchQuery) {
  try {
    const files = await imagekit.listFiles({
      searchQuery: `name="${searchQuery}"`,
      limit: 500,
    });

    console.log(`✅ Found ${files.length} files matching: ${searchQuery}`);
    return files;
  } catch (error) {
    console.error('❌ Search by name error:', error.message);
    throw error;
  }
}

/**
 * Get URL for image with transformations
 * @param {string} imagePath - Image path in ImageKit
 * @param {Object} transformations - Transformation options
 * @returns {string} Transformed image URL
 */
function getImageURL(imagePath, transformations = {}) {
  const url = imagekit.url({
    path: imagePath,
    transformation: [transformations],
  });

  console.log('✅ Generated URL:', url);
  return url;
}

// ============================================
// UPDATE OPERATIONS
// ============================================

/**
 * Update file details (tags, custom coordinates, etc.)
 * @param {string} fileId - ImageKit file ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} Updated file details
 */
async function updateFileDetails(fileId, updateData) {
  try {
    const updatedFile = await imagekit.updateFileDetails(fileId, updateData);
    console.log('✅ File updated successfully:', updatedFile.name);
    return updatedFile;
  } catch (error) {
    console.error('❌ Update file error:', error.message);
    throw error;
  }
}

/**
 * Add tags to file
 * @param {string} fileId - ImageKit file ID
 * @param {Array<string>} newTags - Tags to add
 * @returns {Promise<Object>} Updated file
 */
async function addTagsToFile(fileId, newTags) {
  try {
    const fileDetails = await imagekit.getFileDetails(fileId);
    const existingTags = fileDetails.tags || [];
    const updatedTags = [...new Set([...existingTags, ...newTags])];

    const result = await imagekit.updateFileDetails(fileId, {
      tags: updatedTags,
    });

    console.log('✅ Tags added successfully');
    return result;
  } catch (error) {
    console.error('❌ Add tags error:', error.message);
    throw error;
  }
}

/**
 * Remove tags from file
 * @param {string} fileId - ImageKit file ID
 * @param {Array<string>} tagsToRemove - Tags to remove
 * @returns {Promise<Object>} Updated file
 */
async function removeTagsFromFile(fileId, tagsToRemove) {
  try {
    const fileDetails = await imagekit.getFileDetails(fileId);
    const existingTags = fileDetails.tags || [];
    const updatedTags = existingTags.filter(tag => !tagsToRemove.includes(tag));

    const result = await imagekit.updateFileDetails(fileId, {
      tags: updatedTags,
    });

    console.log('✅ Tags removed successfully');
    return result;
  } catch (error) {
    console.error('❌ Remove tags error:', error.message);
    throw error;
  }
}

/**
 * Move/Rename file
 * @param {string} fileId - ImageKit file ID
 * @param {string} newPath - New file path/name
 * @returns {Promise<Object>} Updated file
 */
async function moveOrRenameFile(fileId, newPath) {
  try {
    const result = await imagekit.updateFileDetails(fileId, {
      filePath: newPath,
    });

    console.log('✅ File moved/renamed successfully');
    return result;
  } catch (error) {
    console.error('❌ Move/rename error:', error.message);
    throw error;
  }
}

/**
 * Update custom coordinates for image
 * @param {string} fileId - ImageKit file ID
 * @param {string} coordinates - Custom coordinates (format: "x,y,width,height")
 * @returns {Promise<Object>} Updated file
 */
async function updateCustomCoordinates(fileId, coordinates) {
  try {
    const result = await imagekit.updateFileDetails(fileId, {
      customCoordinates: coordinates,
    });

    console.log('✅ Custom coordinates updated');
    return result;
  } catch (error) {
    console.error('❌ Update coordinates error:', error.message);
    throw error;
  }
}

// ============================================
// DELETE OPERATIONS
// ============================================

/**
 * Delete single file
 * @param {string} fileId - ImageKit file ID
 * @returns {Promise<void>}
 */
async function deleteFile(fileId) {
  try {
    await imagekit.deleteFile(fileId);
    console.log('✅ File deleted successfully:', fileId);
  } catch (error) {
    console.error('❌ Delete file error:', error.message);
    throw error;
  }
}

/**
 * Delete multiple files in bulk
 * @param {Array<string>} fileIds - Array of file IDs
 * @returns {Promise<Array>} Deletion results
 */
async function bulkDeleteFiles(fileIds) {
  try {
    const result = await imagekit.bulkDeleteFiles(fileIds);
    console.log(`✅ Bulk delete successful: ${result.successfullyDeletedFileIds.length} files deleted`);
    return result;
  } catch (error) {
    console.error('❌ Bulk delete error:', error.message);
    throw error;
  }
}

/**
 * Delete all files from a folder
 * @param {string} folderPath - Folder path to clear
 * @returns {Promise<Object>} Deletion result
 */
async function deleteAllFilesFromFolder(folderPath) {
  try {
    const files = await listFilesFromFolder(folderPath);
    const fileIds = files.map(file => file.fileId);

    if (fileIds.length === 0) {
      console.log('⚠️  No files to delete in folder:', folderPath);
      return { deleted: 0 };
    }

    const result = await imagekit.bulkDeleteFiles(fileIds);
    console.log(`✅ Deleted all files from folder: ${folderPath}`);
    return result;
  } catch (error) {
    console.error('❌ Delete folder files error:', error.message);
    throw error;
  }
}

/**
 * Delete files by tag
 * @param {Array<string>} tags - Tags to match for deletion
 * @returns {Promise<Object>} Deletion result
 */
async function deleteFilesByTags(tags) {
  try {
    const files = await searchFilesByTags(tags);
    const fileIds = files.map(file => file.fileId);

    if (fileIds.length === 0) {
      console.log('⚠️  No files found with specified tags');
      return { deleted: 0 };
    }

    const result = await imagekit.bulkDeleteFiles(fileIds);
    console.log(`✅ Deleted ${result.successfullyDeletedFileIds.length} files with tags: ${tags.join(', ')}`);
    return result;
  } catch (error) {
    console.error('❌ Delete by tags error:', error.message);
    throw error;
  }
}

/**
 * Delete folder
 * @param {string} folderPath - Folder path to delete
 * @returns {Promise<void>}
 */
async function deleteFolder(folderPath) {
  try {
    await imagekit.deleteFolder(folderPath);
    console.log('✅ Folder deleted successfully:', folderPath);
  } catch (error) {
    console.error('❌ Delete folder error:', error.message);
    throw error;
  }
}

// ============================================
// FOLDER OPERATIONS
// ============================================

/**
 * Create folder
 * @param {string} folderName - Folder name
 * @param {string} parentFolderPath - Parent folder path (optional)
 * @returns {Promise<void>}
 */
async function createFolder(folderName, parentFolderPath = '') {
  try {
    await imagekit.createFolder({
      folderName: folderName,
      parentFolderPath: parentFolderPath,
    });
    console.log('✅ Folder created:', folderName);
  } catch (error) {
    console.error('❌ Create folder error:', error.message);
    throw error;
  }
}

/**
 * Copy folder
 * @param {string} sourceFolderPath - Source folder path
 * @param {string} destinationPath - Destination path
 * @returns {Promise<Object>} Copy result
 */
async function copyFolder(sourceFolderPath, destinationPath) {
  try {
    const result = await imagekit.copyFolder({
      sourceFolderPath: sourceFolderPath,
      destinationPath: destinationPath,
    });
    console.log('✅ Folder copied successfully');
    return result;
  } catch (error) {
    console.error('❌ Copy folder error:', error.message);
    throw error;
  }
}

/**
 * Move folder
 * @param {string} sourceFolderPath - Source folder path
 * @param {string} destinationPath - Destination path
 * @returns {Promise<Object>} Move result
 */
async function moveFolder(sourceFolderPath, destinationPath) {
  try {
    const result = await imagekit.moveFolder({
      sourceFolderPath: sourceFolderPath,
      destinationPath: destinationPath,
    });
    console.log('✅ Folder moved successfully');
    return result;
  } catch (error) {
    console.error('❌ Move folder error:', error.message);
    throw error;
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get authentication parameters for client-side upload
 * @returns {Promise<Object>} Authentication parameters
 */
async function getAuthenticationParameters() {
  try {
    const authParams = imagekit.getAuthenticationParameters();
    console.log('✅ Authentication parameters generated');
    return authParams;
  } catch (error) {
    console.error('❌ Get auth params error:', error.message);
    throw error;
  }
}

/**
 * Purge CDN cache for specific URL
 * @param {string} url - ImageKit URL to purge
 * @returns {Promise<Object>} Purge result
 */
async function purgeCDNCache(url) {
  try {
    const result = await imagekit.purgeCache(url);
    console.log('✅ CDN cache purged for:', url);
    return result;
  } catch (error) {
    console.error('❌ Purge cache error:', error.message);
    throw error;
  }
}

/**
 * Get CDN cache status
 * @param {string} requestId - Purge request ID
 * @returns {Promise<Object>} Cache status
 */
async function getCacheStatus(requestId) {
  try {
    const status = await imagekit.getPurgeCacheStatus(requestId);
    console.log('✅ Cache status retrieved');
    return status;
  } catch (error) {
    console.error('❌ Get cache status error:', error.message);
    throw error;
  }
}

// ============================================
// EXAMPLE USAGE / DEMO
// ============================================

async function demonstrateCRUDOperations() {
  console.log('\n🚀 ImageKit.io CRUD Operations Demo\n');
  
  try {
    // ========== CREATE ==========
    console.log('\n📁 CREATE OPERATIONS\n');
    
    // Create a folder
    // await createFolder('demo-folder');
    
    // Upload from URL (example)
    // const uploadedFile = await uploadImageFromURL(
    //   'https://images.pexels.com/photos/1629236/pexels-photo-1629236.jpeg',
    //   'demo-image.jpg',
    //   'demo-folder'
    // );
    // const fileId = uploadedFile.fileId;

    // ========== READ ==========
    console.log('\n📖 READ OPERATIONS\n');
    
    // List files from "Special wallpaper" folder
    const specialWallpapers = await listFilesFromFolder('Special wallpaper');
    console.log(`Total wallpapers in "Special wallpaper": ${specialWallpapers.length}`);
    
    // List first 10 files
    const recentFiles = await listFiles({ limit: 10 });
    console.log(`\nRecent files (${recentFiles.length}):`);
    recentFiles.forEach((file, index) => {
      console.log(`  ${index + 1}. ${file.name} (ID: ${file.fileId})`);
    });

    // Get file details (if files exist)
    if (recentFiles.length > 0) {
      const firstFile = recentFiles[0];
      const details = await getFileDetails(firstFile.fileId);
      console.log(`\nFile details for "${details.name}":`);
      console.log(`  Size: ${details.size} bytes`);
      console.log(`  Format: ${details.fileType}`);
      console.log(`  URL: ${details.url}`);
    }

    // ========== UPDATE ==========
    console.log('\n✏️  UPDATE OPERATIONS\n');
    
    // Update file tags (uncomment and use actual fileId)
    // await addTagsToFile(fileId, ['demo', 'test', 'wallpaper']);
    
    // ========== DELETE ==========
    console.log('\n🗑️  DELETE OPERATIONS\n');
    
    // Delete file (uncomment to use)
    // await deleteFile(fileId);
    
    // Delete folder (uncomment to use)
    // await deleteFolder('demo-folder');
    
    console.log('\n✅ Demo completed successfully!\n');
    
  } catch (error) {
    console.error('\n❌ Demo failed:', error.message);
  }
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Configuration
  imagekit,
  
  // Create operations
  uploadImageFromFile,
  uploadImageFromBase64,
  uploadImageFromURL,
  bulkUploadImages,
  
  // Read operations
  listFiles,
  listFilesFromFolder,
  getFileDetails,
  getFileMetadata,
  searchFilesByTags,
  searchFilesByName,
  getImageURL,
  
  // Update operations
  updateFileDetails,
  addTagsToFile,
  removeTagsFromFile,
  moveOrRenameFile,
  updateCustomCoordinates,
  
  // Delete operations
  deleteFile,
  bulkDeleteFiles,
  deleteAllFilesFromFolder,
  deleteFilesByTags,
  deleteFolder,
  
  // Folder operations
  createFolder,
  copyFolder,
  moveFolder,
  
  // Utility functions
  getAuthenticationParameters,
  purgeCDNCache,
  getCacheStatus,
  
  // Demo
  demonstrateCRUDOperations,
};

// Run demo if executed directly
if (require.main === module) {
  demonstrateCRUDOperations();
}
