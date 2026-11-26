// angular-doctor.ts — the angular plugin's /aidlc --doctor checks. Read-only.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { configTarget, configuredState, isAngularWorkspace, serverEntry } from "./angular-mcp-config.ts";

const projectDir = process.env.AIDLC_PROJECT_DIR ?? process.cwd();
const harnessDir = process.env.AIDLC_HARNESS_DIR ?? ".claude";
const harnessRoot = join(projectDir, harnessDir);
const entry = harnessDir === ".codex" ? "$aidlc" : "/aidlc";
const syncFix = `Run \`${entry} plugin sync\` (or re-run the plugin's \`hooks/compose.ts\`).`;

type Check = { pass: boolean; label: string; fix: string; severity: "error" | "advisory" };

function installed(relativePath: string): Check {
  return { pass: existsSync(join(harnessRoot, relativePath)), label: `${relativePath} installed`, fix: syncFix, severity: "error" };
}

const checks: Check[] = [
  installed("sensors/aidlc-angular-test-integrity.md"),
  installed("sensors/aidlc-angular-acceptance-gate.md"),
  installed("tools/aidlc-sensor-angular-test-integrity.ts"),
  installed("tools/aidlc-sensor-angular-acceptance-gate.ts"),
];

const target = configTarget(harnessDir);
if (isAngularWorkspace(projectDir) && target) {
  checks.push({
    pass: configuredState(projectDir, target, serverEntry()) !== "absent",
    label: "Angular CLI MCP server configured",
    fix: `Run \`${entry} angular-mcp\` to add it (local, read-only, offline), or ignore this if you do not want it.`,
    severity: "advisory",
  });
}

process.stdout.write(`${JSON.stringify({ checks })}\n`);
