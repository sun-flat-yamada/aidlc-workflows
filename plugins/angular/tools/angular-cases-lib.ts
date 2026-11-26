// angular-cases-lib.ts — human-written acceptance cases to structured JSON (angular plugin).
//
// Ported from an Angular AI-DLC SDK's Excel converter: header detection with
// English and Japanese column names, numbered steps, mocked API responses,
// expected UI / CSS / API requests and `@ui-id` references. The grid comes from
// angular-xlsx.ts (.xlsx), a CSV parser or a Markdown table, so every format
// gives the same result. The case hash covers `cases` only, so an edited
// expected value is detected. Self-contained (no core import, no dependency).
import { createHash } from "node:crypto";
import type { Sheet } from "./angular-xlsx.ts";

export interface ApiRequestExpectation {
  method: string;
  path: string;
  body?: unknown;
  raw: string;
}
export interface ApiMockResponse {
  method: string;
  path: string;
  status: number;
  body?: unknown;
  raw: string;
}
export interface CssExpectation {
  selector?: string;
  property: string;
  value: string;
  raw: string;
}
export interface TestStep {
  no: number;
  action: string;
}
export interface AcceptanceCase {
  id: string;
  sheet: string;
  row: number;
  category: string;
  title: string;
  priority: string;
  preconditions: string[];
  initialDeviceState: Record<string, string>;
  mockApi: ApiMockResponse[];
  steps: TestStep[];
  expectedUi: string[];
  expectedCss: CssExpectation[];
  expectedApi: ApiRequestExpectation[];
  uiRefs: string[];
  notes: string;
}
export interface CaseFile {
  schemaVersion: 1;
  generatedAt: string;
  sources: { file: string; sha256: string; sheets: string[] }[];
  casesSha256: string;
  cases: AcceptanceCase[];
  warnings: string[];
}

export type CaseField =
  | "id"
  | "category"
  | "title"
  | "priority"
  | "preconditions"
  | "initialDeviceState"
  | "mockApi"
  | "steps"
  | "expectedUi"
  | "expectedCss"
  | "expectedApi"
  | "notes";

export const CASE_FIELDS: CaseField[] = [
  "id", "category", "title", "priority", "preconditions", "initialDeviceState",
  "mockApi", "steps", "expectedUi", "expectedCss", "expectedApi", "notes",
];

/** Header names (English / Japanese). Matching ignores case, spacing and full-width forms. */
export const DEFAULT_HEADER_ALIASES: Record<CaseField, string[]> = {
  id: ["test id", "case id", "id", "テストid", "テストno", "テスト番号", "項番", "ケースid"],
  category: ["category", "feature", "大項目", "機能", "分類"],
  title: ["title", "test item", "test name", "テスト項目", "確認項目", "中項目", "テスト名"],
  priority: ["priority", "優先度", "重要度"],
  preconditions: ["preconditions", "precondition", "前提条件"],
  initialDeviceState: ["initial device state", "device state", "initial state", "機器初期状態", "初期状態", "機器状態"],
  mockApi: ["api responses", "mock responses", "api mock", "api応答", "モック応答", "api応答(モック)"],
  steps: ["steps", "procedure", "operation", "操作手順", "手順", "フロントパネル操作手順"],
  expectedUi: ["expected ui", "expected display", "expected result", "期待画面表示", "期待結果", "期待値(画面)"],
  expectedCss: ["expected css", "expected style", "期待css状態", "期待css", "期待スタイル"],
  expectedApi: ["expected api request", "expected request", "expected api", "期待apiリクエスト", "期待api"],
  notes: ["notes", "remarks", "備考"],
};

export function normalizeHeader(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s_　]+/g, " ")
    .replace(/\s*\(\s*/g, "(")
    .replace(/\s*\)\s*/g, ")")
    .trim();
}

export function hashCases(cases: readonly AcceptanceCase[]): string {
  return createHash("sha256").update(JSON.stringify(cases)).digest("hex");
}

export function sha256(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** Splits a multi-line cell into items without list markers (`1.`, `(2)`, `①`, `・`, `-`). */
export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^(?:\(?\d+[.)．）]|[①-⑳]|[・\-*•])\s*/u, "").trim())
    .filter((l) => l.length > 0);
}

