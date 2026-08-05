"use client";

import { useProAccess } from "@/contexts/ProAccessContext";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { Crown, Sparkles } from "lucide-react";

export function ProBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full bg-coral/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-coral ${className}`}
    >
      <Crown className="h-2.5 w-2.5" />
      Pro
    </span>
  );
}

/** Global upgrade modal — mounted once in Providers. */
export function ProUpgradeModal() {
  const { upgradeOpen, upgradeFeature, closeUpgrade, isPro } = useProAccess();

  if (isPro) return null;

  return (
    <Modal isOpen={upgradeOpen} onClose={closeUpgrade} title="DooSplit Pro">
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl bg-coral/10 p-4">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-coral" />
          <div>
            <p className="text-sm font-semibold text-neutral-900 dark:text-dark-text">
              {upgradeFeature
                ? `${upgradeFeature} is a Pro feature`
                : "Unlock Pro features"}
            </p>
            <p className="mt-1 text-xs text-neutral-600 dark:text-dark-text-secondary">
              Pro includes charts, settle-up reminder schedules, default split
              preferences, and advanced export options.
            </p>
          </div>
        </div>
        <ul className="space-y-2 text-sm text-neutral-700 dark:text-dark-text-secondary">
          <li className="flex items-center gap-2">
            <span className="text-primary">✓</span> Group expense charts
          </li>
          <li className="flex items-center gap-2">
            <span className="text-primary">✓</span> Settle-up reminder scheduling
          </li>
          <li className="flex items-center gap-2">
            <span className="text-primary">✓</span> Personal default split per group
          </li>
          <li className="flex items-center gap-2">
            <span className="text-primary">✓</span> Priority export &amp; analytics
          </li>
        </ul>
        <p className="text-xs text-neutral-500 dark:text-dark-text-tertiary">
          Billing is coming soon. Contact support or set{" "}
          <code className="rounded bg-neutral-100 px-1 dark:bg-dark-bg-tertiary">
            plan=pro
          </code>{" "}
          on your account to enable Pro during beta.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={closeUpgrade}>
            Not now
          </Button>
          <Button className="flex-1" onClick={closeUpgrade}>
            Got it
          </Button>
        </div>
      </div>
    </Modal>
  );
}
