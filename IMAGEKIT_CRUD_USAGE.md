# ImageKit.io CRUD Operations Guide

Complete JavaScript implementation for ImageKit.io with all CRUD operations.

## 📋 Prerequisites

Install the ImageKit Node.js SDK:

```bash
npm install imagekit
```

## 🔑 Credentials Configuration

The file already includes your ImageKit credentials:
- **URL Endpoint**: `https://ik.imagekit.io/camhdr`
- **Public Key**: `public_fotFZX2VhvZjaJuGaTiCDQvstP0=`
- **Private Key**: `private_3QuRigyMS2nDaHYfYpZpVp0OWiU=`

## 🚀 Quick Start

### Run the Demo

```bash
node imagekit-crud-operations.js
```

### Use in Your Code

```javascript
const imagekitCRUD = require('./imagekit-crud-operations');

// Your code here
```

## 📚 Available Operations

### 1️⃣ CREATE Operations

#### Upload from Local File
```javascript
const { uploadImageFromFile } = require('./imagekit-crud-operations');

const result = await uploadImageFromFile(
  './path/to/image.jpg',    // Local file path
  'my-image.jpg',            // Destination filename
  'Special wallpaper'        // Folder (optional)
);

console.log('Uploaded:', result.url);
console.log('File ID:', result.fileId);
```

#### Upload from Base64
```javascript
const { uploadImageFromBase64 } = require('./imagekit-crud-operations');

const base64String = 'data:image/png;base64,iVBORw0KGgoAAAANS...';

const result = await uploadImageFromBase64(
  base64String,
  'base64-image.png',
  'uploads'
);
```

#### Upload from URL
```javascript
const { uploadImageFromURL } = require('./imagekit-crud-operations');

const result = await uploadImageFromURL(
  'https://example.com/image.jpg',
  'downloaded-image.jpg',
  'Special wallpaper'
);
```

#### Bulk Upload
```javascript
const { bulkUploadImages } = require('./imagekit-crud-operations');

const files = [
  { path: './img1.jpg', name: 'image1.jpg', folder: 'Special wallpaper' },
  { path: './img2.jpg', name: 'image2.jpg', folder: 'Special wallpaper' },
  { path: './img3.jpg', name: 'image3.jpg', folder: 'Special wallpaper' },
];

const results = await bulkUploadImages(files);
console.log(`Uploaded ${results.filter(r => r.success).length} files`);
```

### 2️⃣ READ Operations

#### List All Files
```javascript
const { listFiles } = require('./imagekit-crud-operations');

// Get first 50 files
const files = await listFiles({ limit: 50 });

// With pagination
const moreFiles = await listFiles({ 
  skip: 50, 
  limit: 50 
});
```

#### List Files from Specific Folder
```javascript
const { listFilesFromFolder } = require('./imagekit-crud-operations');

const wallpapers = await listFilesFromFolder('Special wallpaper');

wallpapers.forEach(file => {
  console.log(`${file.name}: ${file.url}`);
});
```

#### Get File Details
```javascript
const { getFileDetails } = require('./imagekit-crud-operations');

const fileId = 'your-file-id-here';
const details = await getFileDetails(fileId);

console.log('Name:', details.name);
console.log('Size:', details.size);
console.log('URL:', details.url);
console.log('Tags:', details.tags);
```

#### Search by Tags
```javascript
const { searchFilesByTags } = require('./imagekit-crud-operations');

const files = await searchFilesByTags(['wallpaper', 'featured']);
console.log(`Found ${files.length} files with specified tags`);
```

#### Search by Name
```javascript
const { searchFilesByName } = require('./imagekit-crud-operations');

const files = await searchFilesByName('profile*');
```

#### Get Transformed Image URL
```javascript
const { getImageURL } = require('./imagekit-crud-operations');

// Get resized image URL
const url = getImageURL('/Special wallpaper/image.jpg', {
  width: 400,
  height: 300,
  quality: 80,
});

// Get blurred thumbnail
const thumbnail = getImageURL('/Special wallpaper/image.jpg', {
  width: 100,
  blur: 10,
});
```

### 3️⃣ UPDATE Operations

#### Update File Details
```javascript
const { updateFileDetails } = require('./imagekit-crud-operations');

const updated = await updateFileDetails('file-id', {
  tags: ['wallpaper', 'nature', 'featured'],
  customCoordinates: '10,10,200,200',
});
```

#### Add Tags
```javascript
const { addTagsToFile } = require('./imagekit-crud-operations');

await addTagsToFile('file-id', ['new-tag', 'premium']);
```

#### Remove Tags
```javascript
const { removeTagsFromFile } = require('./imagekit-crud-operations');

await removeTagsFromFile('file-id', ['old-tag']);
```

#### Move/Rename File
```javascript
const { moveOrRenameFile } = require('./imagekit-crud-operations');

// Rename file
await moveOrRenameFile('file-id', '/Special wallpaper/new-name.jpg');

// Move to different folder
await moveOrRenameFile('file-id', '/Archives/old-image.jpg');
```

#### Update Custom Coordinates
```javascript
const { updateCustomCoordinates } = require('./imagekit-crud-operations');

await updateCustomCoordinates('file-id', '10,20,500,600');
```

### 4️⃣ DELETE Operations

#### Delete Single File
```javascript
const { deleteFile } = require('./imagekit-crud-operations');

await deleteFile('file-id-to-delete');
```

#### Bulk Delete Files
```javascript
const { bulkDeleteFiles } = require('./imagekit-crud-operations');

const fileIds = ['file-id-1', 'file-id-2', 'file-id-3'];
const result = await bulkDeleteFiles(fileIds);

console.log('Deleted:', result.successfullyDeletedFileIds.length);
```