function parseJsonLoose(text: string | undefined): unknown {
  if (!text?.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text.trim();
  }
}

const METHOD = "(GET|POST|PUT|PATCH|DELETE)";

export function parseApiRequests(text: string): ApiRequestExpectation[] {
  const re = new RegExp(`^${METHOD}\\s+(\\S+)\\s*(.*)$`, "i");
  return splitLines(text).flatMap((line) => {
    const m = re.exec(line);
    if (!m) return [];
    const body = parseJsonLoose(m[3]);
    return [{ method: m[1].toUpperCase(), path: m[2], ...(body !== undefined ? { body } : {}), raw: line }];
  });
}

export function parseApiMocks(text: string): ApiMockResponse[] {
  const re = new RegExp(`^${METHOD}\\s+(\\S+)\\s*(?:->|→|=>)\\s*(\\d{3})\\s*(.*)$`, "i");
  return splitLines(text).flatMap((line) => {
    const m = re.exec(line);
    if (!m) return [];
    const body = parseJsonLoose(m[4]);
    return [{ method: m[1].toUpperCase(), path: m[2], status: Number(m[3]), ...(body !== undefined ? { body } : {}), raw: line }];
  });
}

export function parseCss(text: string): CssExpectation[] {
  return splitLines(text).flatMap((line) => {
    const block = /^(.+?)\s*\{\s*([\w-]+)\s*:\s*(.+?)\s*;?\s*\}$/.exec(line);
    if (block) return [{ selector: block[1].trim(), property: block[2], value: block[3], raw: line }];
    const decl = /^([\w-]+)\s*:\s*(.+?)\s*;?$/.exec(line);
    return decl ? [{ property: decl[1], value: decl[2], raw: line }] : [];
  });
}

export function parseKeyValues(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of splitLines(text)) {
    const m = /^([^=:：]+)[=:：](.*)$/.exec(line);
    if (m) out[m[1].trim()] = m[2].trim();
  }
  return out;
}

/** `@ui-id` references (`@save-button`); e-mail-like text is ignored. */
export function extractUiRefs(...texts: string[]): string[] {
  return [...new Set(texts.flatMap((t) => [...t.matchAll(/(?<![\w.])@([a-z][a-z0-9-]*)/g)].map((m) => m[1])))];
}

export function parseSteps(text: string): TestStep[] {
  return splitLines(text).map((action, i) => ({ no: i + 1, action }));
}

export function buildAliasMap(extra: Partial<Record<CaseField, string[]>> = {}): Map<string, CaseField> {
  const map = new Map<string, CaseField>();
  for (const field of CASE_FIELDS) for (const n of [...DEFAULT_HEADER_ALIASES[field], ...(extra[field] ?? [])]) map.set(normalizeHeader(n), field);
  return map;
}

/** The header row (within the first 15 rows): it names an id, the steps and at least one more column. */
export function detectHeader(sheet: Sheet, aliases: Map<string, CaseField>): { row: number; columns: Map<number, CaseField> } | undefined {
  for (let r = 0; r < Math.min(sheet.rows.length, 15); r++) {
    const columns = new Map<number, CaseField>();
    (sheet.rows[r] ?? []).forEach((cell, col) => {
      const field = aliases.get(normalizeHeader(cell ?? ""));
      if (field && ![...columns.values()].includes(field)) columns.set(col, field);
    });
    const fields = new Set(columns.values());
    if (fields.has("id") && fields.has("steps") && fields.size >= 3) return { row: r, columns };
  }
  return undefined;
}

export interface ParseResult {
  cases: AcceptanceCase[];
  warnings: string[];
  sheets: string[];
}

