// The codebase-atlas plugin's own content validation, its checks, and its
// composition into a Claude install.
//
// It imports tests/harness/plugin-kit.ts and the dist/ trees by relative path,
// so it runs only inside this checkout (the integration tier discovers it).
//
// Run: bun test plugins/codebase-atlas/tests/plugin.test.ts

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
import {
  coverage,
  extractCitations,
  isAidlcOwned,
  parseInventory,
  pathMatches,
  readGraphFiles,
} from "../tools/atlas-lib.ts";
import { run as runCitations } from "../tools/aidlc-sensor-atlas-citations.ts";
import { run as runCoverage } from "../tools/aidlc-sensor-atlas-coverage.ts";

setDefaultTimeout(NATIVE_FIXTURE_SETUP_TIMEOUT_MS);

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(HERE, "..");
const REPO_ROOT = join(PLUGIN_ROOT, "..", "..");
const CLAUDE_DIST = join(REPO_ROOT, "dist", "claude", ".claude");
const MEMORY_DIST = join(REPO_ROOT, "dist", "claude", "aidlc");
const PLUGIN_DIST = join(REPO_ROOT, "dist", "plugins", "codebase-atlas", "claude");

const SENSOR_TOOLS = ["aidlc-sensor-atlas-citations.ts", "aidlc-sensor-atlas-coverage.ts"];

const INVENTORY = [
  "# Component Inventory",
  "",
  "## Components",
  "",
  "### Orders",
  "- **Responsibility**: takes orders (`src/orders/service.ts:2`)",
  "- **Paths**: `src/orders/`",
  "",
  "### Shared",
  "- **Paths**: `src/shared/*.ts`, `./`",
  "",
  "## Outside Components",
  "",
  "- **Paths**: `scripts/` — release tooling, not the product",
  "",
].join("\n");

function graph(files: string[]): string {
  return JSON.stringify({
    graph: { schema_version: 1 },
    nodes: [
      ...files.map((f, i) => ({ id: `n${i}`, file_type: "code", source_file: f })),
      { id: "doc", file_type: "document", source_file: "README.md" },
    ],
    links: [],
  });
}

// A project whose root is the one repository, with a published knowledge base.
function fixture(): { project: string; codekb: string } {
  const project = mkdtempSync(join(tmpdir(), "aidlc-atlas-"));
  const write = (rel: string, text: string) => {
    mkdirSync(dirname(join(project, rel)), { recursive: true });
    writeFileSync(join(project, rel), text);
  };
  write("src/orders/service.ts", "export class OrderService {\n  place() {}\n}\n");
  write("src/shared/money.ts", "export type Money = number;\n");
  write("src/legacy/old.ts", "export const old = 1;\n");
  write("scripts/release.ts", "console.log('release');\n");
  write(".claude/tools/aidlc-x.ts", "export {};\n");
  const codekb = join(project, "aidlc", "spaces", "default", "codekb", "app");
  write("aidlc/spaces/default/codekb/app/component-inventory.md", INVENTORY);
  write(
    "aidlc/spaces/default/codekb/app/architecture.md",
    [
      "# Architecture",
      "",
      "The service places orders (`src/orders/service.ts:2`), money is a number (src/shared/money.ts:1).",
      "Ranges work too: `src/orders/service.ts:1-3`. Missing line: `src/orders/service.ts:40`.",
      "Gone: `src/orders/gone.ts:1`. Not a citation: localhost:8080, https://example.com/a.ts:3.",
      "```mermaid",
      "flowchart LR",
      "  a[src/never/checked.ts:9] --> b",
      "```",
      "UNKNOWN: the retry limit.",
    ].join("\n"),
  );
  write(
    "aidlc/codebase-atlas/graph/app/graphify-out/graph.json",
    graph(["src/orders/service.ts", "src/shared/money.ts", "src/legacy/old.ts", "scripts/release.ts", ".claude/tools/aidlc-x.ts"]),
  );
  return { project, codekb };
}

describe("codebase-atlas plugin own content validation", () => {
  test("passes the reusable plugin content validator", () => {
    expect(validatePluginContent(PLUGIN_ROOT)).toEqual([]);
  });

  test("every sensor manifest has its script in tools/", () => {
    for (const tool of SENSOR_TOOLS) expect(existsSync(join(PLUGIN_ROOT, "tools", tool))).toBe(true);
  });
});

