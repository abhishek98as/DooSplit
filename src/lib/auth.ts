import { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { adminAuth, initError as firebaseInitError } from "./firebase-admin";
import { newAppId, requireSupabaseAdmin } from "@/lib/supabase/app";

function toSessionUser(row: any) {
  return {
    id: String(row.id),
    email: row.email,
    name: row.name,
    image: row.profile_picture || null,
    role: row.role || "user",
  };
}

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
          throw new Error(
            "Google sign-in is unavailable. Please use email/password login."
          );
        }

        try {
          const decodedToken = await adminAuth.verifyIdToken(credentials.idToken);
          const firebaseUid = decodedToken.uid;
          const email = (decodedToken.email || credentials.email || "")
            .toLowerCase()
            .trim();
          const name = decodedToken.name || credentials.name || "User";
          const image = decodedToken.picture || credentials.image || null;

          if (!email) {
            throw new Error("No email associated with this account");
          }

          const supabase = requireSupabaseAdmin();
          const { data: existing, error: existingError } = await supabase
            .from("users")
            .select("*")
            .eq("email", email)
            .eq("is_dummy", false)
            .maybeSingle();

          if (existingError) {
            throw existingError;
          }

          if (existing && existing.auth_provider === "email") {
            throw new Error(
              "An account with this email already exists using email/password login. Please use email/password to sign in instead."
            );
          }

          let userRow = existing;
          if (!userRow) {
            const randomPassword = await bcrypt.hash(
              Math.random().toString(36).slice(-12) + firebaseUid,
              10
            );
            const newId = newAppId();
            const { data: created, error: createError } = await supabase
              .from("users")
              .insert({
                id: newId,
                email,
                name,
                profile_picture: image,
                password: randomPassword,
                email_verified: !!decodedToken.email_verified,
                auth_provider: "firebase",
                is_active: true,
                is_dummy: false,
                role: "user",
              })
              .select("*")
              .single();

            if (createError || !created) {
              throw createError || new Error("Failed to create user");
            }
            userRow = created;
          } else if (image && userRow.profile_picture !== image) {
            const { data: updated } = await supabase
              .from("users")
              .update({ profile_picture: image })
              .eq("id", userRow.id)
              .select("*")
              .maybeSingle();
            if (updated) {
              userRow = updated;
            }
          }

          if (userRow.is_active === false) {
            throw new Error("Account is deactivated");
          }

          return toSessionUser(userRow);
        } catch (error: any) {
          console.error("Firebase auth error:", error.message);
          throw new Error(error.message || "Authentication failed");
        }
      },
    }),
    CredentialsProvider({
      id: "credentials",
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        rememberMe: { label: "Remember Me", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password are required");
        }

        const rememberMe = credentials.rememberMe === "true";
        const email = credentials.email.toLowerCase().trim();

        try {
          const supabase = requireSupabaseAdmin();
          const { data: user, error } = await supabase
            .from("users")
            .select("*")
            .eq("email", email)
            .maybeSingle();

          if (error) {
            throw error;
          }
          if (!user) {
            throw new Error("Invalid email or password");
          }
          if (user.is_active === false) {
            throw new Error("Account is deactivated");
          }
          if (!user.password) {
            throw new Error("Invalid email or password");
          }

          const isPasswordValid = await bcrypt.compare(
            credentials.password,
            String(user.password)
          );
          if (!isPasswordValid) {
            throw new Error("Invalid email or password");
          }

          if (user.auth_provider === "email" && !user.email_verified) {
            throw new Error(
              "Please verify your email address before signing in. Check your inbox for the verification link."
            );
          }

          return {
            ...toSessionUser(user),
            rememberMe,
          };
        } catch (error: any) {
          if (
            error.message.includes("Invalid") ||
            error.message.includes("deactivated") ||
            error.message.includes("verify")
          ) {
            throw error;
          }
          console.error("Unexpected error during login:", error.message);
          throw new Error("Login failed. Please try again.");
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.rememberMe = (user as any).rememberMe || false;
      }

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

      if (token.rememberMe) {
        session.expires = new Date(
          Date.now() + 90 * 24 * 60 * 60 * 1000
        ).toISOString();
      } else {
        session.expires = new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ).toISOString();
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
    maxAge: 30 * 24 * 60 * 60,
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug:
    process.env.NODE_ENV !== "production" ||
    process.env.NEXTAUTH_DEBUG === "true",
};

