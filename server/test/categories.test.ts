import { describe, expect, it } from "vitest";
import {
  CategoryError,
  PAYMENT_CATEGORIES,
  PAYMENT_CATEGORY_TABLE,
  REFUNDABLE_CATEGORIES,
  SYSTEM_ONLY_CATEGORY,
  isPaymentCategory,
  isRefundable,
  parsePaymentCategory,
  type PaymentCategory,
} from "../src/categories.js";

// Written out by hand on purpose: these lists pin the table. Do not build them from the table.
const EXPECTED_NAMES = [
  "Shares",
  "Savings",
  "Special Savings",
  "Development Levy",
  "Loan Repaid",
  "Loan Interest",
  "Entrance Fee",
  "Stationeries",
  "Empowerment Repaid",
  "Committee Gift",
  "Special Deposit",
  "Investment Repaid",
  "Investment Income",
  "Building Funds",
];
const EXPECTED_REFUNDABLE = [
  "Shares",
  "Savings",
  "Special Savings",
  "Special Deposit",
  "Building Funds",
];

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof CategoryError) return e.code;
    throw e;
  }
  return undefined;
}

describe("payment category table", () => {
  it("lists exactly the 14 categories of DR-04, in order", () => {
    expect([...PAYMENT_CATEGORIES]).toEqual(EXPECTED_NAMES);
    expect(PAYMENT_CATEGORY_TABLE.map((c) => c.name)).toEqual(EXPECTED_NAMES);
  });

  it("has no duplicate, blank or space-padded names", () => {
    expect(new Set(EXPECTED_NAMES).size).toBe(EXPECTED_NAMES.length);
    for (const c of PAYMENT_CATEGORY_TABLE) {
      expect(c.name.trim()).toBe(c.name);
      expect(c.name.length).toBeGreaterThan(0);
    }
  });

  it("does not list Membership Withdrawal, which is system-only", () => {
    expect(SYSTEM_ONLY_CATEGORY).toBe("Membership Withdrawal");
    expect(PAYMENT_CATEGORIES).not.toContain("Membership Withdrawal");
  });

  it("marks exactly the five refundable categories of DR-03", () => {
    expect([...REFUNDABLE_CATEGORIES]).toEqual(EXPECTED_REFUNDABLE);
  });

  it("gives the right refundable answer for every category", () => {
    for (const name of EXPECTED_NAMES) {
      expect(isRefundable(name as PaymentCategory), name).toBe(EXPECTED_REFUNDABLE.includes(name));
    }
  });

  it("exports lists that cannot be changed at run time", () => {
    expect(Object.isFrozen(PAYMENT_CATEGORIES)).toBe(true);
    expect(Object.isFrozen(REFUNDABLE_CATEGORIES)).toBe(true);
  });
});

describe("isPaymentCategory", () => {
  it("accepts every category name", () => {
    for (const name of EXPECTED_NAMES) expect(isPaymentCategory(name), name).toBe(true);
  });

  it("accepts nothing else", () => {
    const bad: unknown[] = [
      "",
      "shares",
      "SHARES",
      " Shares",
      "Shares ",
      "Special  Savings",
      "Membership Withdrawal",
      "constructor",
      "__proto__",
      "toString",
      42,
      null,
      undefined,
      {},
      ["Shares"],
    ];
    for (const value of bad) expect(isPaymentCategory(value), String(value)).toBe(false);
  });
});

describe("parsePaymentCategory", () => {
  it("returns every valid category unchanged", () => {
    for (const name of EXPECTED_NAMES) expect(parsePaymentCategory(name)).toBe(name);
  });

  it("refuses Membership Withdrawal with the code system_only", () => {
    expect(codeOf(() => parsePaymentCategory("Membership Withdrawal"))).toBe("system_only");
  });

  it("refuses anything else not in the table with the code unknown", () => {
    const bad: unknown[] = [
      "",
      "shares",
      " Shares",
      "membership withdrawal",
      "Loan",
      "constructor",
      "__proto__",
      42,
      null,
      undefined,
      {},
      ["Shares"],
    ];
    for (const value of bad) expect(codeOf(() => parsePaymentCategory(value)), String(value)).toBe("unknown");
  });

  it("does not repeat the input in the error message", () => {
    try {
      parsePaymentCategory("<script>alert(1)</script>");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(CategoryError);
      expect((e as Error).message).not.toContain("script");
    }
  });
});

describe("isRefundable with bad input", () => {
  it("answers false for names that are not payment categories", () => {
    for (const value of ["nope", "constructor", "Membership Withdrawal", ""]) {
      expect(isRefundable(value as unknown as PaymentCategory), value).toBe(false);
    }
  });
});
