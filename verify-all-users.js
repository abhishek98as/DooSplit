// Script to verify all existing users in the database
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Manually load .env.local
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      // Remove quotes if present
      value = value.replace(/^["']|["']$/g, '');
      process.env[key] = value;
    }
  });
}

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables');
  process.exit(1);
}

const UserSchema = new mongoose.Schema({
  email: String,
  emailVerified: Boolean,
  authProvider: String,
}, { timestamps: true });

const User = mongoose.model('User', UserSchema, 'users');

async function verifyAllUsers() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find all users who are not verified
    const unverifiedUsers = await User.find({
      emailVerified: false,
      authProvider: 'email',
    });

    console.log(`📊 Found ${unverifiedUsers.length} unverified users`);

    if (unverifiedUsers.length === 0) {
      console.log('✅ All users are already verified!');
      await mongoose.disconnect();
      process.exit(0);
    }

    // Update all users to verified
    const result = await User.updateMany(
      {
        emailVerified: false,
        authProvider: 'email',
      },
      {
        $set: { emailVerified: true },
      }
    );

    console.log(`✅ Successfully verified ${result.modifiedCount} users`);
    
    // Show updated users
    const verifiedUsers = await User.find({
      _id: { $in: unverifiedUsers.map(u => u._id) },
    }).select('email emailVerified authProvider');

    console.log('\n📋 Updated users:');
    verifiedUsers.forEach(user => {
      console.log(`  - ${user.email}: emailVerified = ${user.emailVerified}`);
    });

    await mongoose.disconnect();
    console.log('\n✅ Done! All users can now log in.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

verifyAllUsers();
