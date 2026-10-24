// Turns sheets of rows into an .xlsx file (R-23, D-104).
// Money comes in as whole kobo (D-15). A money cell holds naira as a
// number made from the kobo text, with the format #,##0.00. The Total
// row is added up in bigint, not with an Excel formula.
import ExcelJS from "exceljs";
import { type Kobo, sumKobo } from "./money.js";

export class WorkbookError extends Error {}

export type ColumnKind = "text" | "money";

export interface SheetColumn {
  key: string;
  header: string;
  kind: ColumnKind;
  width?: number;
}

/** A text column takes a string or null; a money column takes kobo or null. */
export type SheetRow = Readonly<Record<string, string | Kobo | null>>;

export interface Sheet {
  name: string;
  columns: readonly SheetColumn[];
  rows: readonly SheetRow[];
}

export const MONEY_FORMAT = "#,##0.00";
export const TOTAL_LABEL = "Total";

// Excel keeps 15 significant digits, so a money cell stays below 10^15 kobo.
const MAX_KOBO = 10n ** 15n - 1n;
// Excel's sheet name rules: 1 to 31 characters, none of : \ / ? * [ ].
const SHEET_NAME_PATTERN = /^[^:\\/?*[\]]{1,31}$/;
const DEFAULT_WIDTH = 18;

/** Whole kobo as a naira number, for example 2000050n gives 20000.5. */
export function koboToNairaNumber(kobo: Kobo): number {
  const abs = kobo < 0n ? -kobo : kobo;
  if (abs > MAX_KOBO) {
    throw new WorkbookError("Amount is too large for a spreadsheet cell.");
  }
  const fraction = (abs % 100n).toString().padStart(2, "0");
  return Number(`${kobo < 0n ? "-" : ""}${abs / 100n}.${fraction}`);
}

function checkSheet(sheet: Sheet, names: Set<string>): void {
  if (!SHEET_NAME_PATTERN.test(sheet.name)) {
    throw new WorkbookError(`Sheet name "${sheet.name}" is not allowed.`);
  }
  const lower = sheet.name.toLowerCase();
  if (names.has(lower)) {
    throw new WorkbookError(`Sheet name "${sheet.name}" is used twice.`);
  }
  names.add(lower);
  if (sheet.columns.length === 0) {
    throw new WorkbookError(`Sheet "${sheet.name}" has no columns.`);
  }
  const keys = new Set(sheet.columns.map((column) => column.key));
  if (keys.size !== sheet.columns.length) {
    throw new WorkbookError(`Sheet "${sheet.name}" has a column key twice.`);
  }
}

function cellOf(column: SheetColumn, value: string | Kobo | null | undefined): string | number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (column.kind === "money") {
    if (typeof value !== "bigint") {
      throw new WorkbookError(`Column "${column.key}" needs kobo as a bigint.`);
    }
    return koboToNairaNumber(value);
  }
  if (typeof value !== "string") {
    throw new WorkbookError(`Column "${column.key}" needs text.`);
  }
  return value;
}

function totalRowOf(sheet: Sheet): (string | number | null)[] {
  return sheet.columns.map((column, index) => {
    if (column.kind === "money") {
      const values = sheet.rows.map((row) => row[column.key]);
      return koboToNairaNumber(
        sumKobo(values.filter((value): value is Kobo => typeof value === "bigint")),
      );
    }
    return index === 0 ? TOTAL_LABEL : null;
  });
}

/**
 * Build an .xlsx file. Each sheet gets a bold header row, then one row per
 * entry. A sheet with a money column ends with a bold Total row whose label
 * sits in the first column, so the first column should be text.
 */
export async function buildWorkbook(sheets: readonly Sheet[]): Promise<Buffer> {
  if (sheets.length === 0) {
    throw new WorkbookError("A workbook needs at least one sheet.");
  }
  const names = new Set<string>();
  const workbook = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    checkSheet(sheet, names);
    const worksheet = workbook.addWorksheet(sheet.name);
    worksheet.columns = sheet.columns.map((column) => ({
      header: column.header,
      key: column.key,
      width: column.width ?? DEFAULT_WIDTH,
    }));
    worksheet.getRow(1).font = { bold: true };
    const addRow = (values: (string | number | null)[]): ExcelJS.Row => {
      const added = worksheet.addRow(values);
      sheet.columns.forEach((column, index) => {
        if (column.kind === "money") {
          added.getCell(index + 1).numFmt = MONEY_FORMAT;
        }
      });
      return added;
    };
    for (const row of sheet.rows) {
      addRow(sheet.columns.map((column) => cellOf(column, row[column.key])));
    }
    if (sheet.columns.some((column) => column.kind === "money")) {
      addRow(totalRowOf(sheet)).font = { bold: true };
    }
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
