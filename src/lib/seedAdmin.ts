import bcrypt from "bcryptjs";
import dbConnect from "./db";
import User from "@/models/User";

export async function seedAdminUser() {
  try {
    await dbConnect();

    const adminEmail = "abhishek98as@gmail.com";
    
    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: adminEmail });
    
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash("Abhi@1357#", 10);
      
      await User.create({
        email: adminEmail,
        password: hashedPassword,
        name: "Admin",
        role: "admin",
        emailVerified: true,
        isActive: true,
      });
      
      console.log("✅ Admin user created successfully");
    } else {
      console.log("ℹ️ Admin user already exists");
    }
  } catch (error) {
    console.error("❌ Failed to seed admin user:", error);
  }
}