describe("codebase-atlas sensor tools honor the main(argv) contract", () => {
  for (const tool of SENSOR_TOOLS) {
    const toolPath = join(PLUGIN_ROOT, "tools", tool);

    test(`${tool} exports main(argv) and does not run on import`, () => {
      const probe = [
        `const mod = await import(${JSON.stringify(toolPath)});`,
        `if (typeof mod.main !== "function") { console.error("no-main"); process.exit(3); }`,
        `console.log("imported");`,
      ].join("\n");
      const result = spawnSync(process.execPath, ["-e", probe, "engine", "--stage", "reverse-engineering"], {
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
        `mod.main(["--stage", "reverse-engineering", "--output-path", "/nonexistent/requirements.md"]);`,
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

describe("codebase-atlas reads citations, inventories and graphs", () => {
  test("extracts ticked and unticked citations outside code fences", () => {
    const cites = extractCitations(
      "a `src/a.ts:3` and src/b.py:L4-L9, not http://x.io/c.ts:5\n```\nsrc/d.ts:1\n```\nhost:80 e.cs:7",
    );
    expect(cites.map((c) => `${c.path}:${c.start}-${c.end}`)).toEqual(["src/a.ts:3-3", "src/b.py:4-9", "e.cs:7-7"]);
  });

  test("parses component paths, Outside Components and root-wide paths", () => {
    const inv = parseInventory(INVENTORY);
    expect([...inv.components.entries()]).toEqual([
      ["Orders", ["src/orders/"]],
      ["Shared", ["src/shared/*.ts"]],
    ]);
    expect(inv.outside).toEqual(["scripts/"]);
    expect(inv.broad).toEqual([{ owner: "Shared", path: "." }]);
  });

  test("matches folders, files and globs, and leaves AI-DLC's own files out", () => {
    expect(pathMatches("src/orders/a/b.ts", "src/orders/")).toBe(true);
    expect(pathMatches("src/ordersx/b.ts", "src/orders")).toBe(false);
    expect(pathMatches("src/x/legacy/a.vb", "src/*/legacy/**")).toBe(true);
    expect(pathMatches("Src/Main.FRM", "src/main.frm")).toBe(true);
    expect(isAidlcOwned(".claude/tools/aidlc-x.ts")).toBe(true);
    expect(isAidlcOwned(".github/agents/aidlc-dev.md")).toBe(true);
    expect(isAidlcOwned(".github/workflows/ci.yml")).toBe(false);
    const report = coverage(["src/orders/a.ts", "scripts/r.ts", "src/legacy/old.ts", "aidlc/x.ts"], parseInventory(INVENTORY));
    expect(report).toMatchObject({ total: 3, covered: 1, outside: 1, uncovered: ["src/legacy/old.ts"] });
  });

  test("reads graphify's code nodes, relative or absolute", () => {
    const dir = mkdtempSync(join(tmpdir(), "aidlc-atlas-graph-"));
    try {
      const path = join(dir, "graph.json");
      writeFileSync(path, graph(["src/a.ts", join(dir, "src", "b.ts").replace(/\\/g, "/"), "/elsewhere/c.ts", "./src/d.ts"]));
      const read = readGraphFiles(path, dir);
      expect([...read.files].sort()).toEqual(["src/a.ts", "src/b.ts", "src/d.ts"]);
      expect(read.schemaWarning).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("codebase-atlas sensors judge a knowledge base", () => {
  let project = "";
  let codekb = "";

  beforeAll(() => {
    ({ project, codekb } = fixture());
  });

  afterAll(() => {
    if (project) rmSync(project, { recursive: true, force: true });
  });

  test("atlas-citations reports citations that do not resolve", () => {
    const r = runCitations(join(codekb, "architecture.md"), project);
    expect(r.pass).toBe(false);
    expect(r.findings.map((f) => f.message)).toEqual([
      "cites src/orders/service.ts:40, but the file has 3 lines",
      "cites src/orders/gone.ts:1, but there is no such file in the repository",
    ]);
    expect(r.checked).toEqual(["architecture.md: 3 of 5 citations resolve; 1 UNKNOWN"]);
  });

  test("atlas-citations warns when an evidence artifact cites nothing, and skips the timestamp", () => {
    writeFileSync(join(codekb, "dependencies.md"), "# Dependencies\n\nExpress.\n");
    writeFileSync(join(codekb, "reverse-engineering-timestamp.md"), "Commit: abc:12\n");
    const r = runCitations(join(codekb, "dependencies.md"), project);
    expect(r.pass).toBe(true);
    expect(r.warnings[0]).toContain("cites no path:line");
    expect(runCitations(join(codekb, "reverse-engineering-timestamp.md"), project).checked).toEqual([]);
  });

  test("atlas-coverage lists the source files no component owns", () => {
    const r = runCoverage(join(codekb, "component-inventory.md"), project);
    expect(r.pass).toBe(false);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].message).toContain("1 of 4 source files graphify counted belong to no component");
    expect(r.findings[0].message).toContain("src/legacy/old.ts");
    expect(r.checked).toEqual(["coverage: 2 in components, 1 outside components, 1 unassigned, of 4 source files graphify counted"]);
    expect(r.warnings.some((w) => w.includes('"." under Shared'))).toBe(true);
  });

  test("atlas-coverage passes once every file is assigned", () => {
    const inv = join(codekb, "component-inventory.md");
    const before = readFileSync(inv, "utf-8");
    try {
      writeFileSync(inv, before.replace("## Outside Components", "### Legacy\n- **Paths**: `src/legacy/`\n\n## Outside Components"));
      expect(runCoverage(inv, project).pass).toBe(true);
    } finally {
      writeFileSync(inv, before);
    }
  });

  test("atlas-coverage without a graph reports the check as not run and passes", () => {
    const graphDir = join(project, "aidlc", "codebase-atlas");
    const moved = join(project, "graph-moved");
    cpSync(graphDir, moved, { recursive: true });
    rmSync(graphDir, { recursive: true, force: true });
    try {
      const r = runCoverage(join(codekb, "component-inventory.md"), project);
      expect(r.pass).toBe(true);
      expect(r.not_checked[0]).toContain("aidlc atlas-graph build --repo app");
    } finally {
      cpSync(moved, graphDir, { recursive: true });
    }
  });

  test("aidlc atlas-graph check runs both checks over a folder and exits 1 on findings", () => {
    const result = spawnSync(process.execPath, [join(PLUGIN_ROOT, "tools", "atlas-graph.ts"), "check", "--repo", "app", "--json"], {
      timeout: remainingOperationTimeoutMs(NATIVE_STARTUP_TIMEOUT_MS),
      encoding: "utf-8",
      env: { ...process.env, AIDLC_PROJECT_DIR: project },
    });
    expect(result.status, result.stderr).toBe(1);
    const out = JSON.parse(result.stdout) as { pass: boolean; codekb: string; results: Array<{ check: string }> };
    expect(out.pass).toBe(false);
    expect(out.codekb).toBe("aidlc/spaces/default/codekb/app");
    expect(out.results.map((r) => r.check)).toContain("coverage");
  });
});

describe("codebase-atlas plugin composed into a Claude install", () => {
  let tmp = "";
  let project = "";

  beforeAll(() => {
    if (!existsSync(PLUGIN_DIST)) throw new Error(`run bun scripts/package.ts first: ${PLUGIN_DIST} is missing`);
    tmp = mkdtempSync(join(tmpdir(), "aidlc-atlas-compose-"));
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
    if (compose.status !== 0) throw new Error(`codebase-atlas compose failed: ${compose.stderr ?? compose.stdout}`);
  });

  afterAll(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });

  test("the sensors, their scripts, the command and the knowledge land in the install", () => {
    const claude = join(project, ".claude");
    expect(existsSync(join(claude, "sensors", "aidlc-atlas-citations.md"))).toBe(true);
    expect(existsSync(join(claude, "sensors", "aidlc-atlas-coverage.md"))).toBe(true);
    for (const tool of [...SENSOR_TOOLS, "atlas-lib.ts", "atlas-graph.ts"]) {
      expect(existsSync(join(claude, "tools", tool))).toBe(true);
    }
    expect(existsSync(join(claude, "knowledge", "aidlc-developer-agent", "atlas-evidence-guide.md"))).toBe(true);
  });

  test("the stage graph binds both sensors to Reverse Engineering", () => {
    const graph = JSON.parse(
      readFileSync(join(project, ".claude", "tools", "data", "stage-graph.json"), "utf-8"),
    ) as Array<{ slug: string; sensors?: string[] }> | { stages?: Array<{ slug: string; sensors?: string[] }> };
    const stages = Array.isArray(graph) ? graph : (graph.stages ?? []);
    const sensors = stages.find((s) => s.slug === "reverse-engineering")?.sensors ?? [];
    expect(sensors).toEqual(expect.arrayContaining(["atlas-citations", "atlas-coverage"]));
  });

  test("every codebase-atlas step lands in Reverse Engineering before its Completion Handoff", () => {
    const stagesDir = join(project, ".claude", "aidlc-common", "stages");
    const composed = walkMarkdownFiles(stagesDir).filter((file) => readFileSync(file, "utf-8").includes("(codebase-atlas):"));
    expect(composed.map((f) => f.slice(stagesDir.length + 1).replace(/\\/g, "/"))).toEqual(["inception/reverse-engineering.md"]);
    const text = readFileSync(composed[0], "utf-8").replace(/\r\n/g, "\n");
    const handoff = text.search(/^### Step \d+: Completion Handoff\b/m);
    const steps = [...text.matchAll(/^### Step[^\n]*\(codebase-atlas\):[^\n]*$/gm)];
    expect(steps.map((s) => s[0].replace(/:.*$/, ""))).toEqual(["### Step 1a (codebase-atlas)", "### Step 2a (codebase-atlas)", "### Step 3a (codebase-atlas)"]);
    for (const step of steps) expect(step.index ?? 0).toBeLessThan(handoff);
    expect(text).not.toContain("{{INVOKE}}");
  });
});
