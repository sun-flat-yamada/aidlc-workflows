// aidlc-sensor-angular-acceptance-gate.ts — ADVISORY acceptance gate (angular plugin).
//
// Fires at the Build and Test gate on build-and-test-summary.md and reads the
// sibling angular-acceptance-results.json, which the plugin's Build and Test
// contribution writes. The human-written acceptance cases are the final gate:
// every case needs a passing test titled "[<case id>] ...", nothing skipped,
// nothing unknown, and the case file unchanged during the run. Self-contained:
// a plugin tool must not import a core tool.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import { allRecordUiIds } from "./angular-bindings-lib.ts";

const TRIGGER_FILE = "build-and-test-summary.md";
const RESULTS_FILE = "angular-acceptance-results.json";
// Written by `aidlc angular-cases`; when present, the case list and the hashes
// come from it and are recomputed here instead of trusted from the results file.
const CASES_FILE = "angular-acceptance-cases.json";

export interface Finding {
  case?: string;
  message: string;
}

export interface Result {
  pass: boolean;
  findings_count: number;
  cases: number;
  passed: number;
  findings: Finding[];
}

interface TestRow {
  title?: unknown;
  status?: unknown;
}

interface ResultsFile {
  source?: unknown;
  cases?: unknown;
  tests?: unknown;
  min_pass_rate?: unknown;
  cases_sha256_before?: unknown;
  cases_sha256_after?: unknown;
}

const CASE_TITLE = /^\s*\[([^\]]+)\]/;

function parseFlags(argv: string[]): { stage?: string; outputPath?: string } {
  const out: { stage?: string; outputPath?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--stage") out.stage = argv[++i];
    else if (argv[i] === "--output-path") out.outputPath = argv[++i];
  }
  return out;
}

function result(findings: Finding[], cases = 0, passed = 0): Result {
  return { pass: findings.length === 0, findings_count: findings.length, cases, passed, findings };
}

export function evaluate(parsed: ResultsFile): Result {
  const findings: Finding[] = [];
  const caseIds = Array.isArray(parsed.cases)
    ? parsed.cases.filter((c): c is string => typeof c === "string" && c.trim().length > 0).map((c) => c.trim())
    : [];
  if (!Array.isArray(parsed.cases)) findings.push({ message: "`cases` must list the acceptance case ids" });
  if (parsed.source === "none" && caseIds.length === 0) return result(findings);
  if (caseIds.length === 0) {
    findings.push({ message: "no acceptance cases listed; write \"source\": \"none\" when the team supplied none" });
    return result(findings);
  }

  const known = new Set(caseIds);
  const tests: TestRow[] = Array.isArray(parsed.tests) ? (parsed.tests as TestRow[]) : [];
  if (!Array.isArray(parsed.tests)) findings.push({ message: "`tests` must list the end-to-end test results" });
  const byCase = new Map<string, string[]>();
  for (const row of tests) {
    const title = typeof row?.title === "string" ? row.title : "";
    const status = typeof row?.status === "string" ? row.status : "unknown";
    const match = CASE_TITLE.exec(title);
    if (!match) continue;
    const id = match[1].trim();
    if (!known.has(id)) {
      findings.push({ case: id, message: `test "${title}" names a case that is not in the acceptance cases` });
      continue;
    }
    const statuses = byCase.get(id) ?? [];
    statuses.push(status);
    byCase.set(id, statuses);
  }

  let passed = 0;
  for (const id of caseIds) {
    const statuses = byCase.get(id);
    if (!statuses || statuses.length === 0) {
      findings.push({ case: id, message: `no test titled "[${id}] ..."` });
      continue;
    }
    if (statuses.some((s) => s === "skipped")) {
      findings.push({ case: id, message: "a test for this case was skipped; skipped never counts as passed" });
      continue;
    }
    if (statuses.every((s) => s === "passed")) passed++;
    else findings.push({ case: id, message: `not every test for this case passed (${statuses.join(", ")})` });
  }

  const before = parsed.cases_sha256_before;
  const after = parsed.cases_sha256_after;
  if (typeof before === "string" && typeof after === "string" && before !== after) {
    findings.push({ message: "the acceptance case file changed during the run (cases_sha256_before differs from cases_sha256_after); expected values are not edited" });
  }

  const minPassRate = typeof parsed.min_pass_rate === "number" ? parsed.min_pass_rate : 1;
  const rate = passed / caseIds.length;
  if (rate < minPassRate && !findings.some((f) => f.case)) {
    findings.push({ message: `pass rate ${rate.toFixed(2)} is below ${minPassRate}` });
  }
  return result(findings, caseIds.length, passed);
}

