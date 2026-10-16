import { describe, expect, it } from "vitest";
import { parsePermissions } from "../src/prisma-store.js";

describe("parsePermissions (how stored permission text is read, A-53)", () => {
  it("reads a JSON list of text", () => {
    expect(parsePermissions('["dashboard","members.view"]')).toEqual(["dashboard", "members.view"]);
  });

  it("reads an empty list", () => {
    expect(parsePermissions("[]")).toEqual([]);
  });

  it("keeps order and duplicates as stored (cleaning is the logic code's job)", () => {
    expect(parsePermissions('["b","a","b"]')).toEqual(["b", "a", "b"]);
  });

  it("drops entries that are not text and keeps the text ones", () => {
    expect(parsePermissions('["a",1,null,{"x":1},["y"],true,"b"]')).toEqual(["a", "b"]);
  });

  it.each([
    ["empty text", ""],
    ["text that is not JSON", "not json"],
    ["a cut-off list", '["a"'],
    ["an object", '{"a":1}'],
    ["a single string", '"dashboard"'],
    ["null", "null"],
    ["a number", "123"],
    ["true", "true"],
  ])("reads %s as an empty list (fail closed)", (_label, raw) => {
    expect(parsePermissions(raw)).toEqual([]);
  });
});