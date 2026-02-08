"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui";
import { CheckCircle, XCircle, Loader2, Mail } from "lucide-react";

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");
    const email = searchParams.get("email");

    if (success === "true") {
      setStatus("success");
      setMessage(email ? `Your email ${email} has been verified successfully!` : "Your email has been verified successfully!");
    } else if (error === "true") {
      setStatus("error");
      setMessage("Email verification failed. The link may be invalid or expired.");
    } else {
      setStatus("error");
      setMessage("Invalid verification link.");
    }
  }, [searchParams]);

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
          <h1 className="text-h1 font-bold text-neutral-900">Email Verification</h1>
        </div>

        {/* Status Card */}
        <div className="bg-white rounded-xl shadow-md p-6 md:p-8">
          <div className="text-center">
            {status === "loading" && (
              <div className="mb-6">
                <Loader2 className="h-16 w-16 text-primary mx-auto mb-4 animate-spin" />
                <h2 className="text-xl font-semibold text-neutral-900 mb-2">
                  Verifying Your Email
                </h2>
                <p className="text-neutral-600">
                  Please wait while we verify your email address...
                </p>
              </div>
            )}

            {status === "success" && (
              <div className="mb-6">
                <CheckCircle className="h-16 w-16 text-success mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-neutral-900 mb-2">
                  Email Verified!
                </h2>
                <p className="text-neutral-600 mb-4">
                  {message}
                </p>
                <p className="text-sm text-neutral-500">
                  You can now sign in to your account and start using DooSplit.
                </p>
              </div>
            )}

            {status === "error" && (
              <div className="mb-6">
                <XCircle className="h-16 w-16 text-error mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-neutral-900 mb-2">
                  Verification Failed
                </h2>
                <p className="text-neutral-600 mb-4">
                  {message}
                </p>
                <div className="bg-neutral-50 p-4 rounded-lg mb-4">
                  <div className="flex items-start gap-3">
                    <Mail className="h-5 w-5 text-neutral-500 mt-0.5 flex-shrink-0" />
                    <div className="text-left">
                      <p className="text-sm font-medium text-neutral-700">
                        Need a new verification link?
                      </p>
                      <p className="text-xs text-neutral-500 mt-1">
                        Check your email for the verification link, or contact support if you continue having issues.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
              {status === "success" && (
                <Button
                  onClick={() => router.push("/auth/login")}
                  className="w-full"
                >
                  Continue to Login
                </Button>
              )}

              {status === "error" && (
                <>
                  <Button
                    onClick={() => router.push("/auth/login")}
                    className="w-full"
                  >
                    Go to Login
                  </Button>
                  <Button
                    onClick={() => router.push("/auth/register")}
                    variant="secondary"
                    className="w-full"
                  >
                    Create New Account
                  </Button>
                </>
              )}

              <div className="text-center">
                <Link
                  href="/"
                  className="text-sm text-primary hover:underline"
                >
                  Back to Home
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 to-success/10 p-4">
        <div className="w-full max-w-md">
          <div className="text-center">
            <Loader2 className="h-16 w-16 text-primary mx-auto mb-4 animate-spin" />
            <h2 className="text-xl font-semibold text-neutral-900 mb-2">
              Verifying Your Email
            </h2>
            <p className="text-neutral-600">
              Please wait...
            </p>
          </div>
        </div>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}