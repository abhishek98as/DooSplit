"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Input } from "@/components/ui";
import Image from "next/image";
import { Lock } from "lucide-react";
import { auth, verifyPasswordResetCode, confirmPasswordReset } from "@/lib/firebase";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oobCode = searchParams.get("oobCode");

  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [validCode, setValidCode] = useState(false);

  useEffect(() => {
    const checkCode = async () => {
      if (!oobCode) {
        setError("Invalid or missing reset link");
        return;
      }

      try {
        await verifyPasswordResetCode(auth, oobCode);
        setValidCode(true);
      } catch {
        setError("This reset link is invalid or expired");
      }
    };

    void checkCode();
  }, [oobCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!oobCode) {
      setError("Invalid reset link");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters long");
      return;
    }

    setIsLoading(true);

    try {
      await confirmPasswordReset(auth, oobCode, formData.password);
      setMessage("Password reset successfully. Redirecting to login...");
      setTimeout(() => {
        router.push("/auth/login");
      }, 1500);
    } catch {
      setError("Failed to reset password. The link may have expired.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 to-success/10 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Image
            src="/logo.webp"
            alt="DooSplit"
            width={64}
            height={64}
            className="h-16 w-16 rounded-2xl mb-4 inline-block"
          />
          <h1 className="text-h1 font-bold text-neutral-900">Reset Password</h1>
          <p className="text-body text-neutral-500 mt-2">Enter your new password below</p>
        </div>

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
              label="New Password"
              type="password"
              placeholder="********"
              icon={<Lock className="h-5 w-5" />}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              disabled={!validCode}
            />

            <Input
              label="Confirm Password"
              type="password"
              placeholder="********"
              icon={<Lock className="h-5 w-5" />}
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              required
              disabled={!validCode}
            />

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              isLoading={isLoading}
              disabled={!validCode}
            >
              Reset Password
            </Button>
          </form>

          <Link href="/auth/login" className="block text-center text-sm text-primary hover:underline mt-6">
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
