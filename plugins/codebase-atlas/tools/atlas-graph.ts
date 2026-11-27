// atlas-graph.ts — `aidlc atlas-graph` (codebase-atlas plugin).
//
//   build  Count the repository's source with graphify (tree-sitter AST, no LLM)
//          and write the graph under aidlc/codebase-atlas/graph/<repo>/.
//   check  Run the citation and coverage checks over a code knowledge base
//          folder (the staged candidate before publishing, or the published one).
//
// The graph is the second, deterministic count of the source; the knowledge
// base's component-inventory.md stays the record of what the code is.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import {
  BUILD_INFO,
  type CheckResult,
  checkCitations,
  checkCoverage,
  GRAPHIFY_TESTED_REF,
  gitHead,
  graphDirFor,
  graphJsonPath,
  markdownFiles,
  publishedCodekbDirs,
  readGraphFiles,
  sourceRootFor,
  toPosix,
} from "./atlas-lib.ts";

const USAGE = `Usage:
  aidlc atlas-graph build [--repo <repo>] [--graphify <command>] [--no-report]
      Counts the repository's source files with graphify and writes
      aidlc/codebase-atlas/graph/<repo>/ (graph.json, build-info.json).
      <repo> is the name the code knowledge base uses (engine workspace codekb
      --repo <repo>); without it, the project folder's name.
  aidlc atlas-graph check [--repo <repo>] [--codekb <folder>] [--json]
      Checks a code knowledge base folder: every path:line citation resolves,
      and every source file graphify counted belongs to a component.
      Exit 0 when both pass, 1 with findings, 2 on a usage error.

Install graphify (Python 3.11+), at the commit this plugin was tested with:
  uv tool install git+https://github.com/sun-flat-yamada/graphify@${GRAPHIFY_TESTED_REF}
`;

interface Flags {
  repo?: string;
  codekb?: string;
  graphify?: string;
  json: boolean;
  noReport: boolean;
}

function parse(argv: string[]): { cmd: string | undefined; flags: Flags } {
  const flags: Flags = { json: false, noReport: false };
  let cmd: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--repo") flags.repo = argv[++i];
    else if (a === "--codekb") flags.codekb = argv[++i];
    else if (a === "--graphify") flags.graphify = argv[++i];
    else if (a === "--json") flags.json = true;
    else if (a === "--no-report") flags.noReport = true;
    else if (a === "--help" || a === "-h") cmd = "help";
    else if (cmd === undefined) cmd = a;
    else throw new UsageError(`unknown argument: ${a}`);
  }
  return { cmd, flags };
}

class UsageError extends Error {}

// graphify names its communities with an LLM when it finds a backend (an API
// key, or the claude CLI). The count must stay local and deterministic, so
// every run turns the naming off.
const GRAPHIFY_ENV = { ...process.env, GRAPHIFY_BACKEND: "none" };

function graphifyCommand(explicit: string | undefined): string[] {
  const value = explicit ?? process.env.GRAPHIFY_CMD ?? "graphify";
  return value.split(/\s+/).filter(Boolean);
}

