// aidlc-sensor-atlas-coverage.ts — ADVISORY coverage check (codebase-atlas plugin).
//
// Fires at the Reverse Engineering gate and acts on component-inventory.md:
// every source file graphify counted (aidlc atlas-graph build) belongs to a
// component's `**Paths**:` line or to the Outside Components section. With no
// graph built, it names the check under not_checked and passes. Every other
// artifact passes through. Self-contained: a plugin tool must not import a core
// tool.
import { basename } from "node:path";
import { checkCoverage, passThrough, repoOfCodekbPath, type CheckResult } from "./atlas-lib.ts";

function outputPathOf(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) if (argv[i] === "--output-path") return argv[i + 1];
  return undefined;
}

export function run(outputPath: string, projectDir: string): CheckResult {
  if (basename(outputPath) !== "component-inventory.md") return passThrough();
  if (!/[\\/]codekb[\\/][^\\/]+[\\/]component-inventory\.md$/.test(outputPath)) return passThrough();
  try {
    return checkCoverage(outputPath, projectDir, repoOfCodekbPath(outputPath));
  } catch {
    return passThrough();
  }
}

export function main(argv: string[]): void {
  const outputPath = outputPathOf(argv);
  if (!outputPath) {
    process.stderr.write("aidlc-sensor-atlas-coverage: --output-path is required\n");
    process.exit(1);
  }
  const projectDir = process.env.AIDLC_PROJECT_DIR ?? process.cwd();
  process.stdout.write(`${JSON.stringify(run(outputPath, projectDir))}\n`);
}

if (import.meta.main) main(process.argv.slice(2));
