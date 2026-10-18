import { describe, expect, it } from "vitest";
import { BreakdownError, checkBreakdown } from "../src/breakdown.js";

function failure(input: unknown): BreakdownError {
  try {
    checkBreakdown(input);
  } catch (e) {
    if (e instanceof BreakdownError) return e;
    throw e;
  }
  throw new Error("expected checkBreakdown to throw");
}

const GOOD_LINES = [{ category: "Shares", amount: "100" }];

describe("checkBreakdown: accepts", () => {
  it("saves the DR-02 example: 20,000 = 5,000 + 10,000 + 5,000", () => {
    const result = checkBreakdown({
      total: "20000",
      lines: [
        { category: "Shares", amount: "5000" },
        { category: "Savings", amount: "10000" },
        { category: "Special Savings", amount: "5000" },
      ],
    });
    expect(result.total).toBe(2_000_000n);
    expect(result.lines).toHaveLength(3);
  });

  it("returns kobo amounts and categories in the order sent", () => {
    const result = checkBreakdown({
      total: "30.50",
      lines: [
        { category: "Building Funds", amount: "10.25" },
        { category: "Loan Repaid", amount: "20.25" },
      ],
    });
    expect(result.lines.map((l) => l.category)).toEqual(["Building Funds", "Loan Repaid"]);
    expect(result.lines.map((l) => l.amount)).toEqual([1025n, 2025n]);
  });

  it("accepts one line that equals the total", () => {
    const result = checkBreakdown({ total: "0.01", lines: [{ category: "Shares", amount: "0.01" }] });
    expect(result.total).toBe(1n);
  });

  it("is exact where floating-point numbers are not: 0.1 + 0.2 = 0.3", () => {
    const result = checkBreakdown({
      total: "0.3",
      lines: [
        { category: "Shares", amount: "0.1" },
        { category: "Savings", amount: "0.2" },
      ],
    });
    expect(result.total).toBe(30n);
  });

  it("allows the same category on two lines", () => {
    const result = checkBreakdown({
      total: "300",
      lines: [
        { category: "Shares", amount: "100" },
        { category: "Shares", amount: "200" },
      ],
    });
    expect(result.lines).toHaveLength(2);
  });

  it("accepts the largest allowed total", () => {
    const result = checkBreakdown({
      total: "999999999999.99",
      lines: [{ category: "Shares", amount: "999999999999.99" }],
    });
    expect(result.total).toBe(99_999_999_999_999n);
  });

  it("ignores extra keys and returns copies that later input changes cannot reach", () => {
    const input = {
      total: "100",
      extra: 1,
      lines: [{ category: "Shares", amount: "100", note: "x" }],
    };
    const result = checkBreakdown(input);
    input.lines[0]!.amount = "1";
    expect(result.lines[0]!.amount).toBe(10_000n);
    expect(Object.keys(result).sort()).toEqual(["lines", "total"]);
    expect(Object.keys(result.lines[0]!).sort()).toEqual(["amount", "category"]);
  });

  it("returns a result that cannot be changed", () => {
    const result = checkBreakdown({ total: "100", lines: GOOD_LINES });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.lines)).toBe(true);
    expect(Object.isFrozen(result.lines[0])).toBe(true);
  });
});

describe("checkBreakdown: mismatch (no tolerance)", () => {
  it("rejects lines 1 kobo short of the total", () => {
    const e = failure({
      total: "20000",
      lines: [
        { category: "Shares", amount: "5000" },
        { category: "Savings", amount: "10000" },
        { category: "Special Savings", amount: "4999.99" },
      ],
    });
    expect(e.code).toBe("mismatch");
  });

  it("rejects lines 1 kobo over the total", () => {
    const e = failure({
      total: "20000",
      lines: [
        { category: "Shares", amount: "5000" },
        { category: "Savings", amount: "10000" },
        { category: "Special Savings", amount: "5000.01" },
      ],
    });
    expect(e.code).toBe("mismatch");
  });

  it("rejects the DR-02 example breakdown of 19,999", () => {
    const e = failure({
      total: "20000",
      lines: [
        { category: "Shares", amount: "5000" },
        { category: "Savings", amount: "10000" },
        { category: "Special Savings", amount: "4999" },
      ],
    });
    expect(e.code).toBe("mismatch");
    expect(e.lineIndex).toBeUndefined();
  });
});

