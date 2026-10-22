import { describe, expect, it } from "vitest";
import { BalanceError, memberBalances } from "../src/balances.js";

type Line = { id: string; category: string; amount: bigint; loanId: string | null };

function payment(...lines: [string, bigint][]): { lines: Line[] } {
  return { lines: lines.map(([category, amount], i) => ({ id: `l${i}`, category, amount, loanId: null })) };
}

function balanceOf(result: ReturnType<typeof memberBalances>, category: string): bigint | undefined {
  return result.categories.find((c) => c.category === category)?.balance;
}

// Written out by hand on purpose, as in categories.test.ts.
const EXPECTED_ORDER = [
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

describe("memberBalances", () => {
  it("gives every category at ₦0 and zero totals for a member with no payments", () => {
    const result = memberBalances([]);
    expect(result.categories.map((c) => c.category)).toEqual(EXPECTED_ORDER);
    for (const c of result.categories) expect(c.balance, c.category).toBe(0n);
    expect(result.refundableTotal).toBe(0n);
    expect(result.nonRefundableTotal).toBe(0n);
  });

  it("works out the DR-05 worked example: payout ₦25,000", () => {
    const result = memberBalances([
      payment(["Shares", 1_200_000n], ["Savings", 800_000n], ["Special Savings", 500_000n]),
      payment(["Development Levy", 100_000n], ["Entrance Fee", 200_000n]),
    ]);
    expect(result.refundableTotal).toBe(2_500_000n);
    expect(result.nonRefundableTotal).toBe(300_000n);
    expect(balanceOf(result, "Shares")).toBe(1_200_000n);
    expect(balanceOf(result, "Development Levy")).toBe(100_000n);
    expect(balanceOf(result, "Entrance Fee")).toBe(200_000n);
  });

  it("adds lines of the same category across payments and within one payment", () => {
    const result = memberBalances([
      payment(["Savings", 150n], ["Savings", 50n]),
      payment(["Savings", 1n]),
    ]);
    expect(balanceOf(result, "Savings")).toBe(201n);
    expect(result.refundableTotal).toBe(201n);
  });

  it("counts each of the five refundable categories (DR-03) in the refundable total only", () => {
    const refundable = ["Shares", "Savings", "Special Savings", "Special Deposit", "Building Funds"];
    for (const name of refundable) {
      const result = memberBalances([payment([name, 700n])]);
      expect(result.refundableTotal, name).toBe(700n);
      expect(result.nonRefundableTotal, name).toBe(0n);
    }
  });

  it("counts every other category in the non-refundable total only", () => {
    const others = EXPECTED_ORDER.filter(
      (n) => !["Shares", "Savings", "Special Savings", "Special Deposit", "Building Funds"].includes(n),
    );
    expect(others).toHaveLength(9);
    for (const name of others) {
      const result = memberBalances([payment([name, 700n])]);
      expect(result.refundableTotal, name).toBe(0n);
      expect(result.nonRefundableTotal, name).toBe(700n);
    }
  });

  it("marks each category refundable or not, as DR-03", () => {
    const result = memberBalances([]);
    const refundable = result.categories.filter((c) => c.refundable).map((c) => c.category);
    expect(refundable).toEqual(["Shares", "Savings", "Special Savings", "Special Deposit", "Building Funds"]);
  });

  it("counts Loan Repaid lines as a non-refundable balance", () => {
    const result = memberBalances([payment(["Loan Repaid", 2_000_000n], ["Shares", 500n])]);
    expect(balanceOf(result, "Loan Repaid")).toBe(2_000_000n);
    expect(result.nonRefundableTotal).toBe(2_000_000n);
    expect(result.refundableTotal).toBe(500n);
  });

  it("stays exact above the largest safe JavaScript number", () => {
    const big = 9_007_199_254_740_993n;
    const result = memberBalances([payment(["Shares", big], ["Shares", 1n])]);
    expect(result.refundableTotal).toBe(9_007_199_254_740_994n);
  });

  it("throws BalanceError for a line whose category is not a payment category", () => {
    for (const bad of ["Membership Withdrawal", "shares", "", "constructor", "Loan"]) {
      expect(() => memberBalances([payment(["Shares", 1n], [bad, 1n])]), bad).toThrow(BalanceError);
    }
  });

  it("does not repeat the bad category in the error message", () => {
    try {
      memberBalances([payment(["<script>", 1n])]);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(BalanceError);
      expect((e as Error).message).not.toContain("script");
    }
  });

  it("does not change the payments it is given", () => {
    const payments = [payment(["Shares", 10n], ["Savings", 20n])];
    const copy = structuredClone(payments);
    memberBalances(payments);
    expect(payments).toEqual(copy);
  });
});
