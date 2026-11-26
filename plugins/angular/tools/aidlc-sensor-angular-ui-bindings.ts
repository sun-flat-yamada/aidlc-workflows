// aidlc-sensor-angular-ui-bindings.ts — ADVISORY UI Bindings check (angular plugin).
//
// Fires at the gate. On functional-spec.md (Functional Design) it checks the
// sibling frontend-components.md's `## UI Bindings` table against itself, the
// contract and the mock-ups; on code-summary.md (Code Generation) it checks the
// generated templates carry every ui-id of the Unit's table. Every other
// deliverable, and a Unit with no table, passes through.
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  allRecordUiIds,
  type CheckResult,
  checkBindings,
  checkTemplates,
  extractBindingsYaml,
  parseYaml,
  recordDirOf,
} from "./angular-bindings-lib.ts";

const passThrough: CheckResult = { pass: true, findings_count: 0, findings: [], warnings: [], checked: [], not_checked: [] };

function parseFlags(argv: string[]): { outputPath?: string } {
  const out: { outputPath?: string } = {};
  for (let i = 0; i < argv.length; i++) if (argv[i] === "--output-path") out.outputPath = argv[++i];
  return out;
}

function failure(where: string, message: string): CheckResult {
  return { pass: false, findings_count: 1, findings: [{ level: "error", where, message }], warnings: [], checked: [], not_checked: [] };
}

/** The table of a frontend-components.md, or null when the file or section is absent. */
function readTable(file: string): { raw: unknown } | { error: string } | null {
  if (!existsSync(file)) return null;
  const yaml = extractBindingsYaml(readFileSync(file, "utf-8"));
  if (yaml === null) return null;
  if (yaml.trim() === "") return { error: "the `## UI Bindings` section has no ```yaml block" };
  try {
    return { raw: parseYaml(yaml) };
  } catch (e) {
    return { error: `the UI Bindings yaml does not parse: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export function run(outputPath: string, projectDir: string): CheckResult {
  const name = basename(outputPath);
  if (name === "functional-spec.md") {
    const file = join(dirname(outputPath), "frontend-components.md");
    const table = readTable(file);
    if (!table) return passThrough;
    if ("error" in table) return failure("frontend-components.md", table.error);
    return checkBindings(table.raw, { projectDir, bindingsFile: file, recordDir: recordDirOf(file) }).result;
  }
  if (name === "code-summary.md") {
    const unitDir = dirname(dirname(outputPath));
    const file = join(unitDir, "functional-design", "frontend-components.md");
    const table = readTable(file);
    if (!table) return passThrough;
    if ("error" in table) return failure("frontend-components.md", table.error);
    const recordDir = recordDirOf(file);
    const checked = checkBindings(table.raw, { projectDir, bindingsFile: file, recordDir });
    if (!checked.bindings) return checked.result;
    const known = recordDir ? allRecordUiIds(recordDir).ids : new Set<string>();
    return checkTemplates(checked.bindings, projectDir, known);
  }
  return passThrough;
}

export function main(argv: string[]): void {
  const flags = parseFlags(argv);
  if (!flags.outputPath) {
    process.stderr.write("aidlc-sensor-angular-ui-bindings: --output-path is required\n");
    process.exit(1);
  }
  const projectDir = process.env.AIDLC_PROJECT_DIR ?? process.cwd();
  process.stdout.write(`${JSON.stringify(run(flags.outputPath, projectDir))}\n`);
}

if (import.meta.main) main(process.argv.slice(2));
