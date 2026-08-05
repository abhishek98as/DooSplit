/**
 * Mobile/tablet haptic + short UI audio feedback.
 * Vibration uses the Vibration API (Android/Chrome). iOS has no vibrate API;
 * soft Web Audio tones still play after a user gesture unlocks AudioContext.
 */

export type HapticKind = "tap" | "success" | "error" | "warning" | "selection";

const STORAGE_KEY = "doosplit-haptic-feedback";

const VIBRATE_PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 10,
  selection: 8,
  success: [12, 40, 18],
  warning: [20, 30, 20],
  error: [35, 45, 35, 45, 50],
};

const TONE_PROFILES: Record<
  HapticKind,
  { freqs: number[]; durationMs: number; volume: number; type: OscillatorType }
> = {
  tap: { freqs: [420], durationMs: 28, volume: 0.04, type: "sine" },
  selection: { freqs: [520], durationMs: 24, volume: 0.035, type: "sine" },
  success: { freqs: [520, 780], durationMs: 55, volume: 0.05, type: "sine" },
  warning: { freqs: [380, 300], durationMs: 70, volume: 0.045, type: "triangle" },
  error: { freqs: [220, 160], durationMs: 90, volume: 0.055, type: "square" },
};

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) {
    audioCtx = new AC();
  }
  return audioCtx;
}

/** Resume AudioContext after a user gesture (required on iOS). */
export async function unlockHapticAudio(): Promise<void> {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      // ignore — browser may still block until a later gesture
    }
  }
}

export function isHapticPreferenceEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === null) return true; // default on for touch devices
    return saved === "true";
  } catch {
    return true;
  }
}

export function setHapticPreferenceEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    // ignore quota / private mode
  }
}

/**
 * True for phones and tablets: coarse pointer / touch + not a wide desktop layout.
 * Hidden on desktop even when the window is narrow (no touch).
 */
export function isMobileOrTabletDevice(): boolean {
  if (typeof window === "undefined") return false;

  const touchCapable =
    navigator.maxTouchPoints > 0 ||
    window.matchMedia("(pointer: coarse)").matches ||
    window.matchMedia("(hover: none)").matches;

  if (!touchCapable) return false;

  // Treat up to large tablets as in-scope; desktops typically exceed this.
  return window.matchMedia("(max-width: 1024px)").matches;
}

function vibrate(kind: HapticKind): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
    return;
  }
  try {
    navigator.vibrate(0); // cancel any ongoing pattern
    navigator.vibrate(VIBRATE_PATTERNS[kind]);
  } catch {
    // Some browsers expose vibrate but throw when unsupported
  }
}

function playTone(kind: HapticKind): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const profile = TONE_PROFILES[kind];
  const now = ctx.currentTime;
  const step = profile.durationMs / 1000 / Math.max(profile.freqs.length, 1);

  profile.freqs.forEach((freq, index) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = profile.type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now);
    const start = now + index * step * 0.85;
    const end = start + step;
    gain.gain.exponentialRampToValueAtTime(profile.volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  });
}

export function triggerHapticFeedback(kind: HapticKind = "tap"): void {
  if (typeof window === "undefined") return;
  if (!isMobileOrTabletDevice()) return;
  if (!isHapticPreferenceEnabled()) return;

  void unlockHapticAudio().then(() => {
    vibrate(kind);
    playTone(kind);
  });
}

/** Force a sample even when preference is off (used when enabling the setting). */
export function previewHapticFeedback(kind: HapticKind = "success"): void {
  if (typeof window === "undefined") return;
  if (!isMobileOrTabletDevice()) return;

  void unlockHapticAudio().then(() => {
    vibrate(kind);
    playTone(kind);
  });
}