interface CaseFile {
  sources?: { file?: unknown; sha256?: unknown }[];
  casesSha256?: unknown;
  cases?: { id?: unknown; uiRefs?: unknown }[];
}

const sha = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

/** Checks the converted case file and returns its case ids, or findings when it was edited. */
export function checkCaseFile(file: CaseFile, projectDir: string, knownUiIds: Set<string> | null): { ids: string[]; findings: Finding[] } {
  const findings: Finding[] = [];
  const cases = Array.isArray(file.cases) ? file.cases : [];
  const ids = cases.map((c) => (typeof c?.id === "string" ? c.id : "")).filter(Boolean);
  if (typeof file.casesSha256 !== "string" || sha(JSON.stringify(file.cases ?? [])) !== file.casesSha256) {
    findings.push({ message: `${CASES_FILE} differs from what angular-cases wrote (cases edited after conversion); convert the case file again` });
  }
  for (const src of Array.isArray(file.sources) ? file.sources : []) {
    if (typeof src?.file !== "string") continue;
    const path = isAbsolute(src.file) ? src.file : join(projectDir, src.file);
    if (!existsSync(path)) findings.push({ message: `case source ${src.file} is missing` });
    else if (sha(readFileSync(path)) !== src.sha256) findings.push({ message: `case source ${src.file} changed since it was converted; convert it again` });
  }
  if (knownUiIds) {
    for (const c of cases) {
      const refs = Array.isArray(c?.uiRefs) ? c.uiRefs.filter((r): r is string => typeof r === "string") : [];
      for (const ref of refs) if (!knownUiIds.has(ref)) findings.push({ case: String(c.id), message: `@${ref} is not a ui-id in any UI Bindings table` });
    }
  }
  return { ids, findings };
}

/** `<record>` for `<record>/construction/build-and-test/<file>`. */
function recordOf(outputPath: string): string | null {
  const construction = dirname(dirname(outputPath));
  return basename(construction) === "construction" ? dirname(construction) : null;
}

export function main(argv: string[]): void {
  const flags = parseFlags(argv);
  if (!flags.outputPath) {
    process.stderr.write("aidlc-sensor-angular-acceptance-gate: --output-path is required\n");
    process.exit(1);
  }
  // Only the stage summary triggers the check; every other deliverable passes through.
  if (basename(flags.outputPath) !== TRIGGER_FILE) {
    process.stdout.write(`${JSON.stringify(result([]))}\n`);
    return;
  }
  const resultsPath = join(dirname(flags.outputPath), RESULTS_FILE);
  if (!existsSync(resultsPath)) {
    process.stdout.write(`${JSON.stringify(result([{ message: `${RESULTS_FILE} is missing beside ${TRIGGER_FILE}` }]))}\n`);
    return;
  }
  let parsed: ResultsFile;
  try {
    parsed = JSON.parse(readFileSync(resultsPath, "utf-8"));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stdout.write(`${JSON.stringify(result([{ message: `${RESULTS_FILE} is not valid JSON: ${message}` }]))}\n`);
    return;
  }
  const casesPath = join(dirname(flags.outputPath), CASES_FILE);
  if (!existsSync(casesPath)) {
    process.stdout.write(`${JSON.stringify(evaluate(parsed ?? {}))}\n`);
    return;
  }
  let caseFile: CaseFile;
  try {
    caseFile = JSON.parse(readFileSync(casesPath, "utf-8"));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stdout.write(`${JSON.stringify(result([{ message: `${CASES_FILE} is not valid JSON: ${message}` }]))}\n`);
    return;
  }
  const projectDir = process.env.AIDLC_PROJECT_DIR ?? process.cwd();
  const record = recordOf(flags.outputPath);
  const tables = record ? allRecordUiIds(record) : { ids: new Set<string>(), tables: 0 };
  const checked = checkCaseFile(caseFile ?? {}, projectDir, tables.tables > 0 ? tables.ids : null);
  const verdict = evaluate({ ...(parsed ?? {}), cases: checked.ids, source: parsed?.source ?? CASES_FILE });
  const findings = [...checked.findings, ...verdict.findings];
  process.stdout.write(`${JSON.stringify(result(findings, verdict.cases, verdict.passed))}\n`);
}

if (import.meta.main) main(process.argv.slice(2));
