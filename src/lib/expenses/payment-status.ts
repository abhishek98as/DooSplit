export const PAYMENT_STATUS_VALUES = [
  "unpaid",
  "partially_paid",
  "paid",
  "disputed",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUS_VALUES)[number];

export function isPaymentStatus(value: any): value is PaymentStatus {
  return PAYMENT_STATUS_VALUES.includes(String(value || "") as PaymentStatus);
}

export function normalizePaymentStatus(
  value: any,
  fallback: PaymentStatus = "unpaid"
): PaymentStatus {
  return isPaymentStatus(value) ? value : fallback;
}

export function derivePaymentStatusFromSettledFlags(
  settledFlags: boolean[],
  fallback: PaymentStatus = "unpaid"
): PaymentStatus {
  if (settledFlags.length === 0) {
    return fallback;
  }

  const settledCount = settledFlags.filter(Boolean).length;
  if (settledCount === 0) {
    return "unpaid";
  }

  if (settledCount === settledFlags.length) {
    return "paid";
  }

  return "partially_paid";
}

export function getPaymentStatusLabel(status: PaymentStatus): string {
  switch (status) {
    case "unpaid":
      return "Unpaid";
    case "partially_paid":
      return "Partially Paid";
    case "paid":
      return "Paid";
    case "disputed":
      return "Disputed";
    default:
      return "Unpaid";
  }
}