// aidlc-sensor-atlas-citations.ts — ADVISORY citation check (codebase-atlas plugin).
//
// Fires at the Reverse Engineering gate on each artifact of a repository's code
// knowledge base. Every `path:line` it cites must name a file of the repository
// and a line that file has; an evidence artifact that cites nothing is named as
// a warning. Self-contained: a plugin tool must not import a core tool.
import { checkCitations, passThrough, repoOfCodekbPath, type CheckResult } from "./atlas-lib.ts";

function outputPathOf(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) if (argv[i] === "--output-path") return argv[i + 1];
  return undefined;
}

export function run(outputPath: string, projectDir: string): CheckResult {
  if (!/[\\/]codekb[\\/][^\\/]+[\\/][^\\/]+\.md$/.test(outputPath)) return passThrough();
  try {
    return checkCitations(outputPath, projectDir, repoOfCodekbPath(outputPath));
  } catch {
    return passThrough();
  }
}

export function main(argv: string[]): void {
  const outputPath = outputPathOf(argv);
  if (!outputPath) {
    process.stderr.write("aidlc-sensor-atlas-citations: --output-path is required\n");
    process.exit(1);
  }
  const projectDir = process.env.AIDLC_PROJECT_DIR ?? process.cwd();
  process.stdout.write(`${JSON.stringify(run(outputPath, projectDir))}\n`);
}

if (import.meta.main) main(process.argv.slice(2));
