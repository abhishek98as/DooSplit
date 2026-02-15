"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  auth,
  googleProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  firebaseSignOut,
  sendEmailVerification,
} from "@/lib/firebase";

export interface SessionUser {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
  role?: string;
}

export interface SessionShape {
  user: SessionUser;
}

type SessionStatus = "loading" | "authenticated" | "unauthenticated";

interface SessionContextValue {
  data: SessionShape | null;
  status: SessionStatus;
  refresh: () => Promise<void>;
  update: (input: Partial<SessionUser>) => Promise<SessionShape | null>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

async function createServerSession(idToken: string): Promise<void> {
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ idToken }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error || "Failed to create server session");
  }
}

async function createServerSessionWithRetry(user: { getIdToken: (forceRefresh?: boolean) => Promise<string> }): Promise<void> {
  const initialToken = await user.getIdToken();

  try {
    await createServerSession(initialToken);
    return;
  } catch {
    // Token/session can be stale right after auth state transitions; retry once with fresh token.
    const refreshedToken = await user.getIdToken(true);
    await createServerSession(refreshedToken);
  }
}

async function bootstrapUser(name?: string, inviteToken?: string): Promise<void> {
  await fetch("/api/auth/bootstrap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name, inviteToken }),
  });
}

async function clearServerSession(): Promise<void> {
  await fetch("/api/auth/session", {
    method: "DELETE",
    credentials: "include",
  });
}

function shouldRequireEmailVerification(): boolean {
  return process.env.NEXT_PUBLIC_REQUIRE_EMAIL_VERIFICATION === "true";
}

async function readServerSession(): Promise<SessionShape | null> {
  const response = await fetch("/api/auth/session", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json().catch(() => null);
  if (!payload?.authenticated || !payload.user?.id) {
    return null;
  }

  return {
    user: {
      id: payload.user.id,
      email: payload.user.email || null,
      name: payload.user.name || null,
      role: payload.user.role || "user",
      image: payload.user.image || null,
    },
  };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<SessionShape | null>(null);
  const [status, setStatus] = useState<SessionStatus>("loading");

  const refresh = useCallback(async () => {
    const user = auth.currentUser;

    if (!user) {
      setData(null);
      setStatus("unauthenticated");
      return;
    }

    try {
      await createServerSessionWithRetry(user);
      await bootstrapUser(user.displayName || undefined).catch(() => undefined);

      const session = await readServerSession();
      setData(
        session || {
          user: {
            id: user.uid,
            email: user.email,
            name: user.displayName,
            image: user.photoURL,
            role: "user",
          },
        }
      );
      setStatus("authenticated");
    } catch {
      // Keep client-authenticated fallback so UI does not hard-reset on transient session API failures.
      setData({
        user: {
          id: user.uid,
          email: user.email,
          name: user.displayName,
          image: user.photoURL,
          role: "user",
        },
      });
      setStatus("authenticated");
    }
  }, []);

  useEffect(() => {
    let active = true;

    const unsub = auth.onAuthStateChanged(async () => {
      if (!active) {
        return;
      }
      await refresh();
    });

    return () => {
      active = false;
      unsub();
    };
  }, [refresh]);

  const update = useCallback(async (input: Partial<SessionUser>) => {
    let nextSession: SessionShape | null = null;
    setData((prev) => {
      if (!prev) {
        nextSession = null;
        return prev;
      }
      nextSession = {
        user: {
          ...prev.user,
          ...input,
        },
      };
      return nextSession;
    });

    return nextSession;
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ data, status, refresh, update }),
    [data, status, refresh, update]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within SessionProvider");
  }

  return {
    data: context.data,
    status: context.status,
    update: context.update,
  };
}

function toErrorMessage(error: unknown): string {
  if (!error) {
    return "Authentication failed";
  }

  const code = (error as { code?: string }).code || "";
  if (code === "auth/invalid-credential") {
    return "Invalid email or password";
  }
  if (code === "auth/invalid-login-credentials") {
    return "Invalid email or password";
  }
  if (code === "auth/user-not-found") {
    return "Invalid email or password";
  }
  if (code === "auth/wrong-password") {
    return "Invalid email or password";
  }
  if (code === "auth/popup-closed-by-user") {
    return "Sign-in cancelled";
  }
  if (code === "auth/operation-not-allowed") {
    return "Email/password sign-in is not enabled in Firebase Authentication settings.";
  }
  if (code === "auth/invalid-email") {
    return "Please enter a valid email address.";
  }
  if (code === "auth/too-many-requests") {
    return "Too many failed attempts. Please wait and try again.";
  }

  return (error as { message?: string }).message || "Authentication failed";
}

export async function signIn(
  provider: "credentials" | "google" | string,
  options: Record<string, any> = {}
): Promise<{ ok?: boolean; error?: string; status: number; url?: string }> {
  try {
    if (provider === "credentials") {
      const email = String(options.email || "").trim();
      const password = String(options.password || "");
      if (!email || !password) {
        return { error: "Email and password are required", status: 400 };
      }

      const result = await signInWithEmailAndPassword(auth, email, password);
      if (result.user && !result.user.emailVerified && shouldRequireEmailVerification()) {
        const actionCodeSettings =
          typeof window !== "undefined"
            ? {
                url: `${window.location.origin}/auth/verify-email`,
                handleCodeInApp: true,
              }
            : undefined;
        await sendEmailVerification(result.user, actionCodeSettings).catch(() => undefined);
        await firebaseSignOut(auth);
        return {
          error:
            "Please verify your email address before signing in. Check your inbox for the verification link.",
          status: 403,
        };
      }

      await createServerSessionWithRetry(result.user);
      await bootstrapUser(result.user.displayName || undefined, options.inviteToken);

      const url = options.callbackUrl || "/dashboard";
      if (options.redirect !== false && typeof window !== "undefined") {
        window.location.href = url;
      }

      return { ok: true, status: 200, url };
    }

    if (provider === "google") {
      const result = await signInWithPopup(auth, googleProvider);
      await createServerSessionWithRetry(result.user);
      await bootstrapUser(result.user.displayName || undefined, options.inviteToken);

      const url = options.callbackUrl || "/dashboard";
      if (options.redirect !== false && typeof window !== "undefined") {
        window.location.href = url;
      }

      return { ok: true, status: 200, url };
    }

    return { error: `Unsupported provider: ${provider}`, status: 400 };
  } catch (error) {
    return {
      error: toErrorMessage(error),
      status: 401,
    };
  }
}

export async function signOut(options: { callbackUrl?: string } = {}): Promise<void> {
  await firebaseSignOut(auth).catch(() => undefined);
  await clearServerSession().catch(() => undefined);

  if (options.callbackUrl && typeof window !== "undefined") {
    window.location.href = options.callbackUrl;
  }
}
