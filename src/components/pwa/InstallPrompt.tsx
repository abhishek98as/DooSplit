"use client";

import { useState, useEffect } from 'react';
import { useSession } from "@/lib/auth/react-session";
import { useRouter } from "next/navigation";
import { Download, X, Smartphone, Monitor, Share2 } from 'lucide-react';
import { usePWA } from './PWAProvider';
import Button from '@/components/ui/Button';

interface InstallPromptProps {
  variant?: 'banner' | 'modal' | 'toast'; // Display style
  autoShow?: boolean; // Auto-show after delay
  delay?: number; // Delay before showing (ms)
  position?: 'top' | 'bottom' | 'center'; // Position for banner/toast
}

export default function InstallPrompt({
  variant = 'banner',
  autoShow = true,
  delay = 3000,
  position = 'bottom'
}: InstallPromptProps) {
  const { status } = useSession();
  const router = useRouter();
  const { canInstall, installPrompt, canManualInstall, isSafari } = usePWA();
  const [isVisible, setIsVisible] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const isManualGuidePrompt = canManualInstall && !canInstall;

  // Check if user has already dismissed the prompt
  useEffect(() => {
    const dismissed = localStorage.getItem('install-prompt-dismissed');
    if (dismissed) {
      const dismissedTime = parseInt(dismissed);
      const now = Date.now();
      // Reset dismissal after 7 days
      if (now - dismissedTime > 7 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem('install-prompt-dismissed');
      } else {
        setDismissed(true);
      }
    }
  }, []);

  // Auto-show logic
  useEffect(() => {
    if ((!canInstall && !isManualGuidePrompt) || dismissed || !autoShow) return;

    const timer = setTimeout(() => {
      // Only show if user has interacted with the page
      if (document.visibilityState === 'visible') {
        setIsVisible(true);
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [canInstall, isManualGuidePrompt, dismissed, autoShow, delay]);

  const handlePrimaryAction = async () => {
    if (isManualGuidePrompt) {
      setIsVisible(false);
      router.push('/install');
      return;
    }

    setIsInstalling(true);
    try {
      await installPrompt();
      setIsVisible(false);
    } catch (error) {
      console.error('Install failed:', error);
    } finally {
      setIsInstalling(false);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    setDismissed(true);
    localStorage.setItem('install-prompt-dismissed', Date.now().toString());
  };

  const title = isManualGuidePrompt
    ? 'Add DooSplit to your iPhone'
    : 'Install DooSplit';
  const description = isManualGuidePrompt
    ? isSafari
      ? 'Open Share, choose Add to Home Screen, then Add for the full app-like experience.'
      : 'Open DooSplit in Safari, then use Share and Add to Home Screen.'
    : 'Get offline access, a full-screen app window, and push notifications.';
  const primaryLabel = isManualGuidePrompt
    ? 'View steps'
    : isInstalling
    ? 'Installing...'
    : 'Install App';

  // Don't render if conditions not met or user is not authenticated
  if ((!canInstall && !isManualGuidePrompt) || dismissed || !isVisible || status !== 'authenticated') {
    return null;
  }

  if (variant === 'modal') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-2xl max-w-md mx-4 p-6 relative">
          <button
            onClick={handleDismiss}
            className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
            aria-label="Close install prompt"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="text-center">
            {/* Icon */}
            <div className="mx-auto mb-4 h-16 w-16 bg-primary/10 rounded-2xl flex items-center justify-center">
              {isManualGuidePrompt ? (
                <Share2 className="h-8 w-8 text-primary" />
              ) : (
                <Download className="h-8 w-8 text-primary" />
              )}
            </div>

            {/* Title */}
            <h2 className="text-xl font-bold text-neutral-900 dark:text-dark-text mb-2">
              {title}
            </h2>

            {/* Description */}
            <p className="text-neutral-600 dark:text-dark-text-secondary mb-6">
              {description}
            </p>

            {/* Features */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="flex items-center gap-2 text-sm">
                <div className="h-2 w-2 bg-success rounded-full"></div>
                <span>{isManualGuidePrompt ? 'Safari install guide' : 'Offline access'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="h-2 w-2 bg-success rounded-full"></div>
                <span>{isManualGuidePrompt ? 'Home Screen shortcut' : 'Push notifications'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Monitor className="h-4 w-4 text-info" />
                <span>{isManualGuidePrompt ? 'Standalone launch' : 'Desktop app'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Smartphone className="h-4 w-4 text-info" />
                <span>{isManualGuidePrompt ? 'Notification ready' : 'Mobile ready'}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={handleDismiss}
                className="flex-1"
                disabled={isInstalling}
              >
                Maybe Later
              </Button>
              <Button
                onClick={handlePrimaryAction}
                className="flex-1"
                disabled={isInstalling}
              >
                {primaryLabel}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'toast') {
    const positionClasses = position === 'top'
      ? 'top-4 left-1/2 -translate-x-1/2'
      : position === 'bottom'
      ? 'bottom-4 left-1/2 -translate-x-1/2'
      : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2';

    return (
      <div className={`fixed ${positionClasses} z-50 animate-in slide-in-from-bottom-2`}>
        <div className="bg-white dark:bg-dark-bg-secondary border border-neutral-200 dark:border-dark-border rounded-lg shadow-lg p-4 max-w-sm">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
              {isManualGuidePrompt ? (
                <Share2 className="h-5 w-5 text-primary" />
              ) : (
                <Download className="h-5 w-5 text-primary" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-neutral-900 dark:text-dark-text">
                {title}
              </h3>
              <p className="text-sm text-neutral-600 dark:text-dark-text-secondary mt-1">
                {description}
              </p>

              <div className="flex gap-2 mt-3">
                <Button size="sm" onClick={handlePrimaryAction} disabled={isInstalling}>
                  {isManualGuidePrompt ? 'View steps' : primaryLabel}
                </Button>
                <Button size="sm" variant="secondary" onClick={handleDismiss}>
                  Later
                </Button>
              </div>
            </div>

            <button
              onClick={handleDismiss}
              className="text-neutral-400 hover:text-neutral-600 p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Default: banner variant
  const positionClasses = position === 'top'
    ? 'top-0 left-0 right-0'
    : 'bottom-0 left-0 right-0';

  return (
    <div className={`fixed ${positionClasses} z-40 bg-white dark:bg-dark-bg-secondary border-t border-neutral-200 dark:border-dark-border shadow-lg`}>
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center">
              {isManualGuidePrompt ? (
                <Share2 className="h-5 w-5 text-primary" />
              ) : (
                <Download className="h-5 w-5 text-primary" />
              )}
            </div>

            <div>
              <h3 className="font-semibold text-neutral-900 dark:text-dark-text">
                {title}
              </h3>
              <p className="text-sm text-neutral-600 dark:text-dark-text-secondary">
                {description}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={handleDismiss}
              disabled={isInstalling}
            >
              Later
            </Button>
            <Button
              size="sm"
              onClick={handlePrimaryAction}
              disabled={isInstalling}
            >
              {primaryLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Hook for managing install prompt state
export function useInstallPrompt() {
  const { canInstall, installPrompt, canManualInstall } = usePWA();
  const [userDismissed, setUserDismissed] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem('install-prompt-dismissed');
    if (dismissed) {
      setUserDismissed(true);
    }
  }, []);

  const dismiss = () => {
    setUserDismissed(true);
    localStorage.setItem('install-prompt-dismissed', Date.now().toString());
  };

  const reset = () => {
    setUserDismissed(false);
    localStorage.removeItem('install-prompt-dismissed');
  };

  return {
    canShow: (canInstall || canManualInstall) && !userDismissed,
    install: installPrompt,
    dismiss,
    reset,
  };
}
