// The angular plugin's own content validation and sensor behaviour.
//
// It imports tests/harness/plugin-kit.ts and the dist/ trees by relative path,
// so it runs only inside this checkout (the integration tier discovers it).
//
// Run: bun test plugins/angular/tests/plugin.test.ts

import {
  NATIVE_FIXTURE_SETUP_TIMEOUT_MS,
  NATIVE_STARTUP_TIMEOUT_MS,
  remainingOperationTimeoutMs,
} from "../../../tests/harness/test-budget.ts";
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validatePluginContent, walkMarkdownFiles } from "../../../tests/harness/plugin-kit.ts";
import { evaluate } from "../tools/aidlc-sensor-angular-acceptance-gate.ts";
import { scanProject } from "../tools/aidlc-sensor-angular-test-integrity.ts";
import { serverEntry, supportsMcp } from "../tools/angular-mcp-config.ts";

setDefaultTimeout(NATIVE_FIXTURE_SETUP_TIMEOUT_MS);

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(HERE, "..");
const REPO_ROOT = join(PLUGIN_ROOT, "..", "..");
const CLAUDE_DIST = join(REPO_ROOT, "dist", "claude", ".claude");
const MEMORY_DIST = join(REPO_ROOT, "dist", "claude", "aidlc");
const PLUGIN_DIST = join(REPO_ROOT, "dist", "plugins", "angular", "claude");

const SENSOR_TOOLS = ["aidlc-sensor-angular-test-integrity.ts", "aidlc-sensor-angular-acceptance-gate.ts"];

describe("angular plugin own content validation", () => {
  test("passes the reusable plugin content validator", () => {
    expect(validatePluginContent(PLUGIN_ROOT)).toEqual([]);
  });

  test("every sensor manifest has its script in tools/", () => {
    for (const tool of SENSOR_TOOLS) expect(existsSync(join(PLUGIN_ROOT, "tools", tool))).toBe(true);
  });
});

describe("angular plugin sensor tools honor the main(argv) contract", () => {
  for (const tool of SENSOR_TOOLS) {
    const toolPath = join(PLUGIN_ROOT, "tools", tool);

    test(`${tool} exports main(argv) and does not run on import`, () => {
      const probe = [
        `const mod = await import(${JSON.stringify(toolPath)});`,
        `if (typeof mod.main !== "function") { console.error("no-main"); process.exit(3); }`,
        `console.log("imported");`,
      ].join("\n");
      const result = spawnSync(process.execPath, ["-e", probe, "engine", "--stage", "build-and-test"], {
        timeout: remainingOperationTimeoutMs(NATIVE_STARTUP_TIMEOUT_MS),
        encoding: "utf-8",
      });
      expect(result.status, `${result.stdout ?? ""}${result.stderr ?? ""}`).toBe(0);
      expect(result.stdout).toContain("imported");
      expect(result.stdout).not.toContain('"pass"');
    });

    test(`${tool} passes through a deliverable that is not its trigger`, () => {
      const probe = [
        `const mod = await import(${JSON.stringify(toolPath)});`,
        `mod.main(["--stage", "build-and-test", "--output-path", "/nonexistent/build-instructions.md"]);`,
      ].join("\n");
      const result = spawnSync(process.execPath, ["-e", probe, "engine", "--unknown-engine-flag"], {
        timeout: remainingOperationTimeoutMs(NATIVE_STARTUP_TIMEOUT_MS),
        encoding: "utf-8",
      });
      expect(result.status, `${result.stdout ?? ""}${result.stderr ?? ""}`).toBe(0);
      expect(result.stdout).toContain('"pass":true');
    });
  }
});

