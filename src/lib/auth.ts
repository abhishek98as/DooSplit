import { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import dbConnect from "@/lib/db";
import User from "@/models/User";
import { seedAdminUser } from "./seedAdmin";
import { adminAuth, initError as firebaseInitError } from "./firebase-admin";

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      id: "firebase",
      name: "Firebase",
      credentials: {
        idToken: { label: "ID Token", type: "text" },
        email: { label: "Email", type: "email" },
        name: { label: "Name", type: "text" },
        image: { label: "Image", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.idToken) {
          throw new Error("No Firebase ID token provided");
        }

        if (!adminAuth) {
          console.error("Firebase Admin SDK not initialized:", firebaseInitError);
          throw new Error("Google sign-in is unavailable. Please use email/password login.");
        }

        try {
          // Verify Firebase ID token
          const decodedToken = await adminAuth.verifyIdToken(credentials.idToken);
          const firebaseUid = decodedToken.uid;
          const email = decodedToken.email || credentials.email;
          const name = decodedToken.name || credentials.name || "User";
          const image = decodedToken.picture || credentials.image || null;

          if (!email) {
            throw new Error("No email associated with this account");
          }

          await dbConnect();
          
          // Seed admin user on first login attempt
          await seedAdminUser();

          // Find or create user in MongoDB
          let user = await User.findOne({ email: email.toLowerCase() });

          if (!user) {
            // Create new user from Firebase auth
            const randomPassword = await bcrypt.hash(
              Math.random().toString(36).slice(-12) + firebaseUid,
              10
            );

            user = await User.create({
              email: email.toLowerCase(),
              name,
              profilePicture: image || undefined,
              password: randomPassword,
              emailVerified: decodedToken.email_verified || false,
              isActive: true,
            });
          } else {
            // Update profile picture if changed
            if (image && user.profilePicture !== image) {
              user.profilePicture = image;
              await user.save();
            }
          }

          if (!user.isActive) {
            throw new Error("Account is deactivated");
          }

          return {
            id: user._id.toString(),
            email: user.email,
            name: user.name,
            image: user.profilePicture,
            role: user.role,
          };
        } catch (error: any) {
          console.error("Firebase auth error:", error.message);
          throw new Error(error.message || "Authentication failed");
        }
      },
    }),
    // Legacy credentials provider (email/password directly against MongoDB)
    CredentialsProvider({
      id: "credentials",
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password are required");
        }

        try {
          await dbConnect();
        } catch (dbError: any) {
          console.error("❌ Database connection failed during login:", dbError.message);
          throw new Error("Service temporarily unavailable. Please try again.");
        }

        try {
          await seedAdminUser();
        } catch (seedError: any) {
          // Non-blocking: just log, don't fail login
          console.warn("⚠️ Admin seed skipped:", seedError.message);
        }

        try {
          const user = await User.findOne({ email: credentials.email.toLowerCase() }).select(
            "+password"
          );

          if (!user) {
            console.log(`❌ Login failed: User not found for email ${credentials.email.toLowerCase()}`);
            throw new Error("Invalid email or password");
          }

          if (!user.isActive) {
            console.log(`❌ Login failed: Account deactivated for ${credentials.email.toLowerCase()}`);
            throw new Error("Account is deactivated");
          }

          if (!user.password) {
            console.log(`❌ Login failed: No password set for ${credentials.email.toLowerCase()}`);
            throw new Error("Invalid email or password");
          }

          const isPasswordValid = await bcrypt.compare(
            credentials.password,
            user.password
          );

          if (!isPasswordValid) {
            console.log(`❌ Login failed: Password mismatch for ${credentials.email.toLowerCase()}`);
            throw new Error("Invalid email or password");
          }

          console.log(`✅ Login successful for ${user.email} (role: ${user.role})`);

          return {
            id: user._id.toString(),
            email: user.email,
            name: user.name,
            image: user.profilePicture,
            role: user.role,
          };
        } catch (error: any) {
          // Re-throw auth errors as-is, wrap unexpected errors
          if (error.message.includes("Invalid") || error.message.includes("deactivated")) {
            throw error;
          }
          console.error("❌ Unexpected error during login:", error.message);
          throw new Error("Login failed. Please try again.");
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }

      // Update token if session update is triggered
      if (trigger === "update" && session) {
        token = { ...token, ...session };
      }

      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/login",
    signOut: "/auth/login",
    error: "/auth/error",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV !== "production" || process.env.NEXTAUTH_DEBUG === "true",
};
