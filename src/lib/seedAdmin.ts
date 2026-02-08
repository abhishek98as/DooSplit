import bcrypt from "bcryptjs";
import dbConnect from "./db";
import User from "@/models/User";
import crypto from "crypto";

/**
 * Seed admin user with hardcoded credentials
 * Creates admin user: abhishek98as@gmail.com / Abhi@1357#
 */
export async function seedAdminUser() {
  try {
    await dbConnect();

    // Hardcoded admin credentials
    const adminEmail = "abhishek98as@gmail.com";
    const adminPassword = "Abhi@1357#";
    const adminName = "Admin";

    // Validate email format
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(adminEmail)) {
      console.error("❌ Invalid admin email format");
      return;
    }

    // Validate password strength
    if (adminPassword.length < 8) {
      console.error("❌ Admin password must be at least 8 characters long");
      return;
    }

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: adminEmail.toLowerCase() });

    if (!existingAdmin) {
      // Hash password with high cost factor for admin account
      const hashedPassword = await bcrypt.hash(adminPassword, 12);

      await User.create({
        email: adminEmail.toLowerCase(),
        password: hashedPassword,
        name: adminName,
        role: "admin",
        emailVerified: true,
        isActive: true,
      });

      console.log(`✅ Admin user created successfully: ${adminEmail}`);
    } else {
      console.log(`ℹ️ Admin user already exists: ${adminEmail}`);

      // Always ensure admin has the correct password and settings
      const hashedPassword = await bcrypt.hash(adminPassword, 12);
      existingAdmin.password = hashedPassword;
      existingAdmin.name = adminName;
      existingAdmin.role = "admin";
      existingAdmin.emailVerified = true;
      existingAdmin.isActive = true;
      existingAdmin.authProvider = "email"; // Ensure it's set as email auth
      await existingAdmin.save();
      console.log("✅ Admin user updated with correct credentials");
    }
  } catch (error) {
    console.error("❌ Failed to seed admin user:", error);
  }
}

/**
 * Generate a secure random password for admin
 * Use this to create initial admin password
 */
export function generateSecurePassword(length: number = 16): string {
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  const randomBytes = crypto.randomBytes(length);
  let password = "";

  for (let i = 0; i < length; i++) {
    password += charset[randomBytes[i] % charset.length];
  }

  return password;
}