describe("angular-test-integrity finds weakened tests", () => {
  let tmp = "";

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), "aidlc-angular-integrity-"));
    mkdirSync(join(tmp, "src", "app"), { recursive: true });
    mkdirSync(join(tmp, "e2e"), { recursive: true });
    mkdirSync(join(tmp, "node_modules", "lib"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "app", "page.spec.ts"),
      [
        "describe('page', () => {",
        "  it('loads', () => { expect(1).toBe(1); });",
        "  it.skip('saves', () => {});",
        "  xit('polls', () => {});",
        "  // it.only('is a comment', () => {});",
        "  fit('kept on purpose', () => {}); // angular-test-integrity: allow",
        "});",
      ].join("\n"),
    );
    writeFileSync(
      join(tmp, "e2e", "net.spec.ts"),
      [
        "test.only('[ST-1] x', async ({ page }) => {",
        "  await page.waitForTimeout(500);",
        "  await page.click('#a', { force: true });",
        "});",
      ].join("\n"),
    );
    writeFileSync(join(tmp, "node_modules", "lib", "dep.spec.ts"), "it.skip('vendored', () => {});\n");
  });

  afterAll(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });

  test("reports each weakening line and skips vendored, commented and allowed lines", () => {
    const result = scanProject(tmp);
    expect(result.scanned_files).toBe(2);
    expect(result.pass).toBe(false);
    expect(result.findings.map((f) => `${f.file}:${f.line}`).sort()).toEqual([
      "e2e/net.spec.ts:1",
      "e2e/net.spec.ts:2",
      "e2e/net.spec.ts:3",
      "src/app/page.spec.ts:3",
      "src/app/page.spec.ts:4",
    ]);
  });
});

