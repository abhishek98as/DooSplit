"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  isHapticPreferenceEnabled,
  isMobileOrTabletDevice,
  previewHapticFeedback,
  setHapticPreferenceEnabled,
  triggerHapticFeedback,
  unlockHapticAudio,
  type HapticKind,
} from "@/lib/haptics";

interface HapticFeedbackContextValue {
  /** Device is phone/tablet — setting + feedback apply only then. */
  isSupportedDevice: boolean;
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  trigger: (kind?: HapticKind) => void;
}

const HapticFeedbackContext = createContext<HapticFeedbackContextValue | undefined>(
  undefined
);

function readSupported(): boolean {
  try {
    return isMobileOrTabletDevice();
  } catch {
    return false;
  }
}

export function HapticFeedbackProvider({ children }: { children: React.ReactNode }) {
  const [isSupportedDevice, setIsSupportedDevice] = useState(false);
  const [enabled, setEnabledState] = useState(false);
  const [mounted, setMounted] = useState(false);

  const refreshDevice = useCallback(() => {
    const supported = readSupported();
    setIsSupportedDevice(supported);
    if (supported) {
      setEnabledState(isHapticPreferenceEnabled());
    } else {
      setEnabledState(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    refreshDevice();

    const mqWidth = window.matchMedia("(max-width: 1024px)");
    const mqPointer = window.matchMedia("(pointer: coarse)");
    const onChange = () => refreshDevice();
    mqWidth.addEventListener?.("change", onChange);
    mqPointer.addEventListener?.("change", onChange);
    window.addEventListener("orientationchange", onChange);
    window.addEventListener("resize", onChange);

    return () => {
      mqWidth.removeEventListener?.("change", onChange);
      mqPointer.removeEventListener?.("change", onChange);
      window.removeEventListener("orientationchange", onChange);
      window.removeEventListener("resize", onChange);
    };
  }, [refreshDevice]);

  // Unlock audio on first user gesture so later success/error sounds work on iOS.
  useEffect(() => {
    if (!mounted || !isSupportedDevice || !enabled) return;

    const unlock = () => {
      void unlockHapticAudio();
    };
    window.addEventListener("pointerdown", unlock, { once: true, passive: true });
    window.addEventListener("touchstart", unlock, { once: true, passive: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, [mounted, isSupportedDevice, enabled]);

  // Light tap feedback on interactive controls (buttons / links / toggles).
  useEffect(() => {
    if (!mounted || !isSupportedDevice || !enabled) return;

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const interactive = target.closest(
        "button, [role='button'], a[href], input[type='submit'], input[type='button'], [data-haptic]"
      ) as HTMLElement | null;
      if (!interactive) return;
      if (interactive.hasAttribute("disabled") || interactive.getAttribute("aria-disabled") === "true") {
        return;
      }
      if (interactive.dataset.haptic === "off") return;

      const kind = (interactive.dataset.haptic as HapticKind | undefined) || "tap";
      triggerHapticFeedback(kind === "off" ? "tap" : kind);
    };

    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [mounted, isSupportedDevice, enabled]);

  const setEnabled = useCallback(
    (next: boolean) => {
      setHapticPreferenceEnabled(next);
      setEnabledState(next);
      if (next && isSupportedDevice) {
        previewHapticFeedback("success");
      }
    },
    [isSupportedDevice]
  );

  const trigger = useCallback(
    (kind: HapticKind = "tap") => {
      if (!isSupportedDevice || !enabled) return;
      triggerHapticFeedback(kind);
    },
    [isSupportedDevice, enabled]
  );

  const value = useMemo(
    () => ({
      isSupportedDevice: mounted ? isSupportedDevice : false,
      enabled: mounted && isSupportedDevice ? enabled : false,
      setEnabled,
      trigger,
    }),
    [mounted, isSupportedDevice, enabled, setEnabled, trigger]
  );

  return (
    <HapticFeedbackContext.Provider value={value}>
      {children}
    </HapticFeedbackContext.Provider>
  );
}

export function useHapticFeedback(): HapticFeedbackContextValue {
  const ctx = useContext(HapticFeedbackContext);
  if (!ctx) {
    return {
      isSupportedDevice: false,
      enabled: false,
      setEnabled: () => {},
      trigger: () => {},
    };
  }
  return ctx;
}
