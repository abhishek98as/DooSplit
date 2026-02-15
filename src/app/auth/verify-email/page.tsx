"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui";
import Image from "next/image";
import { CheckCircle, XCircle, Clock, Mail } from "lucide-react";
import { auth, applyActionCode } from "@/lib/firebase";

async function createServerSession(idToken: string) {
  await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ idToken }),
  });
}

async function bootstrapUser(name?: string) {
  await fetch("/api/auth/bootstrap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name }),
  });
}

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error" | "expired">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const verify = async () => {
      const oobCode = searchParams.get("oobCode");

      if (!oobCode) {
        setStatus("error");
        setErrorMessage("Missing verification code");
        return;
      }

      try {
        await applyActionCode(auth, oobCode);

        const currentUser = auth.currentUser;
        if (currentUser) {
          await currentUser.reload();
          const idToken = await currentUser.getIdToken(true);
          await createServerSession(idToken);
          await bootstrapUser(currentUser.displayName || undefined);
        }

        setStatus("success");
      } catch (error: any) {
        const code = String(error?.code || "");
        if (code === "auth/expired-action-code" || code === "auth/invalid-action-code") {
          setStatus("expired");
          return;
        }

        setStatus("error");
        setErrorMessage(error?.message || "Verification failed");
      }
    };

    void verify();
  }, [searchParams]);

  const getContent = () => {
    switch (status) {
      case "success":
        return {
          icon: <CheckCircle className="h-16 w-16 text-success mx-auto mb-4" />,
          title: "Email Verified",
          message: "Your email has been verified. You can now sign in.",
          actions: (
            <Button onClick={() => router.push("/auth/login")} className="w-full">
              Sign In
            </Button>
          ),
        };

      case "expired":
        return {
          icon: <Clock className="h-16 w-16 text-warning mx-auto mb-4" />,
          title: "Verification Link Expired",
          message: "This verification link is invalid or expired. Please request a new one by signing in.",
          actions: (
            <Button onClick={() => router.push("/auth/login")} className="w-full">
              Go to Login
            </Button>
          ),
        };

      case "error":
        return {
          icon: <XCircle className="h-16 w-16 text-error mx-auto mb-4" />,
          title: "Verification Failed",
          message: errorMessage || "We could not verify your email.",
          actions: (
            <Button onClick={() => router.push("/auth/login")} className="w-full">
              Go to Login
            </Button>
          ),
        };

      default:
        return {
          icon: <Mail className="h-16 w-16 text-primary mx-auto mb-4 animate-pulse" />,
          title: "Verifying Your Email",
          message: "Please wait while we verify your email address.",
          actions: null,
        };
    }
  };

  const content = getContent();

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
          <h1 className="text-h1 font-bold text-neutral-900">DooSplit</h1>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6 md:p-8 text-center">
          {content.icon}
          <h2 className="text-xl font-semibold text-neutral-900 mb-2">{content.title}</h2>
          <p className="text-neutral-600 mb-6">{content.message}</p>

          {content.actions}

          <p className="text-center text-sm text-neutral-600 mt-6">
            Already have an account?{" "}
            <Link href="/auth/login" className="text-primary font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
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
              <h1 className="text-h1 font-bold text-neutral-900">DooSplit</h1>
            </div>
            <div className="bg-white rounded-xl shadow-md p-6 md:p-8 text-center">
              <Mail className="h-16 w-16 text-primary mx-auto mb-4 animate-pulse" />
              <h2 className="text-xl font-semibold text-neutral-900 mb-2">Verifying Your Email</h2>
              <p className="text-neutral-600 mb-6">Please wait while we verify your email address.</p>
            </div>
          </div>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
