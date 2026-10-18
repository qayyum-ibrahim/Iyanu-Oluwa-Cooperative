// Payment breakdown check (DR-02). Pure logic: no database, no network.
// Input is what a client sends: a total and lines, with amounts as strings (A-18).
// Output is exact whole kobo (D-15), or a BreakdownError. No tolerance: the lines
// must add up to the total to the last kobo.

import { MoneyError, parseNaira, sumKobo, type Kobo } from "./money.js";
import {
  CategoryError,
  parsePaymentCategory,
  type PaymentCategory,
} from "./categories.js";

export type BreakdownErrorCode =
  | "invalid_input"
  | "invalid_total"
  | "total_not_positive"
  | "no_lines"
  | "invalid_line"
  | "unknown_category"
  | "system_only"
  | "invalid_amount"
  | "amount_not_positive"
  | "mismatch";

export class BreakdownError extends Error {
  readonly code: BreakdownErrorCode;
  /** Position of the bad line (first line is 0). Set only for line errors. */
  readonly lineIndex: number | undefined;
  constructor(code: BreakdownErrorCode, message: string, lineIndex?: number) {
    super(message);
    this.name = "BreakdownError";
    this.code = code;
    this.lineIndex = lineIndex;
  }
}

export interface BreakdownLine {
  readonly category: PaymentCategory;
  readonly amount: Kobo;
}

export interface CheckedBreakdown {
  readonly total: Kobo;
  readonly lines: readonly BreakdownLine[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Reads only the object's own keys, never inherited ones.
function own(obj: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(obj, key) ? obj[key] : undefined;
}

/**
 * Checks a payment breakdown. Order of checks: input shape, total, lines
 * (first bad line wins; within a line the category is checked before the
 * amount), then the sum. Messages never repeat the input.
 */
export function checkBreakdown(input: unknown): CheckedBreakdown {
  if (!isRecord(input)) {
    throw new BreakdownError("invalid_input", "Payment must be an object.");
  }

  let total: Kobo;
  try {
    total = parseNaira(own(input, "total"));
  } catch (e) {
    if (e instanceof MoneyError) {
      throw new BreakdownError("invalid_total", "Total is not a valid amount.");
    }
    throw e;
  }
  if (total <= 0n) {
    throw new BreakdownError("total_not_positive", "Total must be above zero.");
  }

  const rawLines = own(input, "lines");
  if (!Array.isArray(rawLines)) {
    throw new BreakdownError("invalid_input", "Lines must be a list.");
  }
  if (rawLines.length === 0) {
    throw new BreakdownError("no_lines", "A payment needs at least one line.");
  }

  const lines: BreakdownLine[] = [];
  for (let index = 0; index < rawLines.length; index++) {
    const raw: unknown = rawLines[index];
    if (!isRecord(raw)) {
      throw new BreakdownError("invalid_line", "Line must be an object.", index);
    }

    let category: PaymentCategory;
    try {
      category = parsePaymentCategory(own(raw, "category"));
    } catch (e) {
      if (e instanceof CategoryError) {
        const code = e.code === "system_only" ? "system_only" : "unknown_category";
        throw new BreakdownError(code, e.message, index);
      }
      throw e;
    }

    let amount: Kobo;
    try {
      amount = parseNaira(own(raw, "amount"));
    } catch (e) {
      if (e instanceof MoneyError) {
        throw new BreakdownError("invalid_amount", "Line amount is not valid.", index);
      }
      throw e;
    }
    if (amount <= 0n) {
      throw new BreakdownError(
        "amount_not_positive",
        "Line amount must be above zero.",
        index,
      );
    }

    lines.push(Object.freeze({ category, amount }));
  }

  if (sumKobo(lines.map((l) => l.amount)) !== total) {
    throw new BreakdownError("mismatch", "Lines do not add up to the total.");
  }

  return Object.freeze({ total, lines: Object.freeze(lines) });
}