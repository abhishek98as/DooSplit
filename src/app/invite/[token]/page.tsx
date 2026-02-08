"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button, Input } from "@/components/ui";
import { signIn } from "next-auth/react";
import {
  Mail,
  Lock,
  User,

  CheckCircle2,
  XCircle,
  Loader2,
  PartyPopper,
} from "lucide-react";

interface InviterInfo {
  name: string;
  email: string;
  profilePicture?: string;
}

export default function AcceptInvitePage() {
  const router = useRouter();
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
  const [isSubmitting, setIsSubmitting] = useState(false);
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
    validateToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

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
      // Register via API
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          inviteToken: token,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error || "Registration failed");
        return;
      }

      setRegistered(true);

      // Auto sign-in
      const result = await signIn("credentials", {
        email: formData.email,
        password: formData.password,
        redirect: false,
      });

      if (result?.error) {
        router.push("/auth/login?registered=true");
      } else {
        setTimeout(() => {
          router.push("/dashboard");
          router.refresh();
        }, 2000);
      }
    } catch (err) {
      setFormError((err as any).message || "Registration failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 to-purple-100">
        <div className="text-center">
          <Loader2 className="h-10 w-10 text-primary animate-spin mx-auto mb-4" />
          <p className="text-neutral-600">Validating your invitation...</p>
        </div>
      </div>
    );
  }

  // Invalid / expired
  if (!valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 p-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-white rounded-xl shadow-md p-8">
            <XCircle className="h-16 w-16 text-red-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-neutral-900 mb-2">
              Invitation Invalid
            </h1>
            <p className="text-neutral-600 mb-6">{errorMsg}</p>
            <div className="space-y-3">
              <Link href="/auth/register">
                <Button variant="primary" className="w-full">
                  Sign Up Normally
                </Button>
              </Link>
              <Link href="/auth/login">
                <Button variant="secondary" className="w-full">
                  Already have an account? Sign In
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (registered) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-50 p-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-white rounded-xl shadow-md p-8">
            <PartyPopper className="h-16 w-16 text-primary mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-neutral-900 mb-2">
              Welcome to DooSplit! 🎉
            </h1>
            <p className="text-neutral-600 mb-2">
              Your account has been created successfully.
            </p>
            <p className="text-sm text-neutral-500">
              Redirecting you to the dashboard...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Registration form
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 to-purple-100 p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <Image
            src="/logo.webp"
            alt="DooSplit"
            width={64}
            height={64}
            className="h-16 w-16 rounded-2xl mb-4 inline-block shadow-lg"
          />
          <h1 className="text-2xl font-bold text-neutral-900">
            You&apos;re Invited! 🎉
          </h1>
          {inviter && (
            <p className="text-neutral-600 mt-2">
              <span className="font-semibold text-primary">
                {inviter.name}
              </span>{" "}
              invited you to join DooSplit
            </p>
          )}
        </div>

        {/* Invitation card */}
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
                <span className="text-primary font-bold text-lg">
                  {inviter.name?.charAt(0)?.toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <p className="font-semibold text-neutral-900">{inviter.name}</p>
              <p className="text-sm text-neutral-500">
                wants to split expenses with you
              </p>
            </div>
            <CheckCircle2 className="h-6 w-6 text-green-500 ml-auto flex-shrink-0" />
          </div>
        )}

        {/* Sign-up form */}
        <div className="bg-white rounded-xl shadow-md p-6 md:p-8">
          <h2 className="text-lg font-semibold text-neutral-900 mb-5">
            Create your account
          </h2>

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
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              required
            />

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
              helperText={
                formData.email === inviteEmail
                  ? "Pre-filled from invitation"
                  : undefined
              }
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

            <Input
              label="Confirm Password"
              type="password"
              placeholder="••••••••"
              icon={<Lock className="h-5 w-5" />}
              value={formData.confirmPassword}
              onChange={(e) =>
                setFormData({ ...formData, confirmPassword: e.target.value })
              }
              required
            />

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              isLoading={isSubmitting}
            >
              Join DooSplit
            </Button>
          </form>

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