#### Delete All Files from Folder
```javascript
const { deleteAllFilesFromFolder } = require('./imagekit-crud-operations');

await deleteAllFilesFromFolder('old-folder');
```

#### Delete Files by Tags
```javascript
const { deleteFilesByTags } = require('./imagekit-crud-operations');

await deleteFilesByTags(['temporary', 'test']);
```

#### Delete Folder
```javascript
const { deleteFolder } = require('./imagekit-crud-operations');

await deleteFolder('folder-to-delete');
```

### 📁 Folder Operations

#### Create Folder
```javascript
const { createFolder } = require('./imagekit-crud-operations');

// Create root level folder
await createFolder('new-folder');

// Create nested folder
await createFolder('subfolder', 'parent-folder');
```

#### Copy Folder
```javascript
const { copyFolder } = require('./imagekit-crud-operations');

await copyFolder(
  'source-folder',       // Source
  'destination-folder'   // Destination
);
```

#### Move Folder
```javascript
const { moveFolder } = require('./imagekit-crud-operations');

await moveFolder(
  'folder-to-move',
  'new-location'
);
```

### 🔧 Utility Functions

#### Get Authentication Parameters
```javascript
const { getAuthenticationParameters } = require('./imagekit-crud-operations');

const authParams = await getAuthenticationParameters();
// Use for client-side upload authentication
```

#### Purge CDN Cache
```javascript
const { purgeCDNCache } = require('./imagekit-crud-operations');

const result = await purgeCDNCache('https://ik.imagekit.io/camhdr/image.jpg');
console.log('Request ID:', result.requestId);
```

#### Get Cache Status
```javascript
const { getCacheStatus } = require('./imagekit-crud-operations');

const status = await getCacheStatus('request-id');
console.log('Status:', status.status);
```

## 💡 Complete Usage Example

```javascript
const {
  uploadImageFromFile,
  listFilesFromFolder,
  addTagsToFile,
  getImageURL,
  deleteFile,
} = require('./imagekit-crud-operations');

async function manageWallpapers() {
  try {
    // 1. Upload new wallpaper
    console.log('Uploading new wallpaper...');
    const uploaded = await uploadImageFromFile(
      './wallpaper.jpg',
      'sunset-beach.jpg',
      'Special wallpaper'
    );
    console.log('✅ Uploaded:', uploaded.fileId);

    // 2. Add tags
    console.log('Adding tags...');
    await addTagsToFile(uploaded.fileId, ['nature', 'beach', 'sunset']);
    console.log('✅ Tags added');

    // 3. List all wallpapers
    console.log('Fetching wallpapers...');
    const wallpapers = await listFilesFromFolder('Special wallpaper');
    console.log(`✅ Found ${wallpapers.length} wallpapers`);

    // 4. Generate optimized URL
    const optimizedUrl = getImageURL(uploaded.filePath, {
      width: 1080,
      quality: 85,
      format: 'webp',
    });
    console.log('✅ Optimized URL:', optimizedUrl);

    // 5. Delete old files (example)
    // await deleteFile('old-file-id');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

manageWallpapers();
```

## 🎯 Common Use Cases

### 1. Upload User Profile Pictures
```javascript
async function uploadProfilePicture(userId, base64Image) {
  const result = await uploadImageFromBase64(
    base64Image,
    `profile-${userId}.jpg`,
    'user_profile_pictures'
  );
  
  await addTagsToFile(result.fileId, ['profile', userId]);
  return result.url;
}
```

### 2. Batch Process Wallpapers
```javascript
async function processWallpapers() {
  const wallpapers = await listFilesFromFolder('Special wallpaper');
  
  for (const wallpaper of wallpapers) {
    // Add standard tags
    await addTagsToFile(wallpaper.fileId, ['wallpaper', 'processed']);
    
    // Generate thumbnails (URLs)
    const thumbnail = getImageURL(wallpaper.filePath, {
      width: 300,
      height: 300,
      quality: 70,
    });
    
    console.log(`Processed: ${wallpaper.name}`);
  }
}
```

### 3. Clean Old Files
```javascript
async function cleanOldFiles() {
  const files = await searchFilesByTags(['temporary', 'test']);
  
  if (files.length > 0) {
    const fileIds = files.map(f => f.fileId);
    await bulkDeleteFiles(fileIds);
    console.log(`Deleted ${fileIds.length} temporary files`);
  }
}
```

## 📝 Notes

- **File IDs**: Always save the `fileId` returned from upload operations for future reference
- **Folder Paths**: Use forward slashes (/) in folder paths, e.g., `'parent/child'`
- **Tags**: Tags are useful for organizing and filtering files
- **Transformations**: ImageKit supports real-time image transformations via URL parameters
- **Rate Limits**: Be mindful of API rate limits when doing bulk operations

## 🔒 Security Best Practices

1. **Never expose private key in client-side code**
2. Store credentials in environment variables for production:
   ```javascript
   const imagekit = new ImageKit({
     urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
     publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
     privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
   });
   ```
3. Use authentication parameters for client-side uploads
4. Implement proper access controls in your application

## 📖 Resources

- [ImageKit.io Documentation](https://docs.imagekit.io/)
- [Node.js SDK Reference](https://github.com/imagekit-developer/imagekit-nodejs)
- [Image Transformation Guide](https://docs.imagekit.io/features/image-transformations)

## 🐛 Troubleshooting

### Authentication Errors
- Verify your private key is correct
- Ensure your account is active

### Upload Failures
- Check file size limits
- Verify file format is supported
- Ensure folder exists or create it first

### File Not Found
- Verify the file ID is correct
- Check if file was deleted
- Confirm folder path is accurate

---

**Happy Coding! 🎉**
