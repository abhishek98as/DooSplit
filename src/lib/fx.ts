/**
 * FX helpers — convert amounts between currencies for balance math.
 * Rates are units of INR per 1 unit of currency (INR = 1).
 * Optionally refreshed from Frankfurter (ECB) when FX_LIVE_RATES=true.
 */
import "server-only";

/** Fallback static rates (INR per 1 unit). Good enough offline / without network. */
export const FALLBACK_RATES_TO_INR: Record<string, number> = {
  INR: 1,
  USD: 83.5,
  EUR: 90.2,
  GBP: 105.5,
  AED: 22.7,
  SGD: 62.0,
  AUD: 54.5,
  CAD: 60.5,
  JPY: 0.56,
  CNY: 11.5,
  THB: 2.4,
  MYR: 18.5,
  NPR: 0.625,
  PKR: 0.3,
  BDT: 0.7,
  LKR: 0.27,
};

let cachedRates: Record<string, number> | null = null;
let cachedAtMs = 0;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function normalizeCurrency(code: string | null | undefined): string {
  const c = String(code || "INR").trim().toUpperCase();
  return c || "INR";
}

async function fetchLiveRatesToInr(): Promise<Record<string, number> | null> {
  try {
    // Frankfurter: rates relative to USD; convert via USD→INR
    const res = await fetch(
      "https://api.frankfurter.app/latest?from=USD&to=INR,EUR,GBP,AED,SGD,AUD,CAD,JPY,CNY,THB,MYR",
      { next: { revalidate: 21600 } as any }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { rates?: Record<string, number> };
    const usdToInr = Number(data.rates?.INR);
    if (!usdToInr || !Number.isFinite(usdToInr)) return null;

    const rates: Record<string, number> = { ...FALLBACK_RATES_TO_INR, USD: usdToInr, INR: 1 };
    for (const [code, perUsd] of Object.entries(data.rates || {})) {
      if (code === "INR") continue;
      // 1 CODE = perUsd USD → * usdToInr = INR
      rates[code] = Number((Number(perUsd) * usdToInr).toFixed(6));
    }
    return rates;
  } catch {
    return null;
  }
}

export async function getRatesToInr(): Promise<Record<string, number>> {
  const liveEnabled = process.env.FX_LIVE_RATES === "true";
  if (!liveEnabled) {
    return { ...FALLBACK_RATES_TO_INR };
  }

  const now = Date.now();
  if (cachedRates && now - cachedAtMs < CACHE_TTL_MS) {
    return cachedRates;
  }

  const live = await fetchLiveRatesToInr();
  cachedRates = live || { ...FALLBACK_RATES_TO_INR };
  cachedAtMs = now;
  return cachedRates;
}

export function convertAmountSync(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  ratesToInr: Record<string, number> = FALLBACK_RATES_TO_INR
): number {
  const from = normalizeCurrency(fromCurrency);
  const to = normalizeCurrency(toCurrency);
  if (!Number.isFinite(amount) || amount === 0) return 0;
  if (from === to) return Number(amount.toFixed(2));

  const fromRate = ratesToInr[from];
  const toRate = ratesToInr[to];
  if (!fromRate || !toRate) {
    // Unknown currency — leave unconverted rather than inventing a rate
    return Number(amount.toFixed(2));
  }

  const inInr = amount * fromRate;
  return Number((inInr / toRate).toFixed(2));
}

export async function convertAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): Promise<number> {
  const rates = await getRatesToInr();
  return convertAmountSync(amount, fromCurrency, toCurrency, rates);
}