// Uncommitted state of the source, leaving out AI-DLC's own workspace (the
// graph is written there): the parse must not change the project.
function sourceState(root: string): string | null {
  const r = spawnSync("git", ["-C", root, "status", "--porcelain", "--untracked-files=all"], { encoding: "utf-8" });
  if (r.status !== 0) return null;
  return r.stdout
    .split("\n")
    .filter((l) => l.trim() !== "" && !/^.. "?aidlc\//.test(l))
    .join("\n");
}

function build(projectDir: string, flags: Flags): number {
  const repo = flags.repo ?? basename(resolve(projectDir));
  const source = sourceRootFor(projectDir, repo);
  const out = graphDirFor(projectDir, repo);
  mkdirSync(out, { recursive: true });
  const graphify = graphifyCommand(flags.graphify);
  const before = sourceState(source);
  const extract = [...graphify, "extract", source, "--code-only", "--out", out];
  process.stdout.write(`$ ${extract.join(" ")}\n`);
  const r = spawnSync(extract[0], extract.slice(1), { stdio: "inherit", env: GRAPHIFY_ENV });
  if (r.error || r.status !== 0) {
    process.stderr.write(
      r.error
        ? `atlas-graph: cannot run "${graphify.join(" ")}" (${r.error.message}).\n${USAGE}`
        : `atlas-graph: graphify extract exited ${r.status}\n`,
    );
    return 2;
  }
  if (!flags.noReport) {
    const report = [...graphify, "cluster-only", out];
    process.stdout.write(`$ ${report.join(" ")}\n`);
    spawnSync(report[0], report.slice(1), { stdio: "inherit", cwd: out, env: GRAPHIFY_ENV });
  }
  const after = sourceState(source);
  if (before !== after) {
    process.stderr.write("atlas-graph: the source's git status changed while graphify ran; the parse must not change the project\n");
    return 2;
  }
  const version = spawnSync(graphify[0], [...graphify.slice(1), "--version"], { encoding: "utf-8", env: GRAPHIFY_ENV });
  const files = readGraphFiles(graphJsonPath(out), source).files;
  const info = {
    tool: "graphify",
    graphify_version: (version.stdout ?? "").trim(),
    tested_ref: GRAPHIFY_TESTED_REF,
    mode: "code-only",
    repo,
    source_path: toPosix(relative(projectDir, source)) || ".",
    source_commit: gitHead(source) ?? "",
    source_dirty: after === null ? null : after !== "",
    source_files: files.size,
    built_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  };
  writeFileSync(join(out, BUILD_INFO), `${JSON.stringify(info, null, 2)}\n`);
  process.stdout.write(`wrote ${toPosix(relative(projectDir, out))}/ (${files.size} source files)\n`);
  if (info.source_dirty) process.stderr.write("atlas-graph: the source has uncommitted changes; the graph is of the working tree, not of a commit\n");
  return 0;
}

function check(projectDir: string, flags: Flags): number {
  let dir = flags.codekb;
  let repo = flags.repo;
  if (dir === undefined) {
    repo ??= basename(resolve(projectDir));
    const found = publishedCodekbDirs(projectDir, repo);
    if (found.length !== 1) {
      throw new UsageError(
        found.length === 0
          ? `no published code knowledge base for "${repo}"; pass --codekb <folder>`
          : `more than one space has a knowledge base for "${repo}"; pass --codekb <folder>`,
      );
    }
    dir = found[0];
  }
  dir = resolve(projectDir, dir);
  if (!existsSync(dir)) throw new UsageError(`no such folder: ${dir}`);
  repo ??= basename(dir).replace(/^codekb-stage-/, "");
  const results: Array<{ check: string; result: CheckResult }> = [];
  for (const file of markdownFiles(dir)) results.push({ check: `citations ${basename(file)}`, result: checkCitations(file, projectDir, repo) });
  const inventory = join(dir, "component-inventory.md");
  if (existsSync(inventory)) results.push({ check: "coverage", result: checkCoverage(inventory, projectDir, repo) });
  const pass = results.every((r) => r.result.pass);
  if (flags.json) {
    process.stdout.write(`${JSON.stringify({ pass, repo, codekb: toPosix(relative(projectDir, dir)), results }, null, 2)}\n`);
  } else {
    for (const { result } of results) {
      for (const line of result.checked) process.stdout.write(`  ${line}\n`);
      for (const f of result.findings) process.stdout.write(`FAIL ${f.where}: ${f.message}\n`);
      for (const w of result.warnings) process.stdout.write(`WARN ${w}\n`);
      for (const n of result.not_checked) process.stdout.write(`SKIP ${n}\n`);
    }
    process.stdout.write(pass ? "atlas-graph check: pass\n" : "atlas-graph check: findings above\n");
  }
  return pass ? 0 : 1;
}

export function main(argv: string[]): number {
  const projectDir = process.env.AIDLC_PROJECT_DIR ?? process.cwd();
  try {
    const { cmd, flags } = parse(argv);
    if (cmd === "build") return build(projectDir, flags);
    if (cmd === "check") return check(projectDir, flags);
    process.stdout.write(USAGE);
    return cmd === "help" ? 0 : 2;
  } catch (e) {
    if (e instanceof UsageError) {
      process.stderr.write(`atlas-graph: ${e.message}\n`);
      return 2;
    }
    throw e;
  }
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
