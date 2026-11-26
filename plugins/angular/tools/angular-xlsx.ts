// angular-xlsx.ts — a dependency-free .xlsx reader (angular plugin).
//
// An .xlsx file is a ZIP of XML parts. This reads the ZIP central directory,
// inflates entries with node:zlib, and turns each worksheet into a grid of cell
// texts: shared and inline strings (rich-text runs joined, phonetic runs
// dropped), the cached value of formulas, booleans and numbers as written, and
// merged ranges filled with their top-left value. ZIP64 and encrypted
// workbooks are refused with a message. Self-contained (a plugin tool must not
// import a core tool, and AI-DLC ships no runtime dependencies).
import { inflateRawSync } from "node:zlib";

export interface Sheet {
  name: string;
  /** rows[r][c], both 0-based; a missing cell is "". */
  rows: string[][];
}

export class XlsxError extends Error {}

function readZip(buf: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new XlsxError("not a ZIP file (an .xlsx is a ZIP archive)");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || p === 0xffffffff) throw new XlsxError("ZIP64 workbooks are not supported; save the workbook again or export the sheet as CSV");
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new XlsxError("damaged ZIP central directory");
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf-8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (flags & 1) throw new XlsxError("encrypted (password-protected) workbooks are not supported");
    if (buf.readUInt32LE(local) !== 0x04034b50) throw new XlsxError(`damaged ZIP entry ${name}`);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    if (method === 0) entries.set(name, Buffer.from(data));
    else if (method === 8) entries.set(name, inflateRawSync(data));
    else throw new XlsxError(`ZIP compression method ${method} is not supported (${name})`);
  }
  return entries;
}

export function decodeXml(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number.parseInt(d, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_, h) => String.fromCharCode(Number.parseInt(h, 16)));
}

function attr(attrs: string, name: string): string | undefined {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*"([^"]*)"`).exec(attrs);
  return m ? decodeXml(m[1]) : undefined;
}

/** Text of a shared-string item or inline string: every <t> run, without phonetic (<rPh>) runs. */
function runText(xml: string): string {
  const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").replace(/<phoneticPr\b[^>]*\/>/g, "");
  return [...clean.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)].map((m) => decodeXml(m[1] ?? "")).join("");
}

function columnIndex(ref: string): { row: number; col: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref.replace(/\$/g, ""));
  if (!m) return { row: -1, col: -1 };
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { row: Number(m[2]) - 1, col: col - 1 };
}

function parseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  const set = (r: number, c: number, v: string) => {
    while (rows.length <= r) rows.push([]);
    const row = rows[r];
    while (row.length <= c) row.push("");
    row[c] = v;
  };
  const data = /<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/.exec(xml)?.[1] ?? "";
  let rowIndex = -1;
  for (const rowMatch of data.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = attr(rowMatch[1], "r");
    rowIndex = r ? Number(r) - 1 : rowIndex + 1;
    let colIndex = -1;
    for (const c of (rowMatch[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(c[1], "r");
      const pos = ref ? columnIndex(ref) : { row: rowIndex, col: colIndex + 1 };
      colIndex = pos.col;
      const type = attr(c[1], "t");
      const body = c[2] ?? "";
      const v = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let text = "";
      if (type === "s") text = v === undefined ? "" : (shared[Number(v)] ?? "");
      else if (type === "inlineStr") text = runText(/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? "");
      else if (type === "b") text = v === "1" ? "true" : v === "0" ? "false" : "";
      else text = v === undefined ? "" : decodeXml(v);
      if (text !== "") set(pos.row >= 0 ? pos.row : rowIndex, pos.col, text);
    }
  }
  // Merged ranges read as their top-left value in every cell, as spreadsheet tools show them.
  for (const m of xml.matchAll(/<mergeCell\b[^>]*\bref="([A-Z$]+\d+):([A-Z$]+\d+)"/g)) {
    const a = columnIndex(m[1]);
    const b = columnIndex(m[2]);
    const value = rows[a.row]?.[a.col] ?? "";
    if (value === "") continue;
    for (let r = a.row; r <= b.row; r++) for (let c = a.col; c <= b.col; c++) if (r !== a.row || c !== a.col) set(r, c, value);
  }
  return rows;
}

export function readXlsx(buf: Buffer): Sheet[] {
  const zip = readZip(buf);
  const text = (name: string) => zip.get(name)?.toString("utf-8");
  const workbook = text("xl/workbook.xml");
  if (!workbook) throw new XlsxError("no xl/workbook.xml (not an Excel workbook)");
  const rels = new Map<string, string>();
  for (const m of (text("xl/_rels/workbook.xml.rels") ?? "").matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = attr(m[1], "Id");
    const target = attr(m[1], "Target");
    if (id && target) rels.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  }
  const shared = [...(text("xl/sharedStrings.xml") ?? "").matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)].map((m) => runText(m[1] ?? ""));
  const sheets: Sheet[] = [];
  for (const m of workbook.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = attr(m[1], "name") ?? `Sheet${sheets.length + 1}`;
    const rid = attr(m[1], "r:id") ?? /\s[\w]+:id\s*=\s*"([^"]*)"/.exec(m[1])?.[1];
    const path = rid ? rels.get(rid) : undefined;
    const xml = path ? text(path) : undefined;
    if (xml) sheets.push({ name, rows: parseSheet(xml, shared) });
  }
  return sheets;
}