export function parseSheets(sheets: Sheet[], options: { sheets?: string[]; aliases?: Partial<Record<CaseField, string[]>> } = {}): ParseResult {
  const aliases = buildAliasMap(options.aliases);
  const result: ParseResult = { cases: [], warnings: [], sheets: [] };
  const seen = new Set<string>();
  for (const sheet of sheets) {
    if (options.sheets?.length && !options.sheets.includes(sheet.name)) continue;
    const header = detectHeader(sheet, aliases);
    if (!header) {
      if (options.sheets?.length) result.warnings.push(`Sheet "${sheet.name}": no header row found`);
      continue;
    }
    result.sheets.push(sheet.name);
    let category = "";
    for (let r = header.row + 1; r < sheet.rows.length; r++) {
      const row = sheet.rows[r] ?? [];
      const raw: Partial<Record<CaseField, string>> = {};
      for (const [col, field] of header.columns) raw[field] = (row[col] ?? "").trim();
      const rowNo = r + 1;
      // A category is often merged or left blank below the first row of its group.
      if (raw.category) category = raw.category;
      const id = raw.id ?? "";
      if (!id) {
        if (raw.steps || raw.expectedUi) result.warnings.push(`${sheet.name}!R${rowNo}: row has content but no test ID - skipped`);
        continue;
      }
      if (seen.has(id)) {
        result.warnings.push(`${sheet.name}!R${rowNo}: duplicate test ID "${id}" - skipped`);
        continue;
      }
      seen.add(id);
      const c: AcceptanceCase = {
        id,
        sheet: sheet.name,
        row: rowNo,
        category,
        title: raw.title ?? "",
        priority: raw.priority ?? "",
        preconditions: splitLines(raw.preconditions ?? ""),
        initialDeviceState: parseKeyValues(raw.initialDeviceState ?? ""),
        mockApi: parseApiMocks(raw.mockApi ?? ""),
        steps: parseSteps(raw.steps ?? ""),
        expectedUi: splitLines(raw.expectedUi ?? ""),
        expectedCss: parseCss(raw.expectedCss ?? ""),
        expectedApi: parseApiRequests(raw.expectedApi ?? ""),
        uiRefs: extractUiRefs(raw.preconditions ?? "", raw.steps ?? "", raw.expectedUi ?? "", raw.expectedCss ?? ""),
        notes: raw.notes ?? "",
      };
      if (c.steps.length === 0) result.warnings.push(`${id}: no steps`);
      if (!c.expectedUi.length && !c.expectedCss.length && !c.expectedApi.length) result.warnings.push(`${id}: no expected result (UI / CSS / API)`);
      const unparsedApi = splitLines(raw.expectedApi ?? "").length - c.expectedApi.length;
      if (unparsedApi > 0) result.warnings.push(`${id}: ${unparsedApi} expected API line(s) not in "METHOD /path {json}" form`);
      const unparsedMock = splitLines(raw.mockApi ?? "").length - c.mockApi.length;
      if (unparsedMock > 0) result.warnings.push(`${id}: ${unparsedMock} API response line(s) not in "METHOD /path -> 200 {json}" form`);
      result.cases.push(c);
    }
  }
  return result;
}

/** RFC 4180 CSV (quoted fields may hold commas, quotes and line breaks); a BOM is dropped. */
export function parseCsv(text: string, name = "csv"): Sheet {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return { name, rows };
}

/** Markdown pipe tables; `<br>` in a cell is a line break, `\|` a literal pipe. */
export function parseMarkdownTables(text: string, name = "md"): Sheet {
  const rows: string[][] = [];
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|")) continue;
    const cells = t.replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, "|").replace(/<br\s*\/?>/gi, "\n").trim());
    if (cells.every((c) => /^:?-{3,}:?$/.test(c))) continue;
    rows.push(cells);
  }
  return { name, rows };
}

export function renderChecklist(file: CaseFile): string {
  const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
  const lines = [
    "# Acceptance cases (generated - do not edit)",
    "",
    `Cases: ${file.cases.length} / sha256: \`${file.casesSha256.slice(0, 16)}\` / sources: ${file.sources.map((s) => `\`${s.file}\``).join(", ")}`,
    "",
    "| ID | Category | Title | Steps | Expected UI | Expected CSS | Expected API | ui-ids |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const c of file.cases) {
    lines.push(`| ${cell(c.id)} | ${cell(c.category)} | ${cell(c.title)} | ${c.steps.length} | ${c.expectedUi.length} | ${c.expectedCss.length} | ${c.expectedApi.length} | ${c.uiRefs.join(", ")} |`);
  }
  if (file.warnings.length) lines.push("", "## Warnings", "", ...file.warnings.map((w) => `- ${w}`));
  return `${lines.join("\n")}\n`;
}
