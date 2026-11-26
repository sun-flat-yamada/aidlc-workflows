// aidlc-sensor-angular-test-integrity.ts — ADVISORY test-weakening check (angular plugin).
//
// Fires at the gate. Acts once per gate on the stage's summary deliverable and
// scans the project's spec files for lines that switch a test off or force it to
// pass. Self-contained: a plugin tool ships in its own delta and must not import
// a core tool.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";

const TRIGGER_FILES = new Set(["code-summary.md", "build-and-test-summary.md"]);
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "coverage",
  ".angular",
  ".git",
  "aidlc",
  "aidlc-docs",
  "test-results",
  "playwright-report",
  ".nx",
]);
const SPEC_FILE = /\.(spec|test)\.[cm]?[jt]sx?$/;
const ALLOW_MARKER = "angular-test-integrity: allow";
const MAX_FILES = 5000;

const RULES: { pattern: RegExp; message: string }[] = [
  { pattern: /\b(?:describe|it|test|context|suite)\s*\.\s*skip\s*\(/, message: "test switched off with .skip" },
  { pattern: /\b(?:describe|it|test|context|suite)\s*\.\s*only\s*\(/, message: "test focused with .only (the rest of the suite does not run)" },
  { pattern: /\btest\s*\.\s*fixme\s*\(/, message: "test switched off with test.fixme" },
  { pattern: /\b(?:xit|xdescribe|xtest)\s*\(/, message: "test switched off with an x-prefixed call" },
  { pattern: /\b(?:fit|fdescribe)\s*\(/, message: "test focused with an f-prefixed call (the rest of the suite does not run)" },
  { pattern: /\bwaitForTimeout\s*\(/, message: "fixed sleep (waitForTimeout); use a web-first assertion" },
  { pattern: /\bforce\s*:\s*true\b/, message: "forced action (force: true) ignores whether the element is actionable" },
];

export interface Finding {
  file: string;
  line: number;
  message: string;
}

export interface Result {
  pass: boolean;
  findings_count: number;
  scanned_files: number;
  findings: Finding[];
}

function parseFlags(argv: string[]): { stage?: string; outputPath?: string } {
  const out: { stage?: string; outputPath?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--stage") out.stage = argv[++i];
    else if (argv[i] === "--output-path") out.outputPath = argv[++i];
  }
  return out;
}

function emit(result: Result): void {
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

function collectSpecFiles(root: string, out: string[]): void {
  if (out.length >= MAX_FILES) return;
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return;
  }
  for (const name of entries.sort()) {
    if (out.length >= MAX_FILES) return;
    // Harness folders (.claude, .kiro, .codex, ...) hold AI-DLC itself, not the project's tests.
    if (SKIP_DIRS.has(name) || (name.startsWith(".") && name !== "." && name !== "..")) continue;
    const path = join(root, name);
    let isDir = false;
    try {
      isDir = statSync(path).isDirectory();
    } catch {
      continue;
    }
    if (isDir) collectSpecFiles(path, out);
    else if (SPEC_FILE.test(name)) out.push(path);
  }
}

export function scanProject(projectDir: string): Result {
  const files: string[] = [];
  collectSpecFiles(projectDir, files);
  const findings: Finding[] = [];
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(file, "utf-8");
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (line.includes(ALLOW_MARKER)) return;
      const trimmed = line.trimStart();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
      for (const rule of RULES) {
        if (rule.pattern.test(line)) {
          findings.push({ file: relative(projectDir, file).split("\\").join("/"), line: index + 1, message: rule.message });
        }
      }
    });
  }
  return { pass: findings.length === 0, findings_count: findings.length, scanned_files: files.length, findings };
}

export function main(argv: string[]): void {
  const flags = parseFlags(argv);
  if (!flags.outputPath) {
    process.stderr.write("aidlc-sensor-angular-test-integrity: --output-path is required\n");
    process.exit(1);
  }
  // Every gate deliverable fires this sensor; only the summary triggers the scan,
  // so the project is scanned once per gate and other deliverables pass through.
  if (!TRIGGER_FILES.has(basename(flags.outputPath))) {
    emit({ pass: true, findings_count: 0, scanned_files: 0, findings: [] });
    return;
  }
  const projectDir = process.env.AIDLC_PROJECT_DIR ?? process.cwd();
  if (!existsSync(projectDir)) {
    emit({ pass: true, findings_count: 0, scanned_files: 0, findings: [] });
    return;
  }
  emit(scanProject(projectDir));
}

if (import.meta.main) main(process.argv.slice(2));
