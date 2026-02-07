"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Input } from "@/components/ui";
import { Mail, Lock, User, Wallet } from "lucide-react";
import {
  auth,
  createUserWithEmailAndPassword,
  updateProfile,
} from "@/lib/firebase";

export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const getPasswordStrength = (password: string) => {
    if (password.length < 6) return { strength: 0, label: "" };
    if (password.length < 8) return { strength: 1, label: "Weak" };
    if (password.length < 12) return { strength: 2, label: "Medium" };
    return { strength: 3, label: "Strong" };
  };

  const passwordStrength = getPasswordStrength(formData.password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

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
      // Create user in Firebase
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        formData.email,
        formData.password
      );

      // Update Firebase profile with name
      await updateProfile(userCredential.user, {
        displayName: formData.name,
      });

      // Get Firebase ID token
      const idToken = await userCredential.user.getIdToken();

      // Also register in MongoDB via API (for backward compatibility)
      await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
        }),
      });

      // Auto sign-in via NextAuth with Firebase token
      const result = await signIn("firebase", {
        idToken,
        email: userCredential.user.email,
        name: formData.name,
        redirect: false,
      });

      if (result?.error) {
        // Registration succeeded but auto-login failed, redirect to login
        router.push("/auth/login?registered=true");
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err: any) {
      const errorCode = err?.code;
      switch (errorCode) {
        case "auth/email-already-in-use":
          setError("An account with this email already exists");
          break;
        case "auth/weak-password":
          setError("Password is too weak. Use at least 6 characters.");
          break;
        case "auth/invalid-email":
          setError("Invalid email address");
          break;
        default:
          setError(err.message || "Registration failed. Please try again.");
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
          <h1 className="text-h1 font-bold text-neutral-900">Get Started</h1>
          <p className="text-body text-neutral-500 mt-2">
            Create your DooSplit account
          </p>
        </div>

        {/* Register Form */}
        <div className="bg-white rounded-xl shadow-md p-6 md:p-8">
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
            />

            <div>
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
              {formData.password && (
                <div className="mt-2">
                  <div className="flex gap-1">
                    {[1, 2, 3].map((level) => (
                      <div
                        key={level}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          level <= passwordStrength.strength
                            ? level === 1
                              ? "bg-error"
                              : level === 2
                              ? "bg-warning"
                              : "bg-success"
                            : "bg-neutral-200"
                        }`}
                      />
                    ))}
                  </div>
                  {passwordStrength.label && (
                    <p className="text-xs text-neutral-500 mt-1">
                      Password strength: {passwordStrength.label}
                    </p>
                  )}
                </div>
              )}
            </div>

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
              isLoading={isLoading}
            >
              Create Account
            </Button>
          </form>

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
