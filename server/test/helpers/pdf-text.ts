import { inflateSync } from "node:zlib";

/**
 * What a PDF made by buildPdf shows, for tests (A-279 item 2: compare text, not bytes).
 * Inflates each content stream and reads its TJ text runs in drawing order; a cell whose
 * text wraps gives one run per line. Only for the standard fonts: each byte is one character.
 */
export function pdfTexts(file: Buffer): string[] {
  const raw = file.toString("latin1");
  const texts: string[] = [];
  for (const match of raw.matchAll(/\/Length (\d+)\s*\/Filter \/FlateDecode\s*>>\s*stream\n/g)) {
    const start = (match.index ?? 0) + match[0].length;
    const content = inflateSync(file.subarray(start, start + Number(match[1]))).toString("latin1");
    for (const run of content.matchAll(/\[([^\]]*)\] TJ/g)) {
      const parts = [...(run[1] ?? "").matchAll(/<([0-9a-f]*)>/g)];
      texts.push(parts.map((part) => Buffer.from(part[1] ?? "", "hex").toString("latin1")).join(""));
    }
  }
  return texts;
}

/** The number of pages. */
export function pdfPageCount(file: Buffer): number {
  return (file.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
}
