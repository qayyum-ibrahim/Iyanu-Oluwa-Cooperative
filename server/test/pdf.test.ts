import { describe, expect, it } from "vitest";
import { COOPERATIVE } from "../src/cooperative.js";
import { buildPdf, koboToNairaText, PdfError, pdfText } from "../src/pdf.js";
import type { Sheet } from "../src/workbook.js";
import { pdfPageCount, pdfTexts } from "./helpers/pdf-text.js";

const heading = { cooperative: COOPERATIVE, printedOn: "2026-10-28" };

const payments: Sheet = {
  name: "Transactions",
  columns: [
    { key: "member", header: "Member", kind: "text" },
    { key: "category", header: "Category", kind: "text", width: 30 },
    { key: "amount", header: "Amount (₦)", kind: "money" },
  ],
  rows: [
    { member: "Ada Test", category: "Savings", amount: 2_000_050n },
    { member: "Bola Test", category: "Shares", amount: 10n },
    { member: "Chidi Test", category: null, amount: null },
    { member: "Dayo Test", category: "Savings", amount: 20n },
  ],
};

const members: Sheet = {
  name: "Members",
  columns: [
    { key: "name", header: "Name", kind: "text" },
    { key: "status", header: "Status", kind: "text" },
  ],
  rows: [{ name: "Ada Test", status: "Active" }],
};

describe("pdfText", () => {
  it("writes NGN for ₦ and keeps WinAnsi text", () => {
    expect(pdfText("Amount (₦)")).toBe("Amount (NGN)");
    expect(pdfText("Adébáyò – “€5” ’")).toBe("Adébáyò – “€5” ’");
  });

  it("drops the marks of a letter outside WinAnsi, and writes ? for anything else", () => {
    expect(pdfText("Adébáyọ̀ Ọlá")).toBe("Adébáyo Olá");
    expect(pdfText("Ẹ̀kọ́")).toBe("Eko");
    expect(pdfText("a😀b")).toBe("a?b");
    expect(pdfText("漢")).toBe("?");
  });

  it("writes a space for a line break or tab", () => {
    expect(pdfText("1 Test Street\nIkeja\tLagos")).toBe("1 Test Street Ikeja Lagos");
  });
});

describe("koboToNairaText", () => {
  it("writes whole kobo as naira text without the sign", () => {
    expect(koboToNairaText(2_000_050n)).toBe("20,000.50");
    expect(koboToNairaText(5n)).toBe("0.05");
    expect(koboToNairaText(0n)).toBe("0.00");
    expect(koboToNairaText(-500n)).toBe("-5.00");
    expect(koboToNairaText(99_999_999_999_999n)).toBe("999,999,999,999.99");
  });
});

describe("buildPdf", () => {
  it("gives a PDF file", async () => {
    const file = await buildPdf([payments], heading);
    expect(file.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("starts with the cooperative's details and the day printed", async () => {
    const texts = pdfTexts(await buildPdf([payments], heading));
    expect(texts.slice(0, 5)).toEqual([
      COOPERATIVE.name,
      COOPERATIVE.address,
      `Reg. No. ${COOPERATIVE.registrationNumber}   Phone: ${COOPERATIVE.phone}   Email: ${COOPERATIVE.email}`,
      "Printed on 2026-10-28",
      "Transactions",
    ]);
  });

  it("writes the header row, one row per entry with money from kobo, and a Total added in bigint", async () => {
    const texts = pdfTexts(await buildPdf([payments], heading));
    expect(texts.slice(5)).toEqual([
      "Member",
      "Category",
      "Amount (NGN)",
      "Ada Test",
      "Savings",
      "20,000.50",
      "Bola Test",
      "Shares",
      "0.10",
      "Chidi Test",
      "Dayo Test",
      "Savings",
      "0.20",
      "Total",
      "20,000.80",
    ]);
  });

  it("adds money exactly, beyond what a float keeps", async () => {
    const big: Sheet = {
      ...payments,
      rows: [
        { member: "A", category: null, amount: 99_999_999_999_999n },
        { member: "B", category: null, amount: 99_999_999_999_999n },
        { member: "C", category: null, amount: 1n },
      ],
    };
    const texts = pdfTexts(await buildPdf([big], heading));
    expect(texts.at(-2)).toBe("Total");
    expect(texts.at(-1)).toBe("1,999,999,999,999.99");
  });

  it("writes a negative amount and a Total for an empty sheet", async () => {
    const negative = await buildPdf([{ ...payments, rows: [{ member: "A", category: null, amount: -500n }] }], heading);
    expect(pdfTexts(negative).slice(-3)).toEqual(["-5.00", "Total", "-5.00"]);
    const empty = pdfTexts(await buildPdf([{ ...payments, rows: [] }], heading));
    expect(empty.slice(5)).toEqual(["Member", "Category", "Amount (NGN)", "Total", "0.00"]);
  });

  it("has no Total row without a money column", async () => {
    const texts = pdfTexts(await buildPdf([members], heading));
    expect(texts.slice(5)).toEqual(["Name", "Status", "Ada Test", "Active"]);
  });

  it("starts each sheet on a new page, in the order given", async () => {
    const one = await buildPdf([payments], heading);
    const two = await buildPdf([payments, members], heading);
    expect(pdfPageCount(one)).toBe(1);
    expect(pdfPageCount(two)).toBe(2);
    const texts = pdfTexts(two);
    expect(texts.indexOf("Members")).toBeGreaterThan(texts.indexOf("Total"));
    expect(texts.slice(-5)).toEqual(["Members", "Name", "Status", "Ada Test", "Active"]);
  });

  it("runs a long table on to the next page and keeps every row", async () => {
    const rows = Array.from({ length: 120 }, (_, i) => ({ member: `Member ${i}`, category: "Shares", amount: 100n }));
    const file = await buildPdf([{ ...payments, rows }], heading);
    expect(pdfPageCount(file)).toBeGreaterThan(1);
    const texts = pdfTexts(file);
    for (let i = 0; i < 120; i += 1) {
      expect(texts).toContain(`Member ${i}`);
    }
    expect(texts.slice(-2)).toEqual(["Total", "120.00"]);
  });

  it("makes cell text and the heading safe for the standard fonts", async () => {
    const file = await buildPdf([{ ...members, name: "Ọmọ", rows: [{ name: "Adébáyọ̀ Test", status: null }] }], {
      cooperative: { ...COOPERATIVE, name: "Ẹgbẹ́ Test" },
      printedOn: "2026-10-28",
    });
    const texts = pdfTexts(file);
    expect(texts[0]).toBe("Egbe Test");
    expect(texts).toContain("Omo");
    expect(texts).toContain("Adébáyo Test");
  });

  it("refuses no sheets, a sheet with no columns, and a cell of the wrong kind", async () => {
    await expect(buildPdf([], heading)).rejects.toThrow(PdfError);
    await expect(buildPdf([{ ...members, columns: [] }], heading)).rejects.toThrow(PdfError);
    await expect(
      buildPdf([{ ...payments, rows: [{ member: "A", category: null, amount: "20000" }] }], heading),
    ).rejects.toThrow(/needs kobo as a bigint/);
    await expect(
      buildPdf([{ ...payments, rows: [{ member: 5n, category: null, amount: null }] }], heading),
    ).rejects.toThrow(/needs text/);
  });
});

describe("COOPERATIVE", () => {
  it("holds a text for every detail", () => {
    for (const value of Object.values(COOPERATIVE)) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
    expect(Object.isFrozen(COOPERATIVE)).toBe(true);
  });
});
