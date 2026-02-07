import bcrypt from "bcryptjs";
import dbConnect from "./db";
import User from "@/models/User";
import crypto from "crypto";

/**
 * Seed admin user from environment variables
 * ADMIN_EMAIL and ADMIN_PASSWORD must be set in environment
 */
export async function seedAdminUser() {
  try {
    await dbConnect();

    // Get admin credentials from environment variables
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const adminName = process.env.ADMIN_NAME || "Admin";

    // Validate environment variables
    if (!adminEmail || !adminPassword) {
      console.warn(
        "⚠️ ADMIN_EMAIL and ADMIN_PASSWORD not set in environment variables. Skipping admin user creation."
      );
      return;
    }

    // Validate email format
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(adminEmail)) {
      console.error("❌ Invalid ADMIN_EMAIL format");
      return;
    }

    // Validate password strength
    if (adminPassword.length < 8) {
      console.error("❌ ADMIN_PASSWORD must be at least 8 characters long");
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

      // Update password if ADMIN_PASSWORD_UPDATE flag is set
      if (process.env.ADMIN_PASSWORD_UPDATE === "true") {
        const hashedPassword = await bcrypt.hash(adminPassword, 12);
        existingAdmin.password = hashedPassword;
        await existingAdmin.save();
        console.log("✅ Admin password updated");
      }
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
