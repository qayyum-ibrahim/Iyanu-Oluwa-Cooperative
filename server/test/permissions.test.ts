import { describe, expect, it } from "vitest";
import {
  ALL_PERMISSIONS,
  PERMISSION_TABLE,
  PermissionGrantError,
  canGrant,
  hasPermission,
  isPermission,
  normalizeStaffGrants,
  type PermissionSubject,
} from "../src/permissions.js";
import type { Role } from "../src/store.js";

// Written out by hand on purpose: these lists pin the table. Do not build them from the table.
const EXPECTED_KEYS = [
  "dashboard",
  "members.view",
  "members.create",
  "members.edit",
  "members.delete",
  "payments.view",
  "payments.create",
  "payments.edit",
  "payments.delete",
  "expenses.view",
  "expenses.create",
  "expenses.edit",
  "expenses.delete",
  "loans.view",
  "loans.create",
  "loans.edit",
  "loans.delete",
  "reports.view",
  "reports.export",
  "users.manage",
  "loans.disburse",
  "payoff.process",
];
const GRANTABLE_KEYS = EXPECTED_KEYS.filter((k) => k !== "users.manage");

const superAdmin: PermissionSubject = { role: "SUPER_ADMIN", isActive: true, permissions: [] };
const inactiveSuperAdmin: PermissionSubject = { ...superAdmin, isActive: false };
const staff = (permissions: string[], isActive = true): PermissionSubject => ({
  role: "STAFF",
  isActive,
  permissions,
});

describe("permission table", () => {
  it("lists exactly the 22 expected keys, in order", () => {
    expect(PERMISSION_TABLE.map((p) => p.key)).toEqual(EXPECTED_KEYS);
    expect([...ALL_PERMISSIONS]).toEqual(EXPECTED_KEYS);
  });

  it("has no duplicate keys and no blank labels", () => {
    expect(new Set(EXPECTED_KEYS).size).toBe(EXPECTED_KEYS.length);
    for (const p of PERMISSION_TABLE) expect(p.label.trim().length).toBeGreaterThan(0);
  });

  it("makes only users.manage impossible to give to Staff", () => {
    expect(PERMISSION_TABLE.filter((p) => !p.staffGrantable).map((p) => p.key)).toEqual([
      "users.manage",
    ]);
  });

  it("isPermission accepts every key and nothing else", () => {
    for (const key of EXPECTED_KEYS) expect(isPermission(key)).toBe(true);
    const bad: unknown[] = [
      "",
      " members.view",
      "MEMBERS.VIEW",
      "members.*",
      "members",
      "constructor",
      "__proto__",
      "toString",
      42,
      null,
      undefined,
      {},
      ["members.view"],
    ];
    for (const value of bad) expect(isPermission(value)).toBe(false);
  });
});

describe("role x permission matrix (hasPermission)", () => {
  const withoutManage = GRANTABLE_KEYS;
  const cases: [string, PermissionSubject, string[]][] = [
    ["Super Admin, active", superAdmin, EXPECTED_KEYS],
    ["Super Admin, inactive", inactiveSuperAdmin, []],
    ["Staff, active, nothing granted", staff([]), []],
    ["Staff, active, every key in the list (incl. users.manage)", staff(EXPECTED_KEYS), withoutManage],
    ["Staff, inactive, every key in the list", staff(EXPECTED_KEYS, false), []],
    ["Staff, active, only members.view", staff(["members.view"]), ["members.view"]],
  ];

  it.each(cases)("%s", (name, subject, allowed) => {
    for (const key of EXPECTED_KEYS) {
      expect(hasPermission(subject, key), `${name} / ${key}`).toBe(allowed.includes(key));
    }
  });
});

describe("hasPermission edge cases", () => {
  it("refuses unknown or malformed permissions, even for the Super Admin", () => {
    const bad: unknown[] = ["", "members.*", "MEMBERS.VIEW", "admin", "constructor", 42, null, undefined];
    for (const value of bad) expect(hasPermission(superAdmin, value)).toBe(false);
  });

  it("does not let one permission imply another", () => {
    expect(hasPermission(staff(["payments.view"]), "payments.create")).toBe(false);
    expect(hasPermission(staff(["loans.create"]), "loans.disburse")).toBe(false);
    expect(hasPermission(staff(["members.delete"]), "members.view")).toBe(false);
    expect(hasPermission(staff(["loans.disburse"]), "payoff.process")).toBe(false);
  });

  it("ignores unknown names in a staff grant list", () => {
    const s = staff(["constructor", "__proto__", "toString", "nope"]);
    for (const key of EXPECTED_KEYS) expect(hasPermission(s, key)).toBe(false);
  });

  it("refuses an unknown role value (fail closed)", () => {
    const odd: PermissionSubject = {
      role: "ADMIN" as unknown as Role,
      isActive: true,
      permissions: EXPECTED_KEYS,
    };
    for (const key of EXPECTED_KEYS) expect(hasPermission(odd, key)).toBe(false);
  });
});

