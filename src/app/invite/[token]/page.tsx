"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import BrandLogo from "@/components/ui/BrandLogo";
import { Button, Input } from "@/components/ui";
import {
  Mail,
  Lock,
  User,
  CheckCircle2,
  XCircle,
  Loader2,
  PartyPopper,
} from "lucide-react";
import {
  auth,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
  firebaseSignOut,
} from "@/lib/firebase";
import { signIn } from "@/lib/auth/react-session";

interface InviterInfo {
  name: string;
  email: string;
  profilePicture?: string;
}

async function createServerSession(idToken: string) {
  await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ idToken }),
  });
}

async function bootstrapUser(name: string, inviteToken: string) {
  await fetch("/api/auth/bootstrap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name, inviteToken }),
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
      return "An account with this email already exists. Please sign in instead.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/weak-password":
      return "Password must be at least 6 characters long.";
    case "auth/operation-not-allowed":
      return "Email/password sign-up is not enabled in Firebase Authentication settings.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait and try again.";
    default:
      return "Registration failed";
  }
}

export default function AcceptInvitePage() {
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [inviter, setInviter] = useState<InviterInfo | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [formError, setFormError] = useState("");
  const [formWarning, setFormWarning] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    async function validateToken() {
      try {
        const res = await fetch(`/api/invitations/token/${token}`);
        const data = await res.json();

        if (data.valid) {
          setValid(true);
          setInviter(data.invitation.invitedBy);
          setInviteEmail(data.invitation.email);
          setFormData((prev) => ({
            ...prev,
            email: data.invitation.email,
          }));
        } else {
          setErrorMsg(data.error || "Invalid invitation");
        }
      } catch {
        setErrorMsg("Failed to validate invitation");
      } finally {
        setLoading(false);
      }
    }
    if (token) {
      void validateToken();
    }
  }, [token]);

  const handleGoogleSignUp = async () => {
    setFormError("");
    setIsGoogleLoading(true);

    try {
      const result = await signIn("google", {
        callbackUrl: "/dashboard",
        redirect: false,
        inviteToken: token,
      });

      if (result?.error) {
        setFormError(result.error);
        return;
      }

      if (result?.url) {
        setRegistered(true);
      }
    } catch {
      setFormError("An error occurred during Google sign-up.");
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setFormWarning("");

    if (formData.password !== formData.confirmPassword) {
      setFormError("Passwords do not match");
      return;
    }

    if (formData.password.length < 6) {
      setFormError("Password must be at least 6 characters");
      return;
    }

    setIsSubmitting(true);

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
      await bootstrapUser(formData.name.trim() || "User", token);

      await firebaseSignOut(auth);
      await clearServerSession();

      if (!verificationSent) {
        setFormWarning(
          "Account created. We could not send a verification email right now, but you can still sign in."
        );
      }
      setRegistered(true);
    } catch (err: any) {
      setFormError(mapFirebaseAuthError(err?.code || ""));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 to-success/10">
        <div className="text-center">
          <Loader2 className="h-10 w-10 text-primary animate-spin mx-auto mb-4" />
          <p className="text-neutral-600">Validating your invitation...</p>
        </div>
      </div>
    );
  }

  if (!valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 p-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-white rounded-xl shadow-md p-8">
            <XCircle className="h-16 w-16 text-red-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-neutral-900 mb-2">Invitation Invalid</h1>
            <p className="text-neutral-600 mb-6">{errorMsg}</p>
            <div className="space-y-3">
              <Link href="/auth/register">
                <Button variant="primary" className="w-full">Sign Up Normally</Button>
              </Link>
              <Link href="/auth/login">
                <Button variant="secondary" className="w-full">Already have an account? Sign In</Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (registered) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-50 p-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-white rounded-xl shadow-md p-8">
            <PartyPopper className="h-16 w-16 text-primary mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-neutral-900 mb-2">Welcome to DooSplit</h1>
            <p className="text-neutral-600 mb-4">Your account was created and your invite was accepted.</p>
            <p className="text-sm text-neutral-500 mb-6">
              Verify your email from your inbox, then sign in.
            </p>
            {formWarning && (
              <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-md text-sm mb-4">
                {formWarning}
              </div>
            )}
            <Link href="/auth/login">
              <Button className="w-full">Go to Login</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 to-success/10 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <BrandLogo size={64} className="h-16 w-16 rounded-2xl mb-4 inline-block shadow-lg" priority />
          <h1 className="text-2xl font-bold text-neutral-900">You&apos;re Invited</h1>
          {inviter && (
            <p className="text-neutral-600 mt-2">
              <span className="font-semibold text-primary">{inviter.name}</span> invited you to join DooSplit
            </p>
          )}
        </div>

        {inviter && (
          <div className="bg-white/60 backdrop-blur rounded-xl p-4 mb-6 border border-primary/20 flex items-center gap-4">
            <div className="h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
              {inviter.profilePicture ? (
                <img
                  src={inviter.profilePicture}
                  alt={inviter.name}
                  className="h-12 w-12 rounded-full object-cover"
                />
              ) : (
                <span className="text-primary font-bold text-lg">{inviter.name?.charAt(0)?.toUpperCase()}</span>
              )}
            </div>
            <div>
              <p className="font-semibold text-neutral-900">{inviter.name}</p>
              <p className="text-sm text-neutral-500">wants to split expenses with you</p>
            </div>
            <CheckCircle2 className="h-6 w-6 text-green-500 ml-auto flex-shrink-0" />
          </div>
        )}

        <div className="bg-white rounded-xl shadow-md p-6 md:p-8">
          <h2 className="text-lg font-semibold text-neutral-900 mb-5">Create your account</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
                {formError}
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
              helperText={formData.email === inviteEmail ? "Pre-filled from invitation" : undefined}
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

            <Button type="submit" variant="primary" className="w-full" isLoading={isSubmitting}>
              Join DooSplit
            </Button>
          </form>

          {/* Google SSO divider + button */}
          <div className="relative my-5">
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
      </div>
    </div>
  );
}
