"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Input } from "@/components/ui";
import { Mail, ArrowLeft, Wallet } from "lucide-react";
import { auth, sendPasswordResetEmail } from "@/lib/firebase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setIsLoading(true);

    try {
      await sendPasswordResetEmail(auth, email);
      setMessage(
        "If your email is registered, you will receive a password reset link shortly."
      );
    } catch (err: any) {
      const errorCode = err?.code;
      switch (errorCode) {
        case "auth/user-not-found":
          // Don't reveal that user doesn't exist
          setMessage(
            "If your email is registered, you will receive a password reset link shortly."
          );
          break;
        case "auth/invalid-email":
          setError("Please enter a valid email address.");
          break;
        case "auth/too-many-requests":
          setError("Too many attempts. Please try again later.");
          break;
        default:
          setError("An error occurred. Please try again.");
      }
    } finally {
      setIsLoading(false);
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
          <h1 className="text-h1 font-bold text-neutral-900">
            Forgot Password?
          </h1>
          <p className="text-body text-neutral-500 mt-2">
            Enter your email to receive a password reset link
          </p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-xl shadow-md p-6 md:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-error/10 border border-error/20 text-error px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}

            {message && (
              <div className="bg-success/10 border border-success/20 text-success px-4 py-3 rounded-md text-sm">
                {message}
              </div>
            )}

            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              icon={<Mail className="h-5 w-5" />}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              isLoading={isLoading}
            >
              Send Reset Link
            </Button>
          </form>

          {/* Back to Login */}
          <Link
            href="/auth/login"
            className="flex items-center justify-center text-sm text-primary hover:underline mt-6"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
