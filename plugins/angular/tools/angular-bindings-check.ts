// angular-bindings-check.ts — the `aidlc angular-bindings-check` command (angular plugin).
//
//   aidlc angular-bindings-check <frontend-components.md|bindings.yaml> [--matrix <out.md>] [--json]
//
// Runs the same UI Bindings check the gate runs and prints what it found, what
// it checked and what it could not check. Exit 0 with no errors, 1 with errors.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkBindings, extractBindingsYaml, parseYaml, recordDirOf, renderMatrix } from "./angular-bindings-lib.ts";

export function main(argv: string[]): number {
  const args = argv.filter((a) => !a.startsWith("--"));
  const matrixAt = argv.indexOf("--matrix");
  const matrixOut = matrixAt >= 0 ? argv[matrixAt + 1] : undefined;
  const file = args.find((a) => a !== matrixOut);
  if (!file) {
    process.stderr.write("usage: aidlc angular-bindings-check <frontend-components.md|bindings.yaml> [--matrix <out.md>] [--json]\n");
    return 2;
  }
  const projectDir = process.env.AIDLC_PROJECT_DIR ?? process.cwd();
  const path = resolve(projectDir, file);
  const text = readFileSync(path, "utf-8");
  const yaml = path.endsWith(".md") ? extractBindingsYaml(text) : text;
  if (!yaml) {
    process.stdout.write(`${file} has no \`## UI Bindings\` yaml block.\n`);
    return 1;
  }
  const { result, bindings, operations } = checkBindings(parseYaml(yaml), { projectDir, bindingsFile: path, recordDir: recordDirOf(path) });
  if (argv.includes("--json")) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else {
    for (const f of [...result.findings, ...result.warnings]) process.stdout.write(`${f.level.toUpperCase()} ${f.where}: ${f.message}\n`);
    process.stdout.write(`Checked: ${result.checked.join(", ") || "-"}\n`);
    if (result.not_checked.length) process.stdout.write(`Not checked: ${result.not_checked.join("; ")}\n`);
    process.stdout.write(`${result.findings.length} error(s), ${result.warnings.length} warning(s)\n`);
  }
  if (matrixOut && bindings) writeFileSync(resolve(projectDir, matrixOut), `${renderMatrix(bindings, operations)}\n`);
  return result.pass ? 0 : 1;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
