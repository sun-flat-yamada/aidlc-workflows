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
import { deflateRawSync } from "node:zlib";
import { checkBindings, extractBindingsYaml, parseYaml } from "../tools/angular-bindings-lib.ts";
import { hashCases, parseCsv, parseMarkdownTables, parseSheets } from "../tools/angular-cases-lib.ts";
import { readXlsx } from "../tools/angular-xlsx.ts";
import { run as runBindingsSensor } from "../tools/aidlc-sensor-angular-ui-bindings.ts";

setDefaultTimeout(NATIVE_FIXTURE_SETUP_TIMEOUT_MS);

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(HERE, "..");
const REPO_ROOT = join(PLUGIN_ROOT, "..", "..");
const CLAUDE_DIST = join(REPO_ROOT, "dist", "claude", ".claude");
const MEMORY_DIST = join(REPO_ROOT, "dist", "claude", "aidlc");
const PLUGIN_DIST = join(REPO_ROOT, "dist", "plugins", "angular", "claude");

const SENSOR_TOOLS = [
  "aidlc-sensor-angular-test-integrity.ts",
  "aidlc-sensor-angular-acceptance-gate.ts",
  "aidlc-sensor-angular-ui-bindings.ts",
];

// A minimal .xlsx: deflated ZIP entries (CRC left 0; the reader does not check it).
function zip(entries: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const nameBuf = Buffer.from(name, "utf-8");
    const data = deflateRawSync(Buffer.from(text, "utf-8"));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(Buffer.byteLength(text), 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(Buffer.byteLength(text), 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(entries).length, 8);
  eocd.writeUInt16LE(Object.keys(entries).length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

const SAMPLE_XLSX = () =>
  zip({
    "xl/workbook.xml":
      '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Cases" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":
      '<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/sharedStrings.xml":
      '<sst><si><t>テストID</t></si><si><t>大項目</t></si><si><r><t>操作</t></r><r><t>手順</t></r><rPh sb="0" eb="2"><t>ソウサ</t></rPh></si>' +
      '<si><t>期待画面表示</t></si><si><t>期待APIリクエスト</t></si><si><t>保存</t></si>' +
      '<si><t xml:space="preserve">1. @ip-address に 192.168.0.20 を入力\n2. @save-button を押す</t></si>' +
      '<si><t>@status-message に「保存しました」</t></si><si><t>PUT /api/v1/network/ipv4 {"address":"192.168.0.20"}</t></si></sst>',
    "xl/worksheets/sheet1.xml":
      '<worksheet><sheetData>' +
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c></row>' +
      '<row r="2"><c r="A2" t="inlineStr"><is><t>ST-1</t></is></c><c r="B2" t="s"><v>5</v></c><c r="C2" t="s"><v>6</v></c><c r="D2" t="s"><v>7</v></c><c r="E2" t="s"><v>8</v></c></row>' +
      '<row r="3"><c r="A3" t="str"><f>"ST-"&amp;2</f><v>ST-2</v></c><c r="C3" t="inlineStr"><is><t>1. @save-button を押す</t></is></c><c r="D3" t="inlineStr"><is><t>@status-message に「失敗しました」</t></is></c></row>' +
      '</sheetData><mergeCells count="1"><mergeCell ref="B2:B3"/></mergeCells></worksheet>',
  });

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

describe("angular-cases reads xlsx, CSV and Markdown alike", () => {
  test("reads shared, rich, phonetic, inline, formula and merged cells", () => {
    const [sheet] = readXlsx(SAMPLE_XLSX());
    expect(sheet.name).toBe("Cases");
    expect(sheet.rows[0]).toEqual(["テストID", "大項目", "操作手順", "期待画面表示", "期待APIリクエスト"]);
    expect(sheet.rows[2][0]).toBe("ST-2");
    expect(sheet.rows[2][1]).toBe("保存");
  });

  test("parses cases with Japanese headers, steps, expectations and ui refs", () => {
    const { cases, warnings } = parseSheets(readXlsx(SAMPLE_XLSX()));
    expect(warnings).toEqual([]);
    expect(cases.map((c) => c.id)).toEqual(["ST-1", "ST-2"]);
    expect(cases[0].steps).toEqual([
      { no: 1, action: "@ip-address に 192.168.0.20 を入力" },
      { no: 2, action: "@save-button を押す" },
    ]);
    expect(cases[0].expectedApi[0]).toMatchObject({ method: "PUT", path: "/api/v1/network/ipv4", body: { address: "192.168.0.20" } });
    expect(cases[0].uiRefs).toEqual(["ip-address", "save-button", "status-message"]);
    expect(cases[1].category).toBe("保存");
  });

  test("a CSV and a Markdown table with the same cells give the same cases", () => {
    const strip = (cs: ReturnType<typeof parseSheets>["cases"]) => cs.map(({ sheet: _s, ...rest }) => rest);
    const fromXlsx = strip(parseSheets(readXlsx(SAMPLE_XLSX())).cases);
    const csv = 'テストID,大項目,操作手順,期待画面表示,期待APIリクエスト\nST-1,保存,"1. @ip-address に 192.168.0.20 を入力\n2. @save-button を押す",@status-message に「保存しました」,"PUT /api/v1/network/ipv4 {""address"":""192.168.0.20""}"\nST-2,,1. @save-button を押す,@status-message に「失敗しました」,\n';
    expect(strip(parseSheets([parseCsv(csv)]).cases)).toEqual(fromXlsx);
    const md = [
      "| テストID | 大項目 | 操作手順 | 期待画面表示 | 期待APIリクエスト |",
      "| --- | --- | --- | --- | --- |",
      '| ST-1 | 保存 | 1. @ip-address に 192.168.0.20 を入力<br>2. @save-button を押す | @status-message に「保存しました」 | PUT /api/v1/network/ipv4 {"address":"192.168.0.20"} |',
      "| ST-2 | | 1. @save-button を押す | @status-message に「失敗しました」 | |",
    ].join("\n");
    expect(strip(parseSheets([parseMarkdownTables(md)]).cases)).toEqual(fromXlsx);
  });

  test("the command writes the case file with source and case hashes, and the gate checks them", () => {
    const project = mkdtempSync(join(tmpdir(), "aidlc-angular-cases-"));
    try {
      writeFileSync(join(project, "cases.xlsx"), SAMPLE_XLSX());
      const out = join(project, "intents", "i1", "construction", "build-and-test");
      const env = { ...process.env, AIDLC_PROJECT_DIR: project };
      const opts = { timeout: remainingOperationTimeoutMs(NATIVE_STARTUP_TIMEOUT_MS), encoding: "utf-8" as const, env };
      const conv = spawnSync(process.execPath, [join(PLUGIN_ROOT, "tools", "angular-cases.ts"), "cases.xlsx", "--out", out], opts);
      expect(conv.status, conv.stdout + conv.stderr).toBe(0);
      const file = JSON.parse(readFileSync(join(out, "angular-acceptance-cases.json"), "utf-8"));
      expect(file.cases).toHaveLength(2);
      expect(file.casesSha256).toBe(hashCases(file.cases));
      expect(file.sources[0].file).toBe("cases.xlsx");
      expect(existsSync(join(out, "angular-acceptance-cases.md"))).toBe(true);

      const summary = join(out, "build-and-test-summary.md");
      writeFileSync(summary, "# summary\n");
      writeFileSync(
        join(out, "angular-acceptance-results.json"),
        JSON.stringify({ tests: [{ title: "[ST-1] a", status: "passed" }, { title: "[ST-2] b", status: "passed" }] }),
      );
      const gate = () =>
        JSON.parse(
          spawnSync(process.execPath, [join(PLUGIN_ROOT, "tools", "aidlc-sensor-angular-acceptance-gate.ts"), "--output-path", summary], opts).stdout,
        );
      expect(gate()).toMatchObject({ pass: true, cases: 2, passed: 2 });

      // A UI Bindings table that lacks one of the cases' ui-ids.
      const fd = join(project, "intents", "i1", "construction", "u1", "functional-design");
      mkdirSync(fd, { recursive: true });
      writeFileSync(
        join(fd, "frontend-components.md"),
        "## UI Bindings\n\n```yaml\nscreens:\n  net:\n    route: /net\n    states: [editing]\n    initial: editing\n    elements:\n      ip-address: { kind: input, bind: body.address }\n      save-button: { kind: button, on: { press: { transition: editing } } }\n```\n",
      );
      const unknownRef = gate();
      expect(unknownRef.pass).toBe(false);
      expect(JSON.stringify(unknownRef.findings)).toContain("@status-message is not a ui-id");

      rmSync(join(fd, "frontend-components.md"));
      file.cases[0].expectedUi = ["anything"];
      writeFileSync(join(out, "angular-acceptance-cases.json"), JSON.stringify(file));
      expect(JSON.stringify(gate().findings)).toContain("cases edited after conversion");

      file.casesSha256 = hashCases(file.cases);
      writeFileSync(join(out, "angular-acceptance-cases.json"), JSON.stringify(file));
      writeFileSync(join(project, "cases.xlsx"), "changed");
      expect(JSON.stringify(gate().findings)).toContain("changed since it was converted");
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test("refuses a file that is not an xlsx, CSV or Markdown table", () => {
    const project = mkdtempSync(join(tmpdir(), "aidlc-angular-cases-bad-"));
    try {
      writeFileSync(join(project, "cases.xlsx"), "not a zip");
      const r = spawnSync(process.execPath, [join(PLUGIN_ROOT, "tools", "angular-cases.ts"), "cases.xlsx"], {
        timeout: remainingOperationTimeoutMs(NATIVE_STARTUP_TIMEOUT_MS),
        encoding: "utf-8",
        env: { ...process.env, AIDLC_PROJECT_DIR: project },
      });
      expect(r.status).toBe(1);
      expect(r.stdout).toContain("not a ZIP file");
      expect(existsSync(join(project, "angular-acceptance-cases.json"))).toBe(false);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });
});

describe("angular-ui-bindings checks the table in levels", () => {
  const TABLE = [
    "screens:",
    "  net:",
    "    route: /settings/net",
    "    design: mockups/net.html",
    "    states: [loading, editing, saving]",
    "    initial: loading",
    "    onEnter: { call: getNet, success: { transition: editing }, errors: { default: { transition: editing } } }",
    "    static: [net-page]",
    "    elements:",
    "      address: { kind: input, bind: body.address }",
    "      link: { kind: indicator, source: { call: getNet, poll: 5s, path: $.link } }",
    "      save: { kind: button, on: { press: { call: putNet, request: { address: form.address }, transition: saving, success: { transition: editing }, errors: { validation: { transition: editing }, default: { transition: editing } } } } }",
  ].join("\n");
  const OPENAPI = [
    "openapi: 3.0.3",
    "paths:",
    "  /net:",
    "    get:",
    "      operationId: getNet",
    "      responses:",
    "        '200': { content: { application/json: { schema: { $ref: '#/components/schemas/Net' } } } }",
    "    put:",
    "      operationId: putNet",
    "      requestBody: { content: { application/json: { schema: { $ref: '#/components/schemas/Net' } } } }",
    "      responses: { '200': { description: ok }, '400': { description: bad } }",
    "components:",
    "  schemas:",
    "    Net: { type: object, required: [address], properties: { address: { type: string }, link: { type: string } } }",
  ].join("\n");
  let project = "";
  let record = "";
  let fd = "";

  beforeAll(() => {
    project = mkdtempSync(join(tmpdir(), "aidlc-angular-bindings-"));
    record = join(project, "aidlc", "spaces", "default", "intents", "i1");
    fd = join(record, "construction", "u1", "functional-design");
    mkdirSync(fd, { recursive: true });
    mkdirSync(join(record, "inception", "contract-design"), { recursive: true });
    mkdirSync(join(project, "mockups"), { recursive: true });
    writeFileSync(join(record, "inception", "contract-design", "contract-summary.md"), `# Contracts\n\n\`\`\`yaml\n${OPENAPI}\n\`\`\`\n`);
    writeFileSync(join(project, "mockups", "net.html"), '<main data-ui-id="net-page"><input data-ui-id="address"><span data-ui-id="link"></span><button data-ui-id="save"></button></main>');
    writeFileSync(join(fd, "functional-spec.md"), "# spec\n");
  });

  afterAll(() => {
    if (project) rmSync(project, { recursive: true, force: true });
  });

  const check = (yaml: string) =>
    checkBindings(parseYaml(yaml), { projectDir: project, bindingsFile: join(fd, "frontend-components.md"), recordDir: record }).result;

  test("a consistent table passes all three levels, using the OpenAPI block of contract-summary.md", () => {
    const r = check(TABLE);
    expect(r.findings).toEqual([]);
    expect(r.checked).toEqual(["table", "contract", "design of net"]);
  });

  test("reports bad states, unknown operations and fields, missing ui-ids and stray mock-up ids", () => {
    const bad = TABLE.replace("initial: loading", "initial: nowhere")
      .replace("call: putNet", "call: putNets")
      .replace("path: $.link", "path: $.speed")
      .replace("address: { kind: input", "addr: { kind: input");
    const messages = check(bad).findings.map((f) => f.message).join("\n");
    expect(messages).toContain('"nowhere" is not in states');
    expect(messages).toContain('operationId "putNets" is not in the contract');
    expect(messages).toContain("$.speed is not in the getNet response");
    expect(messages).toContain('data-ui-id="address" is neither bound');
    expect(messages).toContain('no data-ui-id="addr"');
  });

  test("a missing counterpart is not checked, not failed", () => {
    const r = checkBindings(parseYaml(TABLE.replace("    design: mockups/net.html\n", "")), {
      projectDir: project,
      bindingsFile: join(fd, "frontend-components.md"),
      recordDir: null,
    }).result;
    expect(r.pass).toBe(true);
    expect(r.not_checked.join(" ")).toContain("contract");
    expect(r.not_checked.join(" ")).toContain("design of net");
  });

  test("the sensor passes a Unit without the table and checks one with it", () => {
    expect(runBindingsSensor(join(fd, "functional-spec.md"), project).pass).toBe(true);
    writeFileSync(join(fd, "frontend-components.md"), `# Components\n\n## UI Bindings\n\n\`\`\`yaml\n${TABLE.replace("initial: loading", "initial: gone")}\n\`\`\`\n\n## Other\n`);
    expect(extractBindingsYaml(readFileSync(join(fd, "frontend-components.md"), "utf-8"))).toContain("screens:");
    const r = runBindingsSensor(join(fd, "functional-spec.md"), project);
    expect(r.pass).toBe(false);
    expect(runBindingsSensor(join(fd, "rules.md"), project).pass).toBe(true);
  });

  test("at Code Generation, every ui-id of the table must be in a template", () => {
    writeFileSync(join(fd, "frontend-components.md"), `## UI Bindings\n\n\`\`\`yaml\n${TABLE}\n\`\`\`\n`);
    mkdirSync(join(project, "src", "app"), { recursive: true });
    writeFileSync(join(project, "src", "app", "net-page.html"), '<main data-ui-id="net-page"><input data-ui-id="address"><span data-ui-id="link"></span><i data-ui-id="extra"></i></main>');
    writeFileSync(join(project, "src", "app", "net-page.ts"), '@Component({ template: `<app-panel-button uiId="sav" />` }) export class P {}');
    const cg = join(record, "construction", "u1", "code-generation");
    mkdirSync(cg, { recursive: true });
    writeFileSync(join(cg, "code-summary.md"), "# summary\n");
    const r = runBindingsSensor(join(cg, "code-summary.md"), project);
    expect(r.findings.map((f) => f.message)).toEqual(['no template carries data-ui-id="save"']);
    expect(r.warnings.map((f) => f.message).sort()).toEqual(['data-ui-id="extra" is in no UI Bindings table', 'data-ui-id="sav" is in no UI Bindings table']);
    writeFileSync(join(project, "src", "app", "net-page.ts"), '@Component({ template: `<app-panel-button uiId="save" />` }) export class P {}');
    expect(runBindingsSensor(join(cg, "code-summary.md"), project).pass).toBe(true);
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
    expect(existsSync(join(claude, "sensors", "aidlc-angular-ui-bindings.md"))).toBe(true);
    for (const helper of ["angular-bindings-lib.ts", "angular-cases-lib.ts", "angular-xlsx.ts", "angular-cases.ts", "angular-bindings-check.ts"]) {
      expect(existsSync(join(claude, "tools", helper))).toBe(true);
    }
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
    expect(sensorsOf("code-generation")).toEqual(expect.arrayContaining(["angular-test-integrity", "angular-ui-bindings"]));
    expect(sensorsOf("functional-design")).toContain("angular-ui-bindings");
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
