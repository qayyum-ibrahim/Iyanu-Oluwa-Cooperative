import { describe, expect, it } from "vitest";
import { BalanceError, memberBalances } from "../src/balances.js";

type Line = { id: string; category: string; amount: bigint; loanId: string | null };

function payment(...lines: [string, bigint][]): { lines: Line[] } {
  return { lines: lines.map(([category, amount], i) => ({ id: `l${i}`, category, amount, loanId: null })) };
}

function payOff(...lines: [string, bigint][]): { lines: { id: string; category: string; amount: bigint }[] } {
  return { lines: lines.map(([category, amount], i) => ({ id: `p${i}`, category, amount })) };
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
    const result = memberBalances([], []);
    expect(result.categories.map((c) => c.category)).toEqual(EXPECTED_ORDER);
    for (const c of result.categories) expect(c.balance, c.category).toBe(0n);
    expect(result.refundableTotal).toBe(0n);
    expect(result.nonRefundableTotal).toBe(0n);
  });

  it("works out the DR-05 worked example: payout ₦25,000", () => {
    const result = memberBalances([
      payment(["Shares", 1_200_000n], ["Savings", 800_000n], ["Special Savings", 500_000n]),
      payment(["Development Levy", 100_000n], ["Entrance Fee", 200_000n]),
    ], []);
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
    ], []);
    expect(balanceOf(result, "Savings")).toBe(201n);
    expect(result.refundableTotal).toBe(201n);
  });

  it("counts each of the five refundable categories (DR-03) in the refundable total only", () => {
    const refundable = ["Shares", "Savings", "Special Savings", "Special Deposit", "Building Funds"];
    for (const name of refundable) {
      const result = memberBalances([payment([name, 700n])], []);
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
      const result = memberBalances([payment([name, 700n])], []);
      expect(result.refundableTotal, name).toBe(0n);
      expect(result.nonRefundableTotal, name).toBe(700n);
    }
  });

  it("marks each category refundable or not, as DR-03", () => {
    const result = memberBalances([], []);
    const refundable = result.categories.filter((c) => c.refundable).map((c) => c.category);
    expect(refundable).toEqual(["Shares", "Savings", "Special Savings", "Special Deposit", "Building Funds"]);
  });

  it("counts Loan Repaid lines as a non-refundable balance", () => {
    const result = memberBalances([payment(["Loan Repaid", 2_000_000n], ["Shares", 500n])], []);
    expect(balanceOf(result, "Loan Repaid")).toBe(2_000_000n);
    expect(result.nonRefundableTotal).toBe(2_000_000n);
    expect(result.refundableTotal).toBe(500n);
  });

  it("stays exact above the largest safe JavaScript number", () => {
    const big = 9_007_199_254_740_993n;
    const result = memberBalances([payment(["Shares", big], ["Shares", 1n])], []);
    expect(result.refundableTotal).toBe(9_007_199_254_740_994n);
  });

  it("throws BalanceError for a line whose category is not a payment category", () => {
    for (const bad of ["Membership Withdrawal", "shares", "", "constructor", "Loan"]) {
      expect(() => memberBalances([payment(["Shares", 1n], [bad, 1n])], []), bad).toThrow(BalanceError);
    }
  });

  it("does not repeat the bad category in the error message", () => {
    try {
      memberBalances([payment(["<script>", 1n])], []);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(BalanceError);
      expect((e as Error).message).not.toContain("script");
    }
  });

  it("names the error BalanceError, so the server log shows it", () => {
    try {
      memberBalances([payment(["Loan", 1n])], []);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect((e as Error).name).toBe("BalanceError");
    }
  });

  it("does not change the payments it is given", () => {
    const payments = [payment(["Shares", 10n], ["Savings", 20n])];
    const copy = structuredClone(payments);
    memberBalances(payments, []);
    expect(payments).toEqual(copy);
  });
  it("shows every refundable balance at ₦0 after the DR-05 pay-off and keeps the rest", () => {
    const payments = [
      payment(["Shares", 1_200_000n], ["Savings", 800_000n], ["Special Savings", 500_000n]),
      payment(["Development Levy", 100_000n], ["Entrance Fee", 200_000n]),
    ];
    const result = memberBalances(payments, [
      payOff(["Shares", 1_200_000n], ["Savings", 800_000n], ["Special Savings", 500_000n]),
    ]);
    expect(result.refundableTotal).toBe(0n);
    expect(result.nonRefundableTotal).toBe(300_000n);
    for (const c of result.categories.filter((x) => x.refundable)) expect(c.balance, c.category).toBe(0n);
    expect(balanceOf(result, "Development Levy")).toBe(100_000n);
    expect(balanceOf(result, "Entrance Fee")).toBe(200_000n);
  });

  it("takes each pay-off line off its own category only", () => {
    const result = memberBalances(
      [payment(["Shares", 1_000n], ["Savings", 500n], ["Building Funds", 300n])],
      [payOff(["Shares", 400n], ["Building Funds", 300n])],
    );
    expect(balanceOf(result, "Shares")).toBe(600n);
    expect(balanceOf(result, "Savings")).toBe(500n);
    expect(balanceOf(result, "Building Funds")).toBe(0n);
    expect(result.refundableTotal).toBe(1_100n);
  });

  it("can take off each of the five refundable categories (DR-03)", () => {
    for (const name of ["Shares", "Savings", "Special Savings", "Special Deposit", "Building Funds"]) {
      const result = memberBalances([payment([name, 700n])], [payOff([name, 700n])]);
      expect(balanceOf(result, name), name).toBe(0n);
      expect(result.refundableTotal, name).toBe(0n);
    }
  });

  it("builds new balances from payments after a pay-off (reactivated member, DR-16)", () => {
    const result = memberBalances(
      [payment(["Shares", 5_000n]), payment(["Shares", 2_000n], ["Savings", 1_000n])],
      [payOff(["Shares", 5_000n])],
    );
    expect(balanceOf(result, "Shares")).toBe(2_000n);
    expect(result.refundableTotal).toBe(3_000n);
  });

  it("takes off every line of several pay-offs", () => {
    const result = memberBalances(
      [payment(["Shares", 5_000n]), payment(["Shares", 3_000n])],
      [payOff(["Shares", 5_000n]), payOff(["Shares", 3_000n])],
    );
    expect(balanceOf(result, "Shares")).toBe(0n);
    expect(result.refundableTotal).toBe(0n);
  });

  it("allows a pay-off line that takes a balance to exactly ₦0", () => {
    const result = memberBalances([payment(["Savings", 1n])], [payOff(["Savings", 1n])]);
    expect(balanceOf(result, "Savings")).toBe(0n);
  });

  it("throws BalanceError for a pay-off that takes a balance below ₦0", () => {
    expect(() => memberBalances([payment(["Shares", 100n])], [payOff(["Shares", 101n])])).toThrow(
      "A pay-off paid out more than the balance.",
    );
    expect(() => memberBalances([], [payOff(["Savings", 1n])])).toThrow(BalanceError);
  });

  it("throws BalanceError for a pay-off line whose category is not refundable", () => {
    for (const bad of ["Development Levy", "Loan Repaid", "Membership Withdrawal", "shares", "", "constructor"]) {
      expect(
        () => memberBalances([payment(["Shares", 10n], ["Development Levy", 10n])], [payOff([bad, 1n])]),
        bad,
      ).toThrow("A pay-off line has a category that is not refundable.");
    }
  });

  it("names the pay-off errors BalanceError", () => {
    for (const lines of [[["Entrance Fee", 1n]], [["Shares", 1n]]] as [string, bigint][][]) {
      try {
        memberBalances([payment(["Entrance Fee", 5n])], [payOff(...lines)]);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(BalanceError);
        expect((e as Error).name).toBe("BalanceError");
      }
    }
  });

  it("does not change the pay-offs it is given", () => {
    const payOffs = [payOff(["Shares", 10n])];
    const copy = structuredClone(payOffs);
    memberBalances([payment(["Shares", 10n])], payOffs);
    expect(payOffs).toEqual(copy);
  });
});
