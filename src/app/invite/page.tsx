"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Button, Card } from "@/components/ui";
import { Copy, Share2, Mail, MessageCircle, Check } from "lucide-react";

export default function InvitePage() {
  const { data: session } = useSession();
  const [copied, setCopied] = useState(false);

  const appUrl = typeof window !== "undefined" 
    ? window.location.origin 
    : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  
  const inviteLink = `${appUrl}/auth/register?ref=${session?.user?.id || ""}`;
  const inviteMessage = `Hey! I'm using DooSplit to track and split expenses with friends. Join me on DooSplit:\n\n${inviteLink}`;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const shareViaEmail = () => {
    const subject = encodeURIComponent("Join me on DooSplit!");
    const body = encodeURIComponent(inviteMessage);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const shareViaWhatsApp = () => {
    const text = encodeURIComponent(inviteMessage);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const shareViaNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join DooSplit",
          text: "Track and split expenses with friends!",
          url: inviteLink,
        });
      } catch (err) {
        console.error("Share failed:", err);
      }
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-h3 font-bold text-neutral-900 dark:text-dark-text mb-2">
          Invite Friends
        </h1>
        <p className="text-neutral-600 dark:text-dark-text-secondary">
          Share DooSplit with your friends and start splitting expenses together
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Share2 className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-h4 font-semibold text-neutral-900 dark:text-dark-text">
              Share Invite Link
            </h2>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-neutral-700 dark:text-dark-text-secondary mb-2">
              Your Personal Invite Link
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={inviteLink}
                readOnly
                className="flex-1 px-3 py-2 border border-neutral-300 dark:border-dark-border rounded-lg bg-neutral-50 dark:bg-dark-bg-tertiary text-sm text-neutral-900 dark:text-dark-text"
              />
              <Button
                onClick={copyToClipboard}
                className="px-4"
                variant="secondary"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-success" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            {copied && (
              <p className="text-sm text-success mt-2">
                Link copied to clipboard!
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Button
              onClick={shareViaEmail}
              variant="secondary"
              className="w-full justify-start"
            >
              <Mail className="h-4 w-4 mr-2" />
              Share via Email
            </Button>
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

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-full bg-secondary/10 flex items-center justify-center">
              <MessageCircle className="h-5 w-5 text-secondary" />
            </div>
            <h2 className="text-h4 font-semibold text-neutral-900 dark:text-dark-text">
              Invite Message
            </h2>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-dark-text-secondary mb-2">
              Copy & Paste This Message
            </label>
            <textarea
              value={inviteMessage}
              readOnly
              rows={6}
              className="w-full px-3 py-2 border border-neutral-300 dark:border-dark-border rounded-lg bg-neutral-50 dark:bg-dark-bg-tertiary text-sm text-neutral-900 dark:text-dark-text resize-none"
            />
          </div>
        </Card>
      </div>

      <Card className="p-6 mt-6 bg-primary/5 dark:bg-primary/10 border-primary/20">
        <h3 className="text-h5 font-semibold text-neutral-900 dark:text-dark-text mb-3">
          💡 How to Invite Friends
        </h3>
        <ul className="space-y-2 text-sm text-neutral-700 dark:text-dark-text-secondary">
          <li className="flex items-start gap-2">
            <span className="text-primary font-bold">1.</span>
            <span>
              Share your invite link via WhatsApp, Email, SMS, or any messaging app
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary font-bold">2.</span>
            <span>
              Your friends will click the link and land on the registration page
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary font-bold">3.</span>
            <span>
              After they sign up, go to the Friends page to send them a friend request
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary font-bold">4.</span>
            <span>
              Once they accept, you can start creating groups and splitting expenses!
            </span>
          </li>
        </ul>
      </Card>

      <Card className="p-6 mt-6 bg-secondary/5 dark:bg-secondary/10 border-secondary/20">
        <h3 className="text-h5 font-semibold text-neutral-900 dark:text-dark-text mb-3">
          📱 Using Without a Custom Domain
        </h3>
        <p className="text-sm text-neutral-700 dark:text-dark-text-secondary mb-3">
          Since you've deployed on Vercel, your app is available at:
        </p>
        <div className="bg-white dark:bg-dark-bg rounded-lg p-3 border border-neutral-200 dark:border-dark-border">
          <code className="text-sm text-primary">
            https://your-app-name.vercel.app
          </code>
        </div>
        <p className="text-sm text-neutral-700 dark:text-dark-text-secondary mt-3">
          Friends can access your app anytime using this Vercel URL. No custom domain needed!
        </p>
      </Card>
    </div>
  );
}
