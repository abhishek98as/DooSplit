"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Button, Card, Input } from "@/components/ui";
import AppShell from "@/components/layout/AppShell";
import {
  Copy,
  Share2,
  Mail,
  MessageCircle,
  Check,
  Send,
  UserPlus,
  Clock,
  CheckCircle2,
  Link2,
  Loader2,
  AlertCircle,
} from "lucide-react";

interface Invitation {
  _id: string;
  email: string;
  status: "pending" | "accepted" | "expired";
  createdAt: string;
  expiresAt: string;
}

export default function InvitePage() {
  const { data: session } = useSession();
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{
    type: "success" | "error";
    message: string;
    inviteLink?: string;
  } | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(true);

  const appUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const genericLink = `${appUrl}/auth/register?ref=${session?.user?.id || ""}`;

  const fetchInvitations = useCallback(async () => {
    try {
      const res = await fetch("/api/invitations");
      const data = await res.json();
      if (data.invitations) {
        setInvitations(data.invitations);
      }
    } catch {
      // silent fail
    } finally {
      setLoadingInvitations(false);
    }
  }, []);

  useEffect(() => {
    fetchInvitations();
  }, [fetchInvitations]);

  const copyToClipboard = async (text?: string) => {
    try {
      await navigator.clipboard.writeText(text || genericLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const shareViaWhatsApp = () => {
    const msg = encodeURIComponent(
      `Hey! I'm using DooSplit to track and split expenses. Join me:\n\n${genericLink}`
    );
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  };

  const shareViaNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join DooSplit",
          text: "Track and split expenses with friends!",
          url: genericLink,
        });
      } catch {
        // user cancelled
      }
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendResult(null);
    setSending(true);

    try {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSendResult({ type: "error", message: data.error });
        return;
      }

      setSendResult({
        type: "success",
        message: data.emailSent
          ? `Invitation email sent to ${email}!`
          : `Invitation created! Email couldn't be sent — share the link manually.`,
        inviteLink: data.invitation?.inviteLink,
      });
      setEmail("");
      fetchInvitations();
    } catch {
      setSendResult({ type: "error", message: "Something went wrong" });
    } finally {
      setSending(false);
    }
  };

  const getStatusBadge = (status: string, expiresAt: string) => {
    if (status === "accepted") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle2 className="h-3 w-3" />
          Joined
        </span>
      );
    }
    if (new Date(expiresAt) < new Date()) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-neutral-100 text-neutral-500 dark:bg-dark-bg-tertiary dark:text-dark-text-tertiary">
          Expired
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
        <Clock className="h-3 w-3" />
        Pending
      </span>
    );
  };

  return (
    <AppShell>
    <div className="p-6 max-w-4xl mx-auto">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-dark-text mb-2 flex items-center gap-3">
          <UserPlus className="h-7 w-7 text-primary" />
          Invite Friends
        </h1>
        <p className="text-neutral-600 dark:text-dark-text-secondary">
          Invite friends via email or share a link — start splitting expenses
          together!
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Email Invitation Card */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Mail className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-dark-text">
                Invite via Email
              </h2>
              <p className="text-sm text-neutral-500 dark:text-dark-text-tertiary">
                Send a beautiful invitation email
              </p>
            </div>
          </div>

          <form onSubmit={handleSendInvite} className="space-y-4">
            <Input
              label="Friend's Email"
              type="email"
              placeholder="friend@example.com"
              icon={<Mail className="h-5 w-5" />}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              isLoading={sending}
            >
              <Send className="h-4 w-4 mr-2" />
              Send Invitation
            </Button>
          </form>

          {sendResult && (
            <div
              className={`mt-4 p-4 rounded-lg text-sm ${
                sendResult.type === "success"
                  ? "bg-green-50 border border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400"
                  : "bg-red-50 border border-red-200 text-red-600 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400"
              }`}
            >
              <div className="flex items-start gap-2">
                {sendResult.type === "success" ? (
                  <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                )}
                <div>
                  <p>{sendResult.message}</p>
                  {sendResult.inviteLink && (
                    <button
                      onClick={() => copyToClipboard(sendResult.inviteLink)}
                      className="mt-2 text-primary underline text-xs hover:no-underline"
                    >
                      Copy invite link
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Share Link Card */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-10 w-10 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
              <Link2 className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-dark-text">
                Share Invite Link
              </h2>
              <p className="text-sm text-neutral-500 dark:text-dark-text-tertiary">
                Share via any app or messaging platform
              </p>
            </div>
          </div>

          <div className="mb-5">
            <label className="block text-sm font-medium text-neutral-700 dark:text-dark-text-secondary mb-2">
              Your Personal Link
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={genericLink}
                readOnly
                className="flex-1 px-3 py-2.5 border border-neutral-300 dark:border-dark-border rounded-lg bg-neutral-50 dark:bg-dark-bg-tertiary text-sm text-neutral-900 dark:text-dark-text truncate"
              />
              <Button onClick={() => copyToClipboard()} variant="secondary" size="sm">
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            {copied && (
              <p className="text-sm text-green-600 mt-2">
                Copied to clipboard!
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Button
              onClick={shareViaWhatsApp}
              variant="secondary"
              className="w-full justify-start"
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              Share via WhatsApp
            </Button>
            {typeof navigator !== "undefined" && "share" in navigator && (
              <Button
                onClick={shareViaNativeShare}
                variant="secondary"
                className="w-full justify-start"
              >
                <Share2 className="h-4 w-4 mr-2" />
                Share via...
              </Button>
            )}
          </div>
        </Card>
      </div>

      {/* Sent Invitations List */}
      <Card className="p-6 mt-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-dark-text flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Sent Invitations
          </h2>
          <span className="text-sm text-neutral-500 dark:text-dark-text-tertiary">
            {invitations.length} sent
          </span>
        </div>

        {loadingInvitations ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 text-primary animate-spin" />
          </div>
        ) : invitations.length === 0 ? (
          <div className="text-center py-8">
            <Mail className="h-10 w-10 text-neutral-300 dark:text-dark-text-tertiary mx-auto mb-3" />
            <p className="text-neutral-500 dark:text-dark-text-tertiary">
              No invitations sent yet. Invite your first friend!
            </p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-100 dark:divide-dark-border">
            {invitations.map((inv) => (
              <div
                key={inv._id}
                className="flex items-center justify-between py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Mail className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900 dark:text-dark-text truncate">
                      {inv.email}
                    </p>
                    <p className="text-xs text-neutral-400 dark:text-dark-text-tertiary">
                      {new Date(inv.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </div>
                {getStatusBadge(inv.status, inv.expiresAt)}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Tips */}
      <Card className="p-6 mt-6 bg-primary/5 dark:bg-primary/10 border-primary/20">
        <h3 className="font-semibold text-neutral-900 dark:text-dark-text mb-3">
          💡 How It Works
        </h3>
        <ul className="space-y-2 text-sm text-neutral-700 dark:text-dark-text-secondary">
          <li className="flex items-start gap-2">
            <span className="text-primary font-bold">1.</span>
            <span>
              <strong>Email invite:</strong> Enter your friend&apos;s email and
              we&apos;ll send them a beautiful invitation with a unique link.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary font-bold">2.</span>
            <span>
              <strong>Link invite:</strong> Copy your personal link and share it
              via WhatsApp, Telegram, or any app.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary font-bold">3.</span>
            <span>
              When they sign up via your email invite, they&apos;re{" "}
              <strong>automatically added as your friend</strong> — no extra
              steps!
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary font-bold">4.</span>
            <span>
              Start creating groups and splitting expenses instantly! 🎉
            </span>
          </li>
        </ul>
      </Card>
    </div>
    </AppShell>
  );
}
