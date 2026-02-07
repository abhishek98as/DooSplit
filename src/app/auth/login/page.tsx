"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Input } from "@/components/ui";
import { Mail, Lock, Wallet } from "lucide-react";
import {
  auth,
  signInWithEmailAndPassword,
  signInWithPopup,
  googleProvider,
} from "@/lib/firebase";

export default function LoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const handleFirebaseLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      // Sign in with Firebase
      const userCredential = await signInWithEmailAndPassword(
        auth,
        formData.email,
        formData.password
      );
      const idToken = await userCredential.user.getIdToken();

      // Pass Firebase token to NextAuth for session management
      const result = await signIn("firebase", {
        idToken,
        email: userCredential.user.email,
        name: userCredential.user.displayName,
        image: userCredential.user.photoURL,
        redirect: false,
      });

      if (result?.error) {
        setError(result.error);
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err: any) {
      const errorCode = err?.code;
      switch (errorCode) {
        case "auth/invalid-credential":
        case "auth/user-not-found":
        case "auth/wrong-password":
          setError("Invalid email or password");
          break;
        case "auth/too-many-requests":
          setError("Too many attempts. Please try again later.");
          break;
        case "auth/user-disabled":
          setError("This account has been disabled.");
          break;
        default:
          setError(err.message || "An error occurred. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    setIsGoogleLoading(true);

    try {
      const userCredential = await signInWithPopup(auth, googleProvider);
      const idToken = await userCredential.user.getIdToken();

      const result = await signIn("firebase", {
        idToken,
        email: userCredential.user.email,
        name: userCredential.user.displayName,
        image: userCredential.user.photoURL,
        redirect: false,
      });

      if (result?.error) {
        setError(result.error);
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err: any) {
      if (err.code !== "auth/popup-closed-by-user") {
        setError(err.message || "Google sign-in failed. Please try again.");
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 to-success/10 p-4">
      <div className="w-full max-w-md">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-16 w-16 bg-primary rounded-2xl mb-4">
            <Wallet className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-h1 font-bold text-neutral-900">Welcome Back</h1>
          <p className="text-body text-neutral-500 mt-2">
            Sign in to DooSplit
          </p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-xl shadow-md p-6 md:p-8">
          <form onSubmit={handleFirebaseLogin} className="space-y-5">
            {error && (
              <div className="bg-error/10 border border-error/20 text-error px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}

            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              icon={<Mail className="h-5 w-5" />}
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              required
            />

            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              icon={<Lock className="h-5 w-5" />}
              value={formData.password}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
              required
            />

            <div className="flex items-center justify-end">
              <Link
                href="/auth/forgot-password"
                className="text-sm text-primary hover:underline"
              >
                Forgot password?
              </Link>
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              isLoading={isLoading}
            >
              Sign In
            </Button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-neutral-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-neutral-500">OR</span>
            </div>
          </div>

          {/* Google Sign-In */}
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            isLoading={isGoogleLoading}
            onClick={handleGoogleLogin}
          >
            <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </Button>

          {/* Sign Up Link */}
          <p className="text-center text-sm text-neutral-600 mt-6">
            Don&apos;t have an account?{" "}
            <Link
              href="/auth/register"
              className="text-primary font-medium hover:underline"
            >
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
