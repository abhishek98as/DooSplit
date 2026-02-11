import bcrypt from "bcryptjs";
import crypto from "crypto";
import User from "@/models/User";
import dbConnect from "./db";

interface SeedAdminOptions {
  forceReset?: boolean;
  skipDbConnect?: boolean;
}

/**
 * Seed admin user with hardcoded credentials.
 * Creates admin user: abhishek98as@gmail.com / Abhi@1357#
 */
export async function seedAdminUser(options: SeedAdminOptions = {}) {
  const { forceReset = false, skipDbConnect = false } = options;

  try {
    if (!skipDbConnect) {
      await dbConnect();
    }

    const adminEmail = "abhishek98as@gmail.com";
    const adminPassword = "Abhi@1357#";
    const adminName = "Admin";

    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(adminEmail)) {
      console.error("Invalid admin email format");
      return;
    }

    if (adminPassword.length < 8) {
      console.error("Admin password must be at least 8 characters long");
      return;
    }

    const existingAdmin = await User.findOne({ email: adminEmail.toLowerCase() });

    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash(adminPassword, 12);

      await User.create({
        email: adminEmail.toLowerCase(),
        password: hashedPassword,
        name: adminName,
        role: "admin",
        emailVerified: true,
        isActive: true,
      });

      console.log(`Admin user created successfully: ${adminEmail}`);
      return;
    }

    console.log(`Admin user already exists: ${adminEmail}`);

    // Manual emergency path. Keep this out of login requests.
    if (forceReset) {
      const hashedPassword = await bcrypt.hash(adminPassword, 12);
      existingAdmin.password = hashedPassword;
      existingAdmin.name = adminName;
      existingAdmin.role = "admin";
      existingAdmin.emailVerified = true;
      existingAdmin.isActive = true;
      existingAdmin.authProvider = "email";
      await existingAdmin.save();
      console.log("Admin user force-reset completed");
    }
  } catch (error) {
    console.error("Failed to seed admin user:", error);
  }
}

/**
 * Generate a secure random password for admin.
 * Use this to create initial admin password.
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
