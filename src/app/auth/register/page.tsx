"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Input } from "@/components/ui";
import BrandLogo from "@/components/ui/BrandLogo";
import { Mail, Lock, User, CheckCircle } from "lucide-react";
import {
  auth,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
  firebaseSignOut,
} from "@/lib/firebase";
import { signIn } from "@/lib/auth/react-session";

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
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);

  const handleGoogleSignUp = async () => {
    setError("");
    setIsGoogleLoading(true);

    try {
      const result = await signIn("google", {
        callbackUrl: "/dashboard",
        redirect: false,
        inviteToken: referralRef || undefined,
      });

      if (result?.error) {
        setError(result.error);
        return;
      }

      if (result?.url) {
        router.push(result.url);
        router.refresh();
      }
    } catch {
      setError("An error occurred during Google sign-up.");
    } finally {
      setIsGoogleLoading(false);
    }
  };

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
          <BrandLogo size={64} className="h-16 w-16 rounded-2xl mb-4 inline-block" priority />
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
                  id="name"
                  name="name"
                  autoComplete="name"
                  placeholder="John Doe"
                  icon={<User className="h-5 w-5" />}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />

                <Input
                  label="Email"
                  type="email"
                  id="email"
                  name="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  icon={<Mail className="h-5 w-5" />}
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />

                <Input
                  label="Password"
                  type="password"
                  id="password"
                  name="password"
                  autoComplete="new-password"
                  placeholder="********"
                  icon={<Lock className="h-5 w-5" />}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                />

                <Input
                  label="Confirm Password"
                  type="password"
                  id="confirmPassword"
                  name="confirmPassword"
                  autoComplete="new-password"
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

              {/* Google SSO divider + button */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-neutral-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-white text-neutral-500">or continue with</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignUp}
                disabled={isGoogleLoading}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 border border-neutral-200 rounded-xl bg-white hover:bg-neutral-50 transition-colors text-sm font-medium text-neutral-700 disabled:opacity-50"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                {isGoogleLoading ? "Signing up..." : "Continue with Google"}
              </button>

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
