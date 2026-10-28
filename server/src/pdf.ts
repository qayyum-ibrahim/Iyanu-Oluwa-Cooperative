// Turns sheets of rows into a PDF file (D-110 item 7, D-111, A-280).
// The same sheets as workbook.ts. Money comes in as whole kobo (D-15) and
// is written as text made from the kobo (formatNaira), never as a float.
// The Total row is added up in bigint. The standard fonts have no ₦ glyph
// (A-280), so amounts and headers say NGN.
import PDFDocument from "pdfkit";
import type { CooperativeDetails } from "./cooperative.js";
import { type Kobo, formatNaira, sumKobo } from "./money.js";
import { TOTAL_LABEL, type Sheet, type SheetColumn } from "./workbook.js";

export class PdfError extends Error {}

export interface PdfHeading {
  cooperative: Readonly<CooperativeDetails>;
  /** The Lagos day the file is made, "YYYY-MM-DD". */
  printedOn: string;
}

const FONT = "Helvetica";
const BOLD = "Helvetica-Bold";
const MARGIN = 36;
const TABLE_SIZE = 8;
// As workbook.ts: a column without a width counts as 18.
const DEFAULT_WIDTH = 18;

// WinAnsi, the encoding of the standard fonts: printable ASCII, U+00A0 to U+00FF,
// and the signs pdfkit maps into 0x80 to 0x9F (WIN_ANSI_MAP in pdfkit).
const WIN_ANSI_EXTRA: ReadonlySet<number> = new Set([
  0x0152, 0x0153, 0x0160, 0x0161, 0x0178, 0x017d, 0x017e, 0x0192, 0x02c6, 0x02dc, 0x2013, 0x2014, 0x2018,
  0x2019, 0x201a, 0x201c, 0x201d, 0x201e, 0x2020, 0x2021, 0x2022, 0x2026, 0x2030, 0x2039, 0x203a, 0x20ac,
  0x2122,
]);

function isWinAnsi(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.has(code);
}

/**
 * Text the standard fonts can draw: ₦ becomes NGN, a line break or tab a space, a letter outside
 * WinAnsi loses its marks (ọ gives o), anything else becomes "?" (A-280).
 */
export function pdfText(text: string): string {
  let out = "";
  for (const char of text.replaceAll("₦", "NGN").normalize("NFC")) {
    if (isWinAnsi(char)) {
      out += char;
    } else if ((char.codePointAt(0) ?? 0) < 0x20) {
      out += " ";
    } else {
      const base = char.normalize("NFD").replace(/\p{M}/gu, "");
      out += [...base].every(isWinAnsi) ? base : "?";
    }
  }
  return out;
}

/** Whole kobo as naira text without the sign, for example 2000050n gives "20,000.50". */
export function koboToNairaText(kobo: Kobo): string {
  return formatNaira(kobo).replace("₦", "");
}

interface Cell {
  text: string;
  align?: { x: "right" };
  font?: { src: string };
}

function cellOf(column: SheetColumn, value: string | Kobo | null | undefined): Cell {
  if (value === undefined || value === null) {
    return { text: "" };
  }
  if (column.kind === "money") {
    if (typeof value !== "bigint") {
      throw new PdfError(`Column "${column.key}" needs kobo as a bigint.`);
    }
    return { text: koboToNairaText(value), align: { x: "right" } };
  }
  if (typeof value !== "string") {
    throw new PdfError(`Column "${column.key}" needs text.`);
  }
  return { text: pdfText(value) };
}

function totalRowOf(sheet: Sheet): Cell[] {
  return sheet.columns.map((column, index) => {
    if (column.kind === "money") {
      const values = sheet.rows.map((row) => row[column.key]);
      const total = sumKobo(values.filter((value): value is Kobo => typeof value === "bigint"));
      return { text: koboToNairaText(total), align: { x: "right" }, font: { src: BOLD } };
    }
    return { text: index === 0 ? TOTAL_LABEL : "", font: { src: BOLD } };
  });
}

/** Every row as cells, checked before anything is drawn, so a bad cell gives no file. */
function rowsOf(sheet: Sheet): Cell[][] {
  if (sheet.columns.length === 0) {
    throw new PdfError(`Sheet "${sheet.name}" has no columns.`);
  }
  const header = sheet.columns.map((column) => ({
    text: pdfText(column.header),
    font: { src: BOLD },
    ...(column.kind === "money" ? { align: { x: "right" as const } } : {}),
  }));
  const rows = sheet.rows.map((row) => sheet.columns.map((column) => cellOf(column, row[column.key])));
  const total = sheet.columns.some((column) => column.kind === "money") ? [totalRowOf(sheet)] : [];
  return [header, ...rows, ...total];
}

/**
 * Build a PDF file: A4 landscape. The first page starts with the cooperative's details and the
 * day printed. Each sheet starts on a new page with its name, then a table: a bold header row,
 * one row per entry and, when the sheet has a money column, a bold Total row. A long table runs
 * on to the next page.
 */
export async function buildPdf(sheets: readonly Sheet[], heading: PdfHeading): Promise<Buffer> {
  if (sheets.length === 0) {
    throw new PdfError("A PDF needs at least one sheet.");
  }
  const tables = sheets.map(rowsOf);

  const { cooperative } = heading;
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: MARGIN,
    info: { Title: pdfText(`${cooperative.name} export`), Author: pdfText(cooperative.name) },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const ended = new Promise<void>((resolve, reject) => {
    doc.on("end", resolve);
    doc.on("error", reject);
  });

  const width = doc.page.width - 2 * MARGIN;
  doc.font(BOLD).fontSize(14).text(pdfText(cooperative.name));
  doc.font(FONT).fontSize(9).text(pdfText(cooperative.address));
  doc.text(
    pdfText(
      `Reg. No. ${cooperative.registrationNumber}   Phone: ${cooperative.phone}   Email: ${cooperative.email}`,
    ),
  );
  doc.text(`Printed on ${pdfText(heading.printedOn)}`);

  sheets.forEach((sheet, index) => {
    if (index > 0) {
      doc.addPage();
    } else {
      doc.moveDown();
    }
    doc.font(BOLD).fontSize(12).text(pdfText(sheet.name));
    doc.moveDown(0.3);
    const weights = sheet.columns.map((column) => column.width ?? DEFAULT_WIDTH);
    const sum = weights.reduce((a, b) => a + b, 0);
    doc.font(FONT).fontSize(TABLE_SIZE);
    doc.table({
      position: { x: MARGIN },
      maxWidth: width,
      columnStyles: weights.map((w) => (w / sum) * width),
      data: tables[index] ?? [],
    });
  });

  doc.end();
  await ended;
  return Buffer.concat(chunks);
}
