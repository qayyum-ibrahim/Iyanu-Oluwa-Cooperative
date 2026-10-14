// Money is whole kobo, held as bigint (D-15). 1 naira = 100 kobo.
// Nothing here uses floating-point numbers.

export type Kobo = bigint;

export class MoneyError extends Error {}

// Safety cap: at most 12 digits of naira (₦999,999,999,999.99).
const NAIRA_PATTERN = /^(\d{1,12})(?:\.(\d{1,2}))?$/;

/**
 * Turn a naira string such as "20000" or "20000.50" into whole kobo.
 * Accepts only digits with an optional "." and 1 or 2 decimals.
 * Rejects numbers, spaces, signs, commas, symbols and 3 or more decimals.
 * Zero is allowed here. Whether an amount must be above zero is a
 * rule for the caller.
 */
export function parseNaira(input: unknown): Kobo {
  if (typeof input !== "string") {
    throw new MoneyError("Amount must be a string such as \"20000.50\".");
  }
  const match = NAIRA_PATTERN.exec(input);
  if (!match) {
    throw new MoneyError(
      "Amount must be digits with at most 2 decimals, up to 12 digits of naira.",
    );
  }
  const naira = match[1] ?? "0";
  const fraction = (match[2] ?? "").padEnd(2, "0");
  return BigInt(naira) * 100n + BigInt(fraction);
}

/** Show whole kobo as naira, for example 2000000n gives "₦20,000.00". */
export function formatNaira(kobo: Kobo): string {
  const negative = kobo < 0n;
  const abs = negative ? -kobo : kobo;
  const naira = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}₦${naira}.${fraction}`;
}

/** Add whole kobo values. The result is exact. */
export function sumKobo(values: readonly Kobo[]): Kobo {
  return values.reduce((total, value) => total + value, 0n);
}