describe("angular-acceptance-gate judges the human-written cases", () => {
  test("passes when every case has a passing test", () => {
    const r = evaluate({
      source: "tests/st.xlsx",
      cases: ["ST-1", "ST-2"],
      tests: [
        { title: "[ST-1] saves", status: "passed" },
        { title: "[ST-2] rejects", status: "passed" },
        { title: "[ST-2] rejects again", status: "passed" },
      ],
      cases_sha256_before: "a",
      cases_sha256_after: "a",
    });
    expect(r).toMatchObject({ pass: true, cases: 2, passed: 2 });
  });

  test("passes with no team cases when the file says so", () => {
    expect(evaluate({ source: "none", cases: [], tests: [] }).pass).toBe(true);
  });

  test("reports a missing, failed, skipped and unknown case and an edited case file", () => {
    const r = evaluate({
      source: "tests/st.xlsx",
      cases: ["ST-1", "ST-2", "ST-3"],
      tests: [
        { title: "[ST-1] saves", status: "failed" },
        { title: "[ST-2] rejects", status: "skipped" },
        { title: "[ST-9] stray", status: "passed" },
      ],
      cases_sha256_before: "a",
      cases_sha256_after: "b",
    });
    expect(r.pass).toBe(false);
    expect(r.passed).toBe(0);
    const messages = r.findings.map((f) => `${f.case ?? "-"}: ${f.message}`).join("\n");
    expect(messages).toContain("ST-1: not every test");
    expect(messages).toContain("ST-2: a test for this case was skipped");
    expect(messages).toContain("ST-3: no test titled");
    expect(messages).toContain("ST-9: test");
    expect(messages).toContain("case file changed");
  });

  test("reports an empty case list that does not say none", () => {
    expect(evaluate({ cases: [], tests: [] }).pass).toBe(false);
  });

  test("reads the results file beside build-and-test-summary.md", () => {
    const dir = mkdtempSync(join(tmpdir(), "aidlc-angular-gate-"));
    try {
      const summary = join(dir, "build-and-test-summary.md");
      writeFileSync(summary, "# summary\n");
      const tool = join(PLUGIN_ROOT, "tools", "aidlc-sensor-angular-acceptance-gate.ts");
      const run = () =>
        spawnSync(process.execPath, [tool, "--stage", "build-and-test", "--output-path", summary], {
          timeout: remainingOperationTimeoutMs(NATIVE_STARTUP_TIMEOUT_MS),
          encoding: "utf-8",
        });
      const missing = run();
      expect(missing.status).toBe(0);
      expect(missing.stdout).toContain('"pass":false');
      expect(missing.stdout).toContain("is missing");
      writeFileSync(
        join(dir, "angular-acceptance-results.json"),
        JSON.stringify({ source: "x", cases: ["ST-1"], tests: [{ title: "[ST-1] ok", status: "passed" }] }),
      );
      expect(run().stdout).toContain('"pass":true');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("aidlc angular-mcp adds the local Angular CLI MCP server", () => {
  const tool = join(PLUGIN_ROOT, "tools", "angular-mcp.ts");
  const doctor = join(PLUGIN_ROOT, "tools", "angular-doctor.ts");
  let project = "";

  const run = (script: string, args: string[], harness = ".claude") =>
    spawnSync(process.execPath, [script, ...args], {
      timeout: remainingOperationTimeoutMs(NATIVE_STARTUP_TIMEOUT_MS),
      encoding: "utf-8",
      env: { ...process.env, AIDLC_PROJECT_DIR: project, AIDLC_HARNESS_DIR: harness },
    });

  beforeAll(() => {
    project = mkdtempSync(join(tmpdir(), "aidlc-angular-mcp-"));
  });

  afterAll(() => {
    if (project) rmSync(project, { recursive: true, force: true });
  });

  test("the entry runs the project's own CLI, read-only and offline", () => {
    expect(serverEntry("linux")).toEqual({
      command: "npx",
      args: ["--no-install", "ng", "mcp", "--read-only", "--local-only"],
    });
    expect(serverEntry("win32").command).toBe("cmd");
    expect(serverEntry("win32").args.slice(0, 2)).toEqual(["/c", "npx"]);
    expect(supportsMcp("20.2.0")).toBe(true);
    expect(supportsMcp("22.3.0")).toBe(true);
    expect(supportsMcp("20.1.9")).toBe(false);
    expect(supportsMcp("19.2.0")).toBe(false);
  });

  test("refuses without angular.json or without the installed CLI, changing nothing", () => {
    expect(run(tool, []).status).toBe(1);
    expect(existsSync(join(project, ".mcp.json"))).toBe(false);
    writeFileSync(join(project, "angular.json"), "{}\n");
    const noCli = run(tool, []);
    expect(noCli.status).toBe(1);
    expect(noCli.stdout).toContain("not installed");
    expect(existsSync(join(project, ".mcp.json"))).toBe(false);
  });

  test("adds the server beside existing ones, is idempotent, and removes only its own entry", () => {
    mkdirSync(join(project, "node_modules", "@angular", "cli"), { recursive: true });
    writeFileSync(join(project, "node_modules", "@angular", "cli", "package.json"), JSON.stringify({ version: "22.3.0" }));
    writeFileSync(join(project, ".mcp.json"), JSON.stringify({ mcpServers: { other: { command: "x" } } }));
    const before = run(doctor, []);
    expect(before.stdout).toContain('"label":"Angular CLI MCP server configured","fix"');
    expect(JSON.parse(before.stdout).checks.at(-1).pass).toBe(false);

    expect(run(tool, ["--dry-run"]).stdout).toContain("Would add");
    expect(JSON.parse(readFileSync(join(project, ".mcp.json"), "utf-8")).mcpServers["angular-cli"]).toBeUndefined();

    const added = run(tool, []);
    expect(added.status, added.stdout).toBe(0);
    const config = JSON.parse(readFileSync(join(project, ".mcp.json"), "utf-8"));
    expect(config.mcpServers.other).toEqual({ command: "x" });
    expect(config.mcpServers["angular-cli"]).toEqual(serverEntry());
    expect(run(tool, []).stdout).toContain("already runs");
    expect(JSON.parse(run(doctor, []).stdout).checks.at(-1).pass).toBe(true);

    expect(run(tool, ["--remove"]).status).toBe(0);
    const after = JSON.parse(readFileSync(join(project, ".mcp.json"), "utf-8"));
    expect(after.mcpServers).toEqual({ other: { command: "x" } });
  });

  test("never overwrites an angular-cli entry it did not write", () => {
    writeFileSync(join(project, ".mcp.json"), JSON.stringify({ mcpServers: { "angular-cli": { command: "npx", args: ["-y", "@angular/cli", "mcp"] } } }));
    const result = run(tool, []);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("left as it is");
    expect(JSON.parse(readFileSync(join(project, ".mcp.json"), "utf-8")).mcpServers["angular-cli"].args).toEqual(["-y", "@angular/cli", "mcp"]);
    expect(run(tool, ["--remove"]).status).toBe(1);
  });

  test("writes Codex's TOML and Kiro's settings file, and prints for other hosts", () => {
    rmSync(join(project, ".mcp.json"));
    expect(run(tool, [], ".codex").status).toBe(0);
    const toml = readFileSync(join(project, ".codex", "config.toml"), "utf-8");
    expect(toml).toContain("[mcp_servers.angular-cli]");
    expect(toml).toContain('"--read-only", "--local-only"');
    expect(run(tool, [], ".codex").stdout).toContain("already runs");
    expect(run(tool, ["--remove"], ".codex").status).toBe(0);
    expect(readFileSync(join(project, ".codex", "config.toml"), "utf-8")).not.toContain("angular-cli");

    expect(run(tool, [], ".kiro").status).toBe(0);
    expect(existsSync(join(project, ".kiro", "settings", "mcp.json"))).toBe(true);

    const other = run(tool, [], ".aidlc");
    expect(other.status).toBe(0);
    expect(other.stdout).toContain('"angular-cli"');
  });
});

describe("angular plugin composed into a Claude install", () => {
  let tmp = "";
  let project = "";

  beforeAll(() => {
    if (!existsSync(PLUGIN_DIST)) throw new Error(`run bun scripts/package.ts first: ${PLUGIN_DIST} is missing`);
    tmp = mkdtempSync(join(tmpdir(), "aidlc-angular-compose-"));
    project = join(tmp, "project");
    mkdirSync(project, { recursive: true });
    cpSync(CLAUDE_DIST, join(project, ".claude"), { recursive: true });
    cpSync(MEMORY_DIST, join(project, "aidlc"), { recursive: true });
    const compose = spawnSync(process.execPath, [join(PLUGIN_DIST, "hooks", "compose.ts")], {
      timeout: remainingOperationTimeoutMs(NATIVE_STARTUP_TIMEOUT_MS),
      cwd: project,
      encoding: "utf-8",
      env: {
        ...process.env,
        CLAUDE_PLUGIN_ROOT: PLUGIN_DIST,
        CLAUDE_PROJECT_DIR: project,
        AIDLC_HARNESS_DIR: ".claude",
      },
    });
    if (compose.status !== 0) throw new Error(`angular compose failed: ${compose.stderr ?? compose.stdout}`);
  });

  afterAll(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });

  test("the sensors, their scripts and the knowledge land in the install", () => {
    const claude = join(project, ".claude");
    expect(existsSync(join(claude, "sensors", "aidlc-angular-test-integrity.md"))).toBe(true);
    expect(existsSync(join(claude, "sensors", "aidlc-angular-acceptance-gate.md"))).toBe(true);
    for (const tool of SENSOR_TOOLS) expect(existsSync(join(claude, "tools", tool))).toBe(true);
    expect(existsSync(join(claude, "knowledge", "aidlc-developer-agent", "angular-implementation-guide.md"))).toBe(true);
    expect(existsSync(join(claude, "knowledge", "aidlc-quality-agent", "angular-acceptance-gate-guide.md"))).toBe(true);
  });

  test("the stage graph binds the sensors to their stages", () => {
    const graph = JSON.parse(
      readFileSync(join(project, ".claude", "tools", "data", "stage-graph.json"), "utf-8"),
    ) as Array<{ slug: string; sensors?: string[] }> | { stages?: Array<{ slug: string; sensors?: string[] }> };
    const stages = Array.isArray(graph) ? graph : (graph.stages ?? []);
    const sensorsOf = (slug: string) => stages.find((s) => s.slug === slug)?.sensors ?? [];
    expect(sensorsOf("code-generation")).toContain("angular-test-integrity");
    expect(sensorsOf("build-and-test")).toEqual(
      expect.arrayContaining(["angular-test-integrity", "angular-acceptance-gate"]),
    );
  });

  test("every angular step lands before its target stage's Completion Handoff", () => {
    const stagesDir = join(project, ".claude", "aidlc-common", "stages");
    const composed = walkMarkdownFiles(stagesDir).filter((file) => readFileSync(file, "utf-8").includes("(angular):"));
    expect(composed.length).toBe(4);
    const late: string[] = [];
    for (const file of composed) {
      const text = readFileSync(file, "utf-8").replace(/\r\n/g, "\n");
      const handoff = text.search(/^### Step \d+: Completion Handoff\b/m);
      expect(handoff, file).toBeGreaterThan(-1);
      for (const step of text.matchAll(/^### Step[^\n]*\(angular\):[^\n]*$/gm)) {
        if ((step.index ?? 0) > handoff) late.push(`${file.slice(stagesDir.length + 1)}: ${step[0]}`);
      }
    }
    expect(late).toEqual([]);
  });

  test("the team rules carry the plugin's section", () => {
    const team = walkMarkdownFiles(join(project, "aidlc"))
      .filter((file) => file.endsWith("team.md"))
      .map((file) => readFileSync(file, "utf-8"))
      .join("\n");
    expect(team).toContain("Angular house rules");
  });
});