describe("checkBreakdown: input shape", () => {
  it("rejects input that is not an object", () => {
    const bad: unknown[] = [null, undefined, "x", 5, [], true];
    for (const value of bad) expect(failure(value).code, String(value)).toBe("invalid_input");
  });

  it("rejects lines that are missing or not a list", () => {
    expect(failure({ total: "100" }).code).toBe("invalid_input");
    const bad: unknown[] = [null, "x", {}, 5];
    for (const lines of bad) {
      expect(failure({ total: "100", lines }).code, String(lines)).toBe("invalid_input");
    }
  });

  it("rejects an empty list of lines", () => {
    expect(failure({ total: "100", lines: [] }).code).toBe("no_lines");
  });

  it("does not read inherited properties", () => {
    const input = Object.create({ total: "100", lines: GOOD_LINES }) as unknown;
    expect(failure(input).code).toBe("invalid_total");
  });
});

describe("checkBreakdown: total", () => {
  it("rejects a total that is missing or not a valid amount string", () => {
    expect(failure({ lines: GOOD_LINES }).code).toBe("invalid_total");
    const bad: unknown[] = [20000, null, "", " 5", "-5", "1.234", "1e3", "1,000", {}];
    for (const total of bad) {
      expect(failure({ total, lines: GOOD_LINES }).code, String(total)).toBe("invalid_total");
    }
  });

  it("rejects a total of zero", () => {
    for (const total of ["0", "0.00"]) {
      expect(failure({ total, lines: GOOD_LINES }).code, total).toBe("total_not_positive");
    }
  });
});

describe("checkBreakdown: lines", () => {
  it("rejects a line that is not an object, with its position", () => {
    const bad: unknown[] = [null, "x", 5, []];
    for (const line of bad) {
      const e = failure({ total: "100", lines: [line] });
      expect(e.code, String(line)).toBe("invalid_line");
      expect(e.lineIndex).toBe(0);
    }
  });

  it("rejects a missing or unknown category, with its position", () => {
    const bad: unknown[] = [undefined, "", "shares", " Shares", "Loan", 42, null];
    for (const category of bad) {
      const e = failure({ total: "100", lines: [{ category, amount: "100" }] });
      expect(e.code, String(category)).toBe("unknown_category");
      expect(e.lineIndex).toBe(0);
    }
  });

  it("refuses Membership Withdrawal as system_only", () => {
    const e = failure({
      total: "100",
      lines: [{ category: "Membership Withdrawal", amount: "100" }],
    });
    expect(e.code).toBe("system_only");
    expect(e.lineIndex).toBe(0);
  });

  it("rejects a line amount that is missing or not a valid amount string", () => {
    const bad: unknown[] = [undefined, 100, null, "", "-5", "+5", "1.234", "1,000", "abc"];
    for (const amount of bad) {
      const e = failure({ total: "100", lines: [{ category: "Shares", amount }] });
      expect(e.code, String(amount)).toBe("invalid_amount");
      expect(e.lineIndex).toBe(0);
    }
  });

  it("rejects a line amount of zero", () => {
    for (const amount of ["0", "0.00"]) {
      const e = failure({
        total: "100",
        lines: [
          { category: "Shares", amount: "100" },
          { category: "Savings", amount },
        ],
      });
      expect(e.code, amount).toBe("amount_not_positive");
      expect(e.lineIndex).toBe(1);
    }
  });

  it("reports the first bad line", () => {
    const e = failure({
      total: "100",
      lines: [
        { category: "Shares", amount: "50" },
        { category: "nope", amount: "25" },
        { category: "Savings", amount: "bad" },
      ],
    });
    expect(e.code).toBe("unknown_category");
    expect(e.lineIndex).toBe(1);
  });
});

describe("checkBreakdown: order of checks", () => {
  it("checks the total before the lines", () => {
    expect(failure({ total: "bad", lines: [] }).code).toBe("invalid_total");
    expect(failure({ total: "0", lines: [] }).code).toBe("total_not_positive");
  });

  it("checks every line before the sum", () => {
    const e = failure({
      total: "100",
      lines: [
        { category: "Shares", amount: "10" },
        { category: "Savings", amount: "-1" },
      ],
    });
    expect(e.code).toBe("invalid_amount");
  });

  it("checks the category before the amount on the same line", () => {
    const e = failure({ total: "100", lines: [{ category: "nope", amount: "bad" }] });
    expect(e.code).toBe("unknown_category");
  });
});

describe("BreakdownError", () => {
  it("does not repeat the input in the message", () => {
    const e1 = failure({
      total: "100",
      lines: [{ category: "<script>alert(1)</script>", amount: "100" }],
    });
    expect(e1.message).not.toContain("script");
    const e2 = failure({ total: "100", lines: [{ category: "Shares", amount: "9999.999" }] });
    expect(e2.message).not.toContain("9999");
    const e3 = failure({ total: "7777.777", lines: GOOD_LINES });
    expect(e3.message).not.toContain("7777");
  });

  it("is a named Error with a code", () => {
    const e = failure(null);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("BreakdownError");
    expect(e.code).toBe("invalid_input");
  });
});