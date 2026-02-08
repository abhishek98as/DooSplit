"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui";
import Image from "next/image";
import { CheckCircle, XCircle, Clock, Mail } from "lucide-react";

export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error" | "expired">("loading");
  const [errorType, setErrorType] = useState<string>("");

  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");

    if (success === "true") {
      setStatus("success");
    } else if (error) {
      setStatus("error");
      setErrorType(error);
    }
  }, [searchParams]);

  const getContent = () => {
    switch (status) {
      case "success":
        return {
          icon: <CheckCircle className="h-16 w-16 text-success mx-auto mb-4" />,
          title: "Email Verified Successfully!",
          message: "Your email has been verified. You can now sign in to your account.",
          actions: (
            <Button onClick={() => router.push("/auth/login")} className="w-full">
              Sign In Now
            </Button>
          ),
        };

      case "expired":
        return {
          icon: <Clock className="h-16 w-16 text-warning mx-auto mb-4" />,
          title: "Verification Link Expired",
          message: "Your verification link has expired. Don't worry, you can request a new one.",
          actions: (
            <div className="space-y-3">
              <Button onClick={() => router.push("/auth/login")} className="w-full">
                Go to Login
              </Button>
              <Button
                onClick={() => router.push("/auth/forgot-password")}
                variant="secondary"
                className="w-full"
              >
                Request New Verification Email
              </Button>
            </div>
          ),
        };

      case "error":
        const errorMessages: Record<string, string> = {
          invalid: "The verification link is invalid or has already been used.",
          expired: "Your verification link has expired.",
          server: "Something went wrong on our end. Please try again later.",
        };

        return {
          icon: <XCircle className="h-16 w-16 text-error mx-auto mb-4" />,
          title: "Verification Failed",
          message: errorMessages[errorType] || "We couldn't verify your email. Please try again.",
          actions: (
            <div className="space-y-3">
              <Button onClick={() => router.push("/auth/login")} className="w-full">
                Go to Login
              </Button>
              <Button
                onClick={() => router.push("/auth/forgot-password")}
                variant="secondary"
                className="w-full"
              >
                Request New Verification Email
              </Button>
            </div>
          ),
        };

      default:
        return {
          icon: <Mail className="h-16 w-16 text-primary mx-auto mb-4 animate-pulse" />,
          title: "Verifying Your Email...",
          message: "Please wait while we verify your email address.",
          actions: null,
        };
    }
  };

  const content = getContent();

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
          <h1 className="text-h1 font-bold text-neutral-900">DooSplit</h1>
        </div>

        {/* Verification Status */}
        <div className="bg-white rounded-xl shadow-md p-6 md:p-8 text-center">
          {content.icon}
          <h2 className="text-xl font-semibold text-neutral-900 mb-2">
            {content.title}
          </h2>
          <p className="text-neutral-600 mb-6">
            {content.message}
          </p>

          {content.actions}

          {/* Sign In Link */}
          <p className="text-center text-sm text-neutral-600 mt-6">
            Already have an account?{" "}
            <Link
              href="/auth/login"
              className="text-primary font-medium hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}