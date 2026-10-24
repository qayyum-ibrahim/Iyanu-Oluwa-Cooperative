import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  buildWorkbook,
  koboToNairaNumber,
  MONEY_FORMAT,
  type Sheet,
  TOTAL_LABEL,
  WorkbookError,
} from "../src/workbook.js";

async function readBack(file: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file as unknown as ExcelJS.Buffer);
  return workbook;
}

function sheetOf(workbook: ExcelJS.Workbook, name: string): ExcelJS.Worksheet {
  const worksheet = workbook.getWorksheet(name);
  if (!worksheet) {
    throw new Error(`no sheet ${name}`);
  }
  return worksheet;
}

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
    { member: "Dayo Test", category: "Savings", amount: 99_999_999_999_999n },
  ],
};

describe("koboToNairaNumber", () => {
  it.each([
    [0n, 0],
    [1n, 0.01],
    [10n, 0.1],
    [99n, 0.99],
    [100n, 1],
    [2_000_050n, 20000.5],
    [1_999_999n, 19999.99],
    [-150n, -1.5],
    [99_999_999_999_999n, 999999999999.99],
    [999_999_999_999_999n, 9999999999999.99],
  ])("gives %s kobo as %s naira", (kobo, naira) => {
    expect(koboToNairaNumber(kobo)).toBe(naira);
  });

  it.each([[10n ** 15n], [-(10n ** 15n)]])("refuses %s kobo (over 15 digits)", (kobo) => {
    expect(() => koboToNairaNumber(kobo)).toThrow(WorkbookError);
  });

  it("shows the same two decimals as the kobo text for every fraction", () => {
    for (let fraction = 0n; fraction < 100n; fraction += 1n) {
      const kobo = 123_456_789_012n * 100n + fraction;
      expect(koboToNairaNumber(kobo).toFixed(2)).toBe(
        `123456789012.${fraction.toString().padStart(2, "0")}`,
      );
    }
  });
});

