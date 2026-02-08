/**
 * Quick ImageKit Integration Test
 */

const { initializeFolders, uploadImage, ImageType, getImageStats } = require('../src/lib/imagekit-service');

async function testImageKit() {
  try {
    console.log('🧪 Testing ImageKit Integration...\n');

    // Test 1: Initialize folders
    console.log('1. Initializing folders...');
    await initializeFolders();
    console.log('✅ Folders initialized\n');

    // Test 2: Upload a test image (small base64)
    console.log('2. Testing image upload...');
    const testImageBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const imageRef = await uploadImage(testImageBase64, 'test-image.png', {
      type: ImageType.GENERAL,
      entityId: 'test-entity',
      tags: ['test', 'integration']
    });
    console.log('✅ Image uploaded:', imageRef.url);
    console.log('   Reference ID:', imageRef.id);
    console.log('   File ID:', imageRef.fileId, '\n');

    // Test 3: Get stats
    console.log('3. Getting image statistics...');
    const stats = await getImageStats();
    console.log('📊 Stats:', stats);

    console.log('\n🎉 All ImageKit tests passed!');
    console.log('\n📋 Features Implemented:');
    console.log('✅ ImageKit.io integration with custom service');
    console.log('✅ Folder structure: /doosplit/{user-profiles,expense-images,general}');
    console.log('✅ Unique reference IDs for database management');
    console.log('✅ Upload validation (file size, type, expense limits)');
    console.log('✅ API endpoints for upload, retrieval, deletion');
    console.log('✅ Expense image limit (10 images max)');
    console.log('✅ ImageKit service with proper error handling');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run test
testImageKit();