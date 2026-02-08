#!/usr/bin/env node

/**
 * ImageKit Setup Script
 *
 * Initializes ImageKit folders and runs basic tests
 */

// Dynamic import for ES modules
async function setupImageKit() {
  try {
    const { initializeFolders, getImageStats } = await import('../src/lib/imagekit-service.ts');

    console.log('🚀 Setting up ImageKit integration...\n');

    // Initialize folders
    console.log('📁 Creating ImageKit folders...');
    await initializeFolders();
    console.log('✅ Folders created successfully\n');

    // Get initial stats
    console.log('📊 Getting initial statistics...');
    const stats = await getImageStats();
    console.log('📈 Current ImageKit Stats:');
    console.log(`   Total Images: ${stats.totalImages}`);
    console.log(`   Total Size: ${(stats.totalSize / (1024 * 1024)).toFixed(2)} MB`);
    console.log('   Images by Type:');
    Object.entries(stats.imagesByType).forEach(([type, count]) => {
      console.log(`     ${type}: ${count}`);
    });

    console.log('\n🎉 ImageKit setup completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('1. Update your application to use the image upload endpoints');
    console.log('2. Test image uploads via the API');
    console.log('3. Run comprehensive tests: node tests/run-imagekit-tests.js');

  } catch (error) {
    console.error('❌ ImageKit setup failed:', error.message);
    process.exit(1);
  }
}

// Run setup
setupImageKit();

async function setupImageKit() {
  try {
    console.log('🚀 Setting up ImageKit integration...\n');

    // Initialize folders
    console.log('📁 Creating ImageKit folders...');
    await initializeFolders();
    console.log('✅ Folders created successfully\n');

    // Get initial stats
    console.log('📊 Getting initial statistics...');
    const stats = await getImageStats();
    console.log('📈 Current ImageKit Stats:');
    console.log(`   Total Images: ${stats.totalImages}`);
    console.log(`   Total Size: ${(stats.totalSize / (1024 * 1024)).toFixed(2)} MB`);
    console.log('   Images by Type:');
    Object.entries(stats.imagesByType).forEach(([type, count]) => {
      console.log(`     ${type}: ${count}`);
    });

    console.log('\n🎉 ImageKit setup completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('1. Update your application to use the image upload endpoints');
    console.log('2. Test image uploads via the API');
    console.log('3. Run comprehensive tests: node tests/run-imagekit-tests.js');

  } catch (error) {
    console.error('❌ ImageKit setup failed:', error.message);
    process.exit(1);
  }
}

// Run setup
setupImageKit();