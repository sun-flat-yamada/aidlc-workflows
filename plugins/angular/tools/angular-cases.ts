// angular-cases.ts — the `aidlc angular-cases` command (angular plugin).
//
//   aidlc angular-cases <file>... [--out <dir>] [--sheet <name>]... [--alias "<header>=<field>"]...
//
// Converts the team's acceptance cases (.xlsx, .csv or a Markdown table) to
// angular-acceptance-cases.json and a readable angular-acceptance-cases.md in
// <dir> (default: the current folder). The JSON records each source file's
// SHA-256 and the hash of the cases, which the angular-acceptance-gate sensor
// recomputes. Exit 0 with at least one case, 1 otherwise, 2 on bad usage.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import {
  type CaseField,
  CASE_FIELDS,
  type CaseFile,
  hashCases,
  parseCsv,
  parseMarkdownTables,
  parseSheets,
  renderChecklist,
  sha256,
} from "./angular-cases-lib.ts";
import { readXlsx, type Sheet, XlsxError } from "./angular-xlsx.ts";

export const CASES_JSON = "angular-acceptance-cases.json";

function usage(message: string): number {
  process.stderr.write(`${message}\nusage: aidlc angular-cases <file.xlsx|.csv|.md>... [--out <dir>] [--sheet <name>] [--alias "<header>=<field>"]\n`);
  return 2;
}

export function sheetsOf(path: string, buf: Buffer): Sheet[] {
  const lower = path.toLowerCase();
  if (lower.endsWith(".xlsx")) return readXlsx(buf);
  if (lower.endsWith(".csv")) return [parseCsv(buf.toString("utf-8"), basename(path))];
  if (lower.endsWith(".md")) return [parseMarkdownTables(buf.toString("utf-8"), basename(path))];
  throw new XlsxError(`${basename(path)}: use .xlsx, .csv or .md (an .xls workbook must be saved as .xlsx first)`);
}

export function main(argv: string[]): number {
  const files: string[] = [];
  const sheets: string[] = [];
  const aliases: Partial<Record<CaseField, string[]>> = {};
  let out = ".";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") out = argv[++i] ?? "";
    else if (a === "--sheet") sheets.push(argv[++i] ?? "");
    else if (a === "--alias") {
      const m = /^(.+)=(\w+)$/.exec(argv[++i] ?? "");
      if (!m || !CASE_FIELDS.includes(m[2] as CaseField)) return usage(`--alias takes "<header>=<field>", field one of ${CASE_FIELDS.join(", ")}`);
      const field = m[2] as CaseField;
      aliases[field] = [...(aliases[field] ?? []), m[1]];
    } else if (a.startsWith("--")) return usage(`unknown flag ${a}`);
    else files.push(a);
  }
  if (files.length === 0 || !out) return usage("name at least one case file");
  const projectDir = process.env.AIDLC_PROJECT_DIR ?? process.cwd();
  const file: CaseFile = { schemaVersion: 1, generatedAt: new Date().toISOString(), sources: [], casesSha256: "", cases: [], warnings: [] };
  const ids = new Set<string>();
  for (const f of files) {
    const path = isAbsolute(f) ? f : resolve(projectDir, f);
    let buf: Buffer;
    try {
      buf = readFileSync(path);
    } catch {
      process.stdout.write(`${f}: not found. Nothing written.\n`);
      return 1;
    }
    let parsed: ReturnType<typeof parseSheets>;
    try {
      parsed = parseSheets(sheetsOf(path, buf), { sheets, aliases });
    } catch (e) {
      process.stdout.write(`${f}: ${e instanceof Error ? e.message : String(e)}. Nothing written.\n`);
      return 1;
    }
    for (const c of parsed.cases) {
      if (ids.has(c.id)) {
        file.warnings.push(`${basename(path)}: duplicate test ID "${c.id}" across files - skipped`);
        continue;
      }
      ids.add(c.id);
      file.cases.push(c);
    }
    file.warnings.push(...parsed.warnings.map((w) => `${basename(path)}: ${w}`));
    file.sources.push({ file: relative(projectDir, path).split("\\").join("/"), sha256: sha256(buf), sheets: parsed.sheets });
  }
  file.casesSha256 = hashCases(file.cases);
  const outDir = resolve(projectDir, out);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, CASES_JSON), `${JSON.stringify(file, null, 2)}\n`);
  writeFileSync(join(outDir, "angular-acceptance-cases.md"), renderChecklist(file));
  process.stdout.write(`${file.cases.length} case(s) from ${file.sources.length} file(s) -> ${relative(projectDir, join(outDir, CASES_JSON)) || CASES_JSON}\n`);
  for (const w of file.warnings) process.stdout.write(`warning: ${w}\n`);
  if (file.cases.length === 0) process.stdout.write("No case found: the header row needs a test ID column, a steps column and one more known column (see --alias).\n");
  return file.cases.length > 0 ? 0 : 1;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
