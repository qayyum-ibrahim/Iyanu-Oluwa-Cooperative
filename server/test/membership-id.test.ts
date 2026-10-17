import { describe, expect, it } from "vitest";
import { formatMembershipId } from "../src/store.js";

describe("formatMembershipId", () => {
  it.each([
    [1, "IO-001"],
    [12, "IO-012"],
    [999, "IO-999"],
    [1000, "IO-1000"],
  ])("turns %i into %s", (n, expected) => {
    expect(formatMembershipId(n)).toBe(expected);
  });

  it.each([0, -1, 1.5, Number.NaN])("throws RangeError for %s", (bad) => {
    expect(() => formatMembershipId(bad)).toThrow(RangeError);
  });
});