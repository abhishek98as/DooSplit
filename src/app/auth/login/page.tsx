"use client";

import React, { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Input } from "@/components/ui";
import Image from "next/image";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [recommendedMethod, setRecommendedMethod] = useState<string | null>(null);

  const handleCredentialsLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      // Sign in directly against MongoDB via NextAuth credentials provider
      const result = await signIn("credentials", {
        email: formData.email,
        password: formData.password,
        redirect: false,
      });

      if (result?.error) {
        // Check for email verification error
        if (result.error.includes("verify your email")) {
          setNeedsEmailVerification(true);
          setVerificationEmail(formData.email);
          setError("");
        } else {
          // Show actual error from server for better debugging
          setError(result.error === "CredentialsSignin"
            ? "Invalid email or password"
            : result.error);
          setNeedsEmailVerification(false);
        }
      } else if (!result?.ok) {
        setError("Login failed. Please try again.");
        setNeedsEmailVerification(false);
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err) {
      setError((err as any).message || "An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!verificationEmail) return;

    setError("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: verificationEmail }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to resend verification email");
      } else {
        setError("Verification email sent! Please check your inbox.");
      }
    } catch (err) {
      setError("Failed to resend verification email. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    setIsGoogleLoading(true);

    try {
      const result = await signIn("google", {
        callbackUrl: "/dashboard",
        redirect: false,
      });

      if (result?.error) {
        setError("Google sign-in failed. Please try again.");
      } else if (!result?.url) {
        setError("Google sign-in failed. Please try again.");
      }
    } catch (err) {
      setError("An error occurred during Google sign-in.");
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // Check for recommended method from URL params
  React.useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const method = urlParams.get("method");
    if (method) {
      setRecommendedMethod(method);
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 to-success/10 p-4">
      <div className="w-full max-w-md">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <Image
            src="/logo.webp"
            alt="DooSplit"
            width={64}
            height={64}
            className="h-16 w-16 rounded-2xl mb-4 inline-block"
          />
          <h1 className="text-h1 font-bold text-neutral-900">
            Welcome Back
          </h1>
          <p className="text-body text-neutral-500 mt-2">
            Sign in to DooSplit
          </p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-xl shadow-md p-6 md:p-8">
          {needsEmailVerification ? (
            <div className="text-center">
              <Mail className="h-12 w-12 text-blue-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-neutral-900 mb-2">
                Email Verification Required
              </h3>
              <p className="text-neutral-600 mb-4">
                We've sent a verification email to <strong>{verificationEmail}</strong>.
                Please check your inbox and click the verification link to activate your account.
              </p>
              <div className="bg-blue-50 p-4 rounded-lg mb-6">
                <p className="text-sm text-blue-700">
                  <strong>Didn't receive the email?</strong> Check your spam folder or click below to resend.
                </p>
              </div>
              <div className="space-y-3">
                <Button
                  onClick={handleResendVerification}
                  className="w-full"
                  isLoading={isLoading}
                >
                  Resend Verification Email
                </Button>
                <Button
                  onClick={() => {
                    setNeedsEmailVerification(false);
                    setVerificationEmail("");
                    setError("");
                  }}
                  variant="secondary"
                  className="w-full"
                >
                  Try Different Account
                </Button>
              </div>

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
          ) : (
            <div>
              <form onSubmit={handleCredentialsLogin} className="space-y-5">
                {error && (
                  <div className="bg-error/10 border border-error/20 text-error px-4 py-3 rounded-md text-sm">
                    {error}
                  </div>
                )}

                {recommendedMethod && (
                  <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-md">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-blue-800">
                          {recommendedMethod === "google"
                            ? "Try Google Sign-In"
                            : "Try Email & Password Login"}
                        </p>
                        <p className="text-sm text-blue-700 mt-1">
                          {recommendedMethod === "google"
                            ? "This account was created using Google sign-in. Use the Google button below."
                            : "This account was created with email and password. Use the form above."}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <Input
                  label="Email"
                  type="email"
                  placeholder="Enter your email"
                  icon={<Mail className="h-5 w-5" />}
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  required
                />

                <div className="relative">
                  <Input
                    label="Password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    icon={<Lock className="h-5 w-5" />}
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-[38px] p-1 hover:bg-neutral-100 rounded"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-neutral-500" />
                    ) : (
                      <Eye className="h-4 w-4 text-neutral-500" />
                    )}
                  </button>
                </div>

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
          )}
        </div>
      </div>
    </div>
  );
}