describe("canGrant (DR-14)", () => {
  it("lets the Super Admin grant every key except users.manage", () => {
    for (const key of EXPECTED_KEYS) {
      expect(canGrant(superAdmin, key), key).toBe(key !== "users.manage");
    }
  });

  it("lets the Super Admin grant loans.disburse and payoff.process", () => {
    expect(canGrant(superAdmin, "loans.disburse")).toBe(true);
    expect(canGrant(superAdmin, "payoff.process")).toBe(true);
  });

  it("lets no Staff user grant anything, even one holding every grantable key", () => {
    const powerful = staff(EXPECTED_KEYS);
    for (const key of EXPECTED_KEYS) expect(canGrant(powerful, key), key).toBe(false);
  });

  it("lets an inactive Super Admin grant nothing", () => {
    for (const key of EXPECTED_KEYS) expect(canGrant(inactiveSuperAdmin, key), key).toBe(false);
  });

  it("refuses unknown permissions", () => {
    for (const value of ["", "nope", "constructor", 42, null, undefined]) {
      expect(canGrant(superAdmin, value)).toBe(false);
    }
  });
});

describe("normalizeStaffGrants", () => {
  it("returns the list without duplicates, in table order", () => {
    expect(
      normalizeStaffGrants(superAdmin, ["reports.view", "members.view", "reports.view"]),
    ).toEqual(["members.view", "reports.view"]);
  });

  it("returns an empty list for an empty list", () => {
    expect(normalizeStaffGrants(superAdmin, [])).toEqual([]);
  });

  it("lets the Super Admin grant the restricted rights", () => {
    expect(normalizeStaffGrants(superAdmin, ["payoff.process", "loans.disburse"])).toEqual([
      "loans.disburse",
      "payoff.process",
    ]);
  });

  it("accepts every grantable key at once", () => {
    expect(normalizeStaffGrants(superAdmin, [...GRANTABLE_KEYS].reverse())).toEqual(GRANTABLE_KEYS);
  });

  it.each([["members.view"], [null], [undefined], [{}], [42]])(
    "rejects input that is not a list (%j)",
    (input) => {
      expect(() => normalizeStaffGrants(superAdmin, input)).toThrow(PermissionGrantError);
    },
  );

  it.each([[["nope"]], [[42]], [[null]], [["MEMBERS.VIEW"]], [["members.view", "constructor"]]])(
    "rejects unknown or non-text entries (%j)",
    (input) => {
      expect(() => normalizeStaffGrants(superAdmin, input)).toThrow(PermissionGrantError);
    },
  );

  it("rejects users.manage, even from the Super Admin, and returns nothing", () => {
    expect(() => normalizeStaffGrants(superAdmin, ["members.view", "users.manage"])).toThrow(
      PermissionGrantError,
    );
  });

  it("rejects a Staff actor, even with an empty list", () => {
    const powerful = staff(EXPECTED_KEYS);
    expect(() => normalizeStaffGrants(powerful, [])).toThrow(PermissionGrantError);
    expect(() => normalizeStaffGrants(powerful, ["members.view"])).toThrow(PermissionGrantError);
    expect(() => normalizeStaffGrants(powerful, ["loans.disburse"])).toThrow(PermissionGrantError);
    expect(() => normalizeStaffGrants(powerful, ["payoff.process"])).toThrow(PermissionGrantError);
  });

  it("rejects an inactive Super Admin", () => {
    expect(() => normalizeStaffGrants(inactiveSuperAdmin, ["members.view"])).toThrow(
      PermissionGrantError,
    );
  });

  it("does not change its input and returns a new array", () => {
    const input = Object.freeze(["reports.view", "members.view"]) as unknown as string[];
    const out = normalizeStaffGrants(superAdmin, input);
    expect(out).not.toBe(input);
    expect([...input]).toEqual(["reports.view", "members.view"]);
  });

  it("does not repeat unknown input text in the error message", () => {
    try {
      normalizeStaffGrants(superAdmin, ["<script>alert(1)</script>"]);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(PermissionGrantError);
      expect((e as Error).message).not.toContain("script");
    }
  });
});