"use client";

import Link from "next/link";
import { useState } from "react";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Monitor,
  ShieldCheck,
  Smartphone,
  Wifi,
} from "lucide-react";
import { usePWA } from "@/components/pwa/PWAProvider";
import Button from "@/components/ui/Button";
import Card, { CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

type GuidePlatform = "android" | "ios" | "desktop";

const INSTALL_GUIDES: Array<{
  id: GuidePlatform;
  title: string;
  summary: string;
  helper: string;
  steps: string[];
}> = [
  {
    id: "android",
    title: "Android with Chrome or Edge",
    summary: "Best option if your users want an app icon without publishing to the Play Store.",
    helper: "Install is built into Chromium-based browsers on Android.",
    steps: [
      "Open DooSplit in Chrome or Edge.",
      "Tap the browser menu.",
      "Choose Install app or Add to Home screen.",
      "Confirm Install to create the app shortcut.",
    ],
  },
  {
    id: "ios",
    title: "iPhone or iPad with Safari",
    summary: "Use the Safari Home Screen flow to get the closest app-like experience on iOS.",
    helper: "If you do not see the install action in another browser, open DooSplit in Safari.",
    steps: [
      "Open DooSplit in Safari.",
      "Tap Share in the browser toolbar.",
      "Choose Add to Home Screen.",
      "If iPhone shows Open as Web App, keep it enabled and tap Add.",
    ],
  },
  {
    id: "desktop",
    title: "Windows or macOS with Chrome or Edge",
    summary: "Desktop users can install DooSplit as a standalone windowed app.",
    helper: "The install icon usually appears in the address bar after the page loads.",
    steps: [
      "Open DooSplit in Chrome or Edge.",
      "Click the install icon in the address bar, or open the browser menu.",
      "Choose Install DooSplit.",
      "Launch it from the taskbar, dock, or desktop like any other app.",
    ],
  },
];

function InstallStepsCard({
  title,
  summary,
  helper,
  steps,
  highlighted,
}: {
  title: string;
  summary: string;
  helper: string;
  steps: string[];
  highlighted: boolean;
}) {
  return (
    <Card className={highlighted ? "border-primary/40 shadow-md" : ""}>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <p className="text-sm text-neutral-600 dark:text-dark-text-secondary">{summary}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-600 dark:bg-dark-bg-tertiary dark:text-dark-text-secondary">
          {helper}
        </div>

        <ol className="space-y-3 text-sm text-neutral-700 dark:text-dark-text-secondary">
          {steps.map((step, index) => (
            <li key={step} className="flex gap-3">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {index + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

export default function InstallGuide() {
  const {
    canInstall,
    installPrompt,
    isStandalone,
    installPlatform,
    isIOS,
    isSafari,
    serviceWorkerRegistered,
  } = usePWA();
  const [isInstalling, setIsInstalling] = useState(false);

  const activeGuide: GuidePlatform =
    installPlatform === "ios"
      ? "ios"
      : installPlatform === "android"
      ? "android"
      : "desktop";

  const handleInstall = async () => {
    if (!canInstall) {
      return;
    }

    setIsInstalling(true);
    try {
      await installPrompt();
    } catch (error) {
      console.error("Install failed:", error);
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <div className="space-y-2">
        <h1 className="text-h1 font-bold text-neutral-900 dark:text-dark-text">
          Install DooSplit
        </h1>
        <p className="max-w-2xl text-body text-neutral-600 dark:text-dark-text-secondary">
          Keep the current Next.js app, then install it on mobile or desktop for a faster
          full-screen experience without app-store publishing.
        </p>
      </div>

      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-white to-white dark:from-primary/10 dark:via-dark-bg-secondary dark:to-dark-bg-secondary">
        <CardContent className="space-y-5 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                <Smartphone className="h-4 w-4" />
                Current device:{" "}
                {installPlatform === "unknown" ? "Browser" : installPlatform.toUpperCase()}
              </div>
              <div>
                <h2 className="text-xl font-semibold text-neutral-900 dark:text-dark-text">
                  {isStandalone
                    ? "DooSplit is already installed on this device."
                    : canInstall
                    ? "This browser can install DooSplit right now."
                    : isIOS
                    ? "Use the Safari Home Screen flow on iPhone."
                    : "Use the browser-specific install steps below."}
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-neutral-600 dark:text-dark-text-secondary">
                  {isStandalone
                    ? "Open DooSplit from your app icon to keep it separate from normal browser tabs."
                    : canInstall
                    ? "The browser has exposed an install prompt, so users can add the app with one confirmation."
                    : isIOS
                    ? isSafari
                      ? "Safari handles iPhone installation through Add to Home Screen instead of the Android-style install prompt."
                      : "Open this same URL in Safari if you want the iPhone install flow to appear consistently."
                    : "Chrome and Edge give the smoothest install flow on Android, Windows, and macOS."}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 md:min-w-52">
              {canInstall ? (
                <Button onClick={handleInstall} isLoading={isInstalling} className="w-full">
                  <Download className="mr-2 h-4 w-4" />
                  Install now
                </Button>
              ) : (
                <Button variant="secondary" className="w-full" disabled>
                  {isStandalone ? "Already installed" : "Follow steps below"}
                </Button>
              )}

              <Link
                href="/dashboard"
                className="inline-flex h-11 items-center justify-center rounded-md border border-neutral-200 px-6 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-dark-border dark:text-dark-text-secondary dark:hover:bg-dark-bg-tertiary"
              >
                Back to dashboard
              </Link>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="flex items-start gap-3 rounded-xl bg-white/80 p-4 dark:bg-dark-bg-tertiary/70">
              <Wifi className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-dark-text">
                  Offline-ready shell
                </p>
                <p className="mt-1 text-xs text-neutral-600 dark:text-dark-text-secondary">
                  Service worker {serviceWorkerRegistered ? "registered" : "initializing"} for install and cache support.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-white/80 p-4 dark:bg-dark-bg-tertiary/70">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-dark-text">
                  Same Firebase backend
                </p>
                <p className="mt-1 text-xs text-neutral-600 dark:text-dark-text-secondary">
                  No separate mobile backend is required for this install path.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-white/80 p-4 dark:bg-dark-bg-tertiary/70">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-dark-text">
                  No app-store fee
                </p>
                <p className="mt-1 text-xs text-neutral-600 dark:text-dark-text-secondary">
                  Users can install directly from the deployed HTTPS site.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {isIOS && !isSafari ? (
        <Card className="border-amber-200 bg-amber-50/70 dark:border-amber-400/30 dark:bg-amber-500/10">
          <CardContent className="flex items-start gap-3 p-5">
            <ExternalLink className="mt-0.5 h-5 w-5 text-amber-600 dark:text-amber-300" />
            <div>
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                For the most reliable iPhone install flow, open this app in Safari.
              </p>
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
                Safari exposes the Add to Home Screen flow used by DooSplit on iPhone and iPad.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {INSTALL_GUIDES.map((guide) => (
          <InstallStepsCard
            key={guide.id}
            title={guide.title}
            summary={guide.summary}
            helper={guide.helper}
            steps={guide.steps}
            highlighted={guide.id === activeGuide}
          />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Monitor className="h-5 w-5 text-primary" />
            Distribution notes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-neutral-600 dark:text-dark-text-secondary">
          <p>
            Android users can install directly from the browser. A Trusted Web Activity is only
            worth doing later if you decide to package the same PWA for Play Store release.
          </p>
          <p>
            iPhone users can use the same deployed site, but installation is manual through Safari
            instead of a native store-free app package.
          </p>
          <p>
            If you later build a React Native or Expo app, keep the Firebase contracts and backend
            services, but assume the current UI and navigation layers will be rewritten.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