describe("buildWorkbook: the file read back with exceljs", () => {
  it("has the header row in bold, one row per entry and a bold Total row", async () => {
    const worksheet = sheetOf(await readBack(await buildWorkbook([payments])), "Transactions");
    expect(worksheet.getRow(1).values).toEqual([undefined, "Member", "Category", "Amount (₦)"]);
    expect(worksheet.getRow(1).getCell(1).font?.bold).toBe(true);
    expect(worksheet.getRow(2).values).toEqual([undefined, "Ada Test", "Savings", 20000.5]);
    expect(worksheet.getRow(3).values).toEqual([undefined, "Bola Test", "Shares", 0.1]);
    expect(worksheet.getRow(4).getCell(1).value).toBe("Chidi Test");
    expect(worksheet.getRow(4).getCell(2).value).toBeNull();
    expect(worksheet.getRow(4).getCell(3).value).toBeNull();
    expect(worksheet.getRow(5).getCell(3).value).toBe(999999999999.99);
    expect(worksheet.rowCount).toBe(6);
    const total = worksheet.getRow(6);
    expect(total.getCell(1).value).toBe(TOTAL_LABEL);
    expect(total.getCell(2).value).toBeNull();
    // 2,000,050 + 10 + 99,999,999,999,999 kobo, added in bigint.
    expect(total.getCell(3).value).toBe(1000000020000.59);
    expect(total.getCell(1).font?.bold).toBe(true);
    expect(total.getCell(3).font?.bold).toBe(true);
    expect(worksheet.getRow(2).getCell(1).font?.bold).not.toBe(true);
  });

  it("gives money cells the format #,##0.00 and text cells none", async () => {
    const worksheet = sheetOf(await readBack(await buildWorkbook([payments])), "Transactions");
    expect(MONEY_FORMAT).toBe("#,##0.00");
    for (const rowNumber of [2, 3, 5, 6]) {
      expect(worksheet.getRow(rowNumber).getCell(3).numFmt).toBe(MONEY_FORMAT);
      expect(worksheet.getRow(rowNumber).getCell(1).numFmt).toBeUndefined();
    }
    expect(worksheet.getRow(1).getCell(3).numFmt).toBeUndefined();
  });

  it("sets the column widths, 18 when none is given", async () => {
    const worksheet = sheetOf(await readBack(await buildWorkbook([payments])), "Transactions");
    expect(worksheet.getColumn(1).width).toBe(18);
    expect(worksheet.getColumn(2).width).toBe(30);
  });

  it("works the Total out in bigint where adding floats would be wrong", async () => {
    // 0.1 + 0.2 in floats is 0.30000000000000004.
    const sheet: Sheet = {
      name: "Sums",
      columns: [
        { key: "label", header: "Label", kind: "text" },
        { key: "amount", header: "Amount", kind: "money" },
      ],
      rows: [
        { label: "a", amount: 10n },
        { label: "b", amount: 20n },
      ],
    };
    const worksheet = sheetOf(await readBack(await buildWorkbook([sheet])), "Sums");
    expect(worksheet.getRow(4).getCell(2).value).toBe(0.3);
  });

  it("gives every money column its own Total", async () => {
    const sheet: Sheet = {
      name: "Cashflow",
      columns: [
        { key: "day", header: "Day", kind: "text" },
        { key: "in", header: "In", kind: "money" },
        { key: "out", header: "Out", kind: "money" },
      ],
      rows: [
        { day: "2026-10-01", in: 500n, out: null },
        { day: "2026-10-02", in: null, out: 125n },
        { day: "2026-10-03", in: 1_000n, out: 75n },
      ],
    };
    const worksheet = sheetOf(await readBack(await buildWorkbook([sheet])), "Cashflow");
    expect(worksheet.getRow(5).values).toEqual([undefined, TOTAL_LABEL, 15, 2]);
  });

  it("gives an empty sheet with money a Total of 0", async () => {
    const worksheet = sheetOf(
      await readBack(await buildWorkbook([{ ...payments, rows: [] }])),
      "Transactions",
    );
    expect(worksheet.rowCount).toBe(2);
    expect(worksheet.getRow(2).getCell(1).value).toBe(TOTAL_LABEL);
    expect(worksheet.getRow(2).getCell(2).value).toBeNull();
    expect(worksheet.getRow(2).getCell(3).value).toBe(0);
  });

  it("adds no Total row to a sheet without money", async () => {
    const sheet: Sheet = {
      name: "Members",
      columns: [
        { key: "name", header: "Name", kind: "text" },
        { key: "phone", header: "Phone", kind: "text" },
      ],
      rows: [{ name: "Ada Test", phone: "08000000000" }],
    };
    const worksheet = sheetOf(await readBack(await buildWorkbook([sheet])), "Members");
    expect(worksheet.rowCount).toBe(2);
    expect(worksheet.getRow(2).getCell(2).value).toBe("08000000000");
  });

  it("keeps text that looks like a formula or a number as text", async () => {
    const sheet: Sheet = {
      name: "Text",
      columns: [{ key: "note", header: "Note", kind: "text" }],
      rows: [{ note: "=1+1" }, { note: "+2348000000000" }, { note: "007" }],
    };
    const worksheet = sheetOf(await readBack(await buildWorkbook([sheet])), "Text");
    for (const [rowNumber, text] of [[2, "=1+1"], [3, "+2348000000000"], [4, "007"]] as const) {
      const cell = worksheet.getRow(rowNumber).getCell(1);
      expect(cell.value).toBe(text);
      expect(cell.type).toBe(ExcelJS.ValueType.String);
    }
  });

  it("writes several sheets in the order given", async () => {
    const workbook = await readBack(
      await buildWorkbook([payments, { ...payments, name: "Second" }]),
    );
    expect(workbook.worksheets.map((worksheet) => worksheet.name)).toEqual([
      "Transactions",
      "Second",
    ]);
  });

  it("starts with the .xlsx (zip) signature", async () => {
    const file = await buildWorkbook([payments]);
    expect(Buffer.isBuffer(file)).toBe(true);
    expect(file.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  });
});

describe("buildWorkbook: refused input", () => {
  const plain = (name: string): Sheet => ({
    name,
    columns: [{ key: "a", header: "A", kind: "text" }],
    rows: [],
  });

  it("refuses no sheets", async () => {
    await expect(buildWorkbook([])).rejects.toThrow(WorkbookError);
  });

  it.each([
    ["empty", ""],
    ["32 characters", "x".repeat(32)],
    ["colon", "a:b"],
    ["backslash", "a\\b"],
    ["slash", "a/b"],
    ["question mark", "a?b"],
    ["star", "a*b"],
    ["open bracket", "a[b"],
    ["close bracket", "a]b"],
  ])("refuses a sheet name with %s", async (_label, name) => {
    await expect(buildWorkbook([plain(name)])).rejects.toThrow(WorkbookError);
  });

  it("accepts a sheet name of 31 characters", async () => {
    const name = "x".repeat(31);
    const workbook = await readBack(await buildWorkbook([plain(name)]));
    expect(workbook.worksheets[0]?.name).toBe(name);
  });

  it("refuses the same sheet name twice, in any case", async () => {
    await expect(buildWorkbook([plain("Sheet"), plain("SHEET")])).rejects.toThrow(WorkbookError);
  });

  it("refuses a sheet without columns", async () => {
    await expect(buildWorkbook([{ name: "Empty", columns: [], rows: [] }])).rejects.toThrow(
      WorkbookError,
    );
  });

  it("refuses a column key used twice", async () => {
    const sheet: Sheet = {
      name: "Twice",
      columns: [
        { key: "a", header: "A", kind: "text" },
        { key: "a", header: "B", kind: "money" },
      ],
      rows: [],
    };
    await expect(buildWorkbook([sheet])).rejects.toThrow(WorkbookError);
  });

  it("refuses a number in a money column", async () => {
    const sheet = { ...payments, rows: [{ member: "Ada Test", amount: 5 as unknown as bigint }] };
    await expect(buildWorkbook([sheet])).rejects.toThrow(WorkbookError);
  });

  it("refuses a string in a money column", async () => {
    const sheet = { ...payments, rows: [{ member: "Ada Test", amount: "5.00" }] };
    await expect(buildWorkbook([sheet])).rejects.toThrow(WorkbookError);
  });

  it("refuses kobo in a text column", async () => {
    const sheet = { ...payments, rows: [{ member: 5n }] };
    await expect(buildWorkbook([sheet])).rejects.toThrow(WorkbookError);
  });

  it("refuses an amount over 15 digits of kobo", async () => {
    const sheet = { ...payments, rows: [{ member: "Ada Test", amount: 10n ** 15n }] };
    await expect(buildWorkbook([sheet])).rejects.toThrow(WorkbookError);
  });

  it("refuses a Total over 15 digits of kobo", async () => {
    const big = 999_999_999_999_999n;
    const sheet = {
      ...payments,
      rows: [
        { member: "Ada Test", amount: big },
        { member: "Bola Test", amount: 1n },
      ],
    };
    await expect(buildWorkbook([sheet])).rejects.toThrow(WorkbookError);
  });
});
