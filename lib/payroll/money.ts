// Money for payroll. Every amount is a whole number of PAISE (1 rupee = 100 paise) and every percentage a whole number of
// BASIS POINTS (1% = 100). Nothing here, and nothing in the payroll engine, does arithmetic on floating point numbers.
// Shared by the server and the browser (no server-only code).

export type Paise = number;

/** The largest amount accepted anywhere (a trillion rupees), far inside what an integer can hold exactly. */
export const MAX_PAISE = 100_000_000_000_000;

/**
 * a * b / c, rounded half up (0.5 goes away from zero), using big integers so the product can't overflow or lose digits.
 * c must be positive.
 */
export function mulDivRound(a: number, b: number, c: number): number {
  if (!Number.isInteger(a) || !Number.isInteger(b) || !Number.isInteger(c) || c <= 0) {
    throw new Error("mulDivRound needs whole numbers and a positive divisor.");
  }
  const zero = BigInt(0);
  const two = BigInt(2);
  const num = BigInt(a) * BigInt(b);
  const den = BigInt(c);
  const negative = num < zero;
  const abs = negative ? -num : num;
  const q = (abs * two + den) / (two * den); // floor(abs/den + 1/2)
  return Number(negative ? -q : q);
}

/** A percentage of an amount: `bp` basis points of `amount`, rounded half up. 1200 bp of 5,000.00 = 600.00. */
export const percentOf = (amount: Paise, bp: number): Paise => mulDivRound(amount, bp, 10_000);

/** `amount * num / den`, rounded half up. Used for pro-rata pay (num days out of den days). */
export const proRate = (amount: Paise, num: number, den: number): Paise => mulDivRound(amount, num, den);

/**
 * Read an amount typed in rupees ("12,345.67", "₹ 500", "0.5") into paise, or null when it is not a valid
 * non-negative amount with at most two decimals. No floating point is involved: the digits are split as text.
 */
export function parseMoney(input: string): Paise | null {
  const text = String(input ?? "").replace(/[₹,\s]/g, "");
  const m = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(text);
  if (!m) return null;
  const paise = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0");
  return paise < MAX_PAISE ? paise : null;
}

/** 1234567 → "12345.67" (for filling a form box). */
export function toRupeeText(paise: Paise): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Display only: 1234567 → "₹12,345.67". The amount is already exact; this just formats it. */
export function formatMoney(paise: Paise, currency = "INR", locale = "en-IN"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2 }).format(Number(toRupeeText(paise)));
}
