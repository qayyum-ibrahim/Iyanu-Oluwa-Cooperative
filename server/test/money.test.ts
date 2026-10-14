import { describe, expect, it } from "vitest";
import { formatNaira, MoneyError, parseNaira, sumKobo } from "../src/money.js";

describe("parseNaira: valid input", () => {
  it.each([
    ["20000", 2_000_000n],
    ["20000.5", 2_000_050n],
    ["20000.50", 2_000_050n],
    ["19999.99", 1_999_999n],
    ["0.05", 5n],
    ["0.5", 50n],
    ["0", 0n],
    ["0.00", 0n],
    ["007", 700n],
    ["999999999999.99", 99_999_999_999_999n],
  ])("parses %s as %s kobo", (input, expected) => {
    expect(parseNaira(input)).toBe(expected);
  });
});

describe("parseNaira: invalid input", () => {
  it.each([
    ["3 decimals", "1.234"],
    ["3 decimals ending in zero", "1.230"],
    ["empty", ""],
    ["leading space", " 5"],
    ["trailing space", "5 "],
    ["negative", "-5"],
    ["plus sign", "+5"],
    ["comma", "1,000"],
    ["exponent", "1e3"],
    ["no digits before the dot", ".5"],
    ["no digits after the dot", "5."],
    ["letters", "abc"],
    ["currency symbol", "₦5"],
    ["two dots", "1.2.3"],
    ["hex", "0x10"],
    ["13 digits of naira", "1000000000000"],
    ["non-ASCII digits", "٢٠"],
  ])("rejects %s (%s)", (_label, input) => {
    expect(() => parseNaira(input)).toThrow(MoneyError);
  });

  it.each([
    ["number", 20000],
    ["decimal number", 20000.5],
    ["bigint", 10n],
    ["null", null],
    ["undefined", undefined],
    ["object", {}],
  ])("rejects a non-string input: %s", (_label, input) => {
    expect(() => parseNaira(input)).toThrow(MoneyError);
  });
});

describe("formatNaira", () => {
  it.each([
    [0n, "₦0.00"],
    [5n, "₦0.05"],
    [100n, "₦1.00"],
    [99_999n, "₦999.99"],
    [100_000n, "₦1,000.00"],
    [2_000_000n, "₦20,000.00"],
    [123_456_789n, "₦1,234,567.89"],
    [99_999_999_999_999n, "₦999,999,999,999.99"],
    [-550n, "-₦5.50"],
  ])("formats %s kobo as %s", (kobo, expected) => {
    expect(formatNaira(kobo)).toBe(expected);
  });

  it("round-trips through parseNaira", () => {
    const values = [0n, 1n, 99n, 100n, 101n, 123_456_789n, 99_999_999_999_999n];
    for (const kobo of values) {
      const text = formatNaira(kobo).replace("₦", "").replaceAll(",", "");
      expect(parseNaira(text)).toBe(kobo);
    }
  });
});

describe("sumKobo", () => {
  it("returns 0 for an empty list", () => {
    expect(sumKobo([])).toBe(0n);
  });

  it("matches the DR-02 example: 5,000 + 10,000 + 5,000 = 20,000", () => {
    const lines = [parseNaira("5000"), parseNaira("10000"), parseNaira("5000")];
    expect(sumKobo(lines)).toBe(parseNaira("20000"));
  });

  it("does not match when a breakdown is 1 kobo short (no tolerance)", () => {
    const lines = [parseNaira("5000"), parseNaira("10000"), parseNaira("4999.99")];
    expect(sumKobo(lines)).not.toBe(parseNaira("20000"));
  });

  it("is exact where floating-point numbers are not: 0.1 + 0.2 = 0.3", () => {
    expect(sumKobo([parseNaira("0.1"), parseNaira("0.2")])).toBe(parseNaira("0.3"));
  });
});