import { describe, expect, it } from "vitest";
import { CategoryError } from "../src/categories.js";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_TABLE,
  MANUAL_EXPENSE_CATEGORIES,
  SYSTEM_ONLY_EXPENSE_CATEGORIES,
  isExpenseCategory,
  isSystemOnlyExpenseCategory,
  parseManualExpenseCategory,
  type ExpenseCategory,
} from "../src/expense-categories.js";

// Written out by hand on purpose: these lists pin the table. Do not build them from the table.
const EXPECTED_NAMES = [
  "Loan",
  "Expenses",
  "Allowances",
  "Members Credit",
  "Membership Withdrawal",
  "Asset Purchase",
  "Office Maintenance",
  "Payment to Union",
  "Payment to Apexes",
  "Others",
];
const EXPECTED_SYSTEM_ONLY = ["Loan", "Membership Withdrawal"];
const EXPECTED_MANUAL = [
  "Expenses",
  "Allowances",
  "Members Credit",
  "Asset Purchase",
  "Office Maintenance",
  "Payment to Union",
  "Payment to Apexes",
  "Others",
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

describe("expense category table", () => {
  it("lists exactly the 10 categories of DR-11, in order", () => {
    expect([...EXPENSE_CATEGORIES]).toEqual(EXPECTED_NAMES);
    expect(EXPENSE_CATEGORY_TABLE.map((c) => c.name)).toEqual(EXPECTED_NAMES);
  });

  it("has no duplicate, blank or space-padded names", () => {
    expect(new Set(EXPECTED_NAMES).size).toBe(EXPECTED_NAMES.length);
    for (const c of EXPENSE_CATEGORY_TABLE) {
      expect(c.name.trim()).toBe(c.name);
      expect(c.name.length).toBeGreaterThan(0);
    }
  });

  it("marks exactly Loan and Membership Withdrawal as system-only (A-148)", () => {
    expect([...SYSTEM_ONLY_EXPENSE_CATEGORIES]).toEqual(EXPECTED_SYSTEM_ONLY);
  });

  it("lets the other 8 be picked by hand, in order", () => {
    expect([...MANUAL_EXPENSE_CATEGORIES]).toEqual(EXPECTED_MANUAL);
  });

  it("gives the right system-only answer for every category", () => {
    for (const name of EXPECTED_NAMES) {
      expect(isSystemOnlyExpenseCategory(name as ExpenseCategory), name).toBe(
        EXPECTED_SYSTEM_ONLY.includes(name),
      );
    }
  });

  it("exports lists that cannot be changed at run time", () => {
    expect(Object.isFrozen(EXPENSE_CATEGORIES)).toBe(true);
    expect(Object.isFrozen(MANUAL_EXPENSE_CATEGORIES)).toBe(true);
    expect(Object.isFrozen(SYSTEM_ONLY_EXPENSE_CATEGORIES)).toBe(true);
  });
});

describe("isExpenseCategory", () => {
  it("accepts every category name, system-only ones included", () => {
    for (const name of EXPECTED_NAMES) expect(isExpenseCategory(name), name).toBe(true);
  });

  it("accepts nothing else", () => {
    const bad: unknown[] = [
      "",
      "loan",
      "LOAN",
      " Loan",
      "Loan ",
      "Payment to  Union",
      "Payment To Union",
      "Shares",
      "Loan Repaid",
      "constructor",
      "__proto__",
      "toString",
      42,
      null,
      undefined,
      {},
      ["Others"],
    ];
    for (const value of bad) expect(isExpenseCategory(value), String(value)).toBe(false);
  });
});

describe("parseManualExpenseCategory", () => {
  it("returns every category that can be picked by hand, unchanged", () => {
    for (const name of EXPECTED_MANUAL) expect(parseManualExpenseCategory(name)).toBe(name);
  });

  it("refuses Loan and Membership Withdrawal with the code system_only", () => {
    for (const name of EXPECTED_SYSTEM_ONLY) {
      expect(codeOf(() => parseManualExpenseCategory(name)), name).toBe("system_only");
    }
  });

  it("refuses anything not in the table with the code unknown", () => {
    const bad: unknown[] = [
      "",
      "loan",
      " Loan",
      "membership withdrawal",
      "others",
      "Shares",
      "constructor",
      "__proto__",
      42,
      null,
      undefined,
      {},
      ["Others"],
    ];
    for (const value of bad) {
      expect(codeOf(() => parseManualExpenseCategory(value)), String(value)).toBe("unknown");
    }
  });

  it("does not repeat the input in the error message", () => {
    try {
      parseManualExpenseCategory("<script>alert(1)</script>");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(CategoryError);
      expect((e as Error).message).not.toContain("script");
    }
  });
});

describe("isSystemOnlyExpenseCategory with bad input", () => {
  it("answers false for names that are not expense categories", () => {
    for (const value of ["nope", "constructor", "loan", ""]) {
      expect(isSystemOnlyExpenseCategory(value as unknown as ExpenseCategory), value).toBe(false);
    }
  });
});
