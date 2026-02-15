"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Input } from "@/components/ui";
import Image from "next/image";
import { Mail, Lock, User, CheckCircle } from "lucide-react";
import {
  auth,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
  firebaseSignOut,
} from "@/lib/firebase";

async function createServerSession(idToken: string) {
  await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ idToken }),
  });
}

async function bootstrapUser(name: string, referrerId?: string) {
  await fetch("/api/auth/bootstrap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      name,
      ...(referrerId ? { ref: referrerId } : {}),
    }),
  });
}

async function clearServerSession() {
  await fetch("/api/auth/session", {
    method: "DELETE",
    credentials: "include",
  });
}

function mapFirebaseAuthError(code: string): string {
  switch (code) {
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/weak-password":
      return "Password must be at least 6 characters long.";
    case "auth/operation-not-allowed":
      return "Email/password sign-up is not enabled in Firebase Authentication settings.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait and try again.";
    default:
      return "Registration failed. Please try again.";
  }
}

function RegisterPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const referralRef = searchParams.get("ref")?.trim() || "";
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setWarning("");

    if (!acceptTerms) {
      setError("Please accept the terms and conditions");
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
      const credential = await createUserWithEmailAndPassword(
        auth,
        formData.email.trim(),
        formData.password
      );

      if (formData.name.trim()) {
        await updateProfile(credential.user, {
          displayName: formData.name.trim(),
        });
      }

      const actionCodeSettings = {
        url: `${window.location.origin}/auth/verify-email`,
        handleCodeInApp: true,
      };

      const verificationSent = await sendEmailVerification(credential.user, actionCodeSettings)
        .then(() => true)
        .catch(async () => {
          return sendEmailVerification(credential.user)
            .then(() => true)
            .catch(() => false);
        });

      const idToken = await credential.user.getIdToken();
      await createServerSession(idToken);
      await bootstrapUser(formData.name.trim() || "User", referralRef);

      await firebaseSignOut(auth);
      await clearServerSession();

      if (!verificationSent) {
        setWarning(
          "Account created. We could not send a verification email right now, but you can still sign in."
        );
      }
      setRegistrationSuccess(true);
    } catch (err: any) {
      setError(mapFirebaseAuthError(err?.code || ""));
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
          <h1 className="text-h1 font-bold text-neutral-900">Get Started</h1>
          <p className="text-body text-neutral-500 mt-2">Create your DooSplit account</p>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6 md:p-8">
          {registrationSuccess ? (
            <div className="text-center">
              <CheckCircle className="h-16 w-16 text-success mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-neutral-900 mb-2">Registration Successful</h2>
              <p className="text-neutral-600 mb-4">
                We sent a verification email to <strong>{formData.email}</strong>. Verify your email before signing in.
              </p>
              {warning && (
                <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-md text-sm mb-4">
                  {warning}
                </div>
              )}
              <Button onClick={() => router.push("/auth/login")} className="w-full">
                Go to Login
              </Button>
            </div>
          ) : (
            <div>
              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div className="bg-error/10 border border-error/20 text-error px-4 py-3 rounded-md text-sm">
                    {error}
                  </div>
                )}

                <Input
                  label="Full Name"
                  type="text"
                  placeholder="John Doe"
                  icon={<User className="h-5 w-5" />}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />

                <Input
                  label="Email"
                  type="email"
                  placeholder="you@example.com"
                  icon={<Mail className="h-5 w-5" />}
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />

                <Input
                  label="Password"
                  type="password"
                  placeholder="********"
                  icon={<Lock className="h-5 w-5" />}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                />

                <Input
                  label="Confirm Password"
                  type="password"
                  placeholder="********"
                  icon={<Lock className="h-5 w-5" />}
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  required
                />

                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="acceptTerms"
                    checked={acceptTerms}
                    onChange={(e) => setAcceptTerms(e.target.checked)}
                    className="mt-1 h-4 w-4 text-primary border-neutral-300 rounded focus:ring-primary focus:ring-2"
                    required
                  />
                  <label htmlFor="acceptTerms" className="text-sm text-neutral-600 leading-relaxed">
                    I agree to the <Link href="/terms" className="text-primary hover:underline">Terms of Service</Link> and{" "}
                    <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
                  </label>
                </div>

                <Button type="submit" variant="primary" className="w-full" isLoading={isLoading}>
                  Create Account
                </Button>
              </form>

              <p className="text-center text-sm text-neutral-600 mt-6">
                Already have an account?{" "}
                <Link href="/auth/login" className="text-primary font-medium hover:underline">
                  Sign in
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-neutral-50" />}>
      <RegisterPageContent />
    </Suspense>
  );
}
