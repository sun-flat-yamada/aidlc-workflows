// atlas-lib.ts — shared logic of the codebase-atlas plugin.
//
// Two checks over a repository's code knowledge base (the nine Reverse
// Engineering artifacts):
//   - citations: every `path:line` the artifacts cite names a file of the
//     repository and a line that file has;
//   - coverage: every source file a deterministic parser (graphify) counted
//     belongs to a component of component-inventory.md (its `**Paths**:` line)
//     or to its "Outside Components" section.
// Self-contained: a plugin tool ships in its own delta and must not import a
// core tool, so the few facts it needs about an AI-DLC workspace (where a
// repository's source is, which folders AI-DLC itself owns) are restated here.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

// The graphify commit this plugin was tested with (the same pin as Codebase
// Atlas's GRAPHIFY_TESTED_REF): another version may count files differently.
export const GRAPHIFY_TESTED_REF = "14f35e381cab8d0ae10824a336114a907c288146";
export const SUPPORTED_SCHEMA_VERSIONS = new Set([1]);
export const GRAPH_ROOT = join("aidlc", "codebase-atlas", "graph");
export const BUILD_INFO = "build-info.json";

export interface Finding {
  level: "error";
  where: string;
  message: string;
}

export interface CheckResult {
  pass: boolean;
  findings_count: number;
  findings: Finding[];
  warnings: string[];
  checked: string[];
  not_checked: string[];
}

export function result(findings: Finding[], warnings: string[], checked: string[], notChecked: string[]): CheckResult {
  return {
    pass: findings.length === 0,
    findings_count: findings.length,
    findings,
    warnings,
    checked,
    not_checked: notChecked,
  };
}

export const passThrough = (): CheckResult => result([], [], [], []);

export function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

export function normalizeRel(p: string): string {
  let out = toPosix(p.trim().replace(/^`+|`+$/g, "").trim());
  while (out.startsWith("./")) out = out.slice(2);
  return out === "" && p.trim() !== "" ? "." : out;
}

// --- Where things are ---

// The folder a repository's knowledge base describes: a registered repository
// is the folder of that name under the project, otherwise the project root is
// the one repository (core's codekbSourceRoot, restated).
export function sourceRootFor(projectDir: string, repo: string): string {
  if (repo !== "") {
    const sibling = join(projectDir, repo);
    try {
      if (statSync(sibling).isDirectory()) return sibling;
    } catch {
      /* not a folder: the project root is the repository */
    }
  }
  return projectDir;
}

export function graphDirFor(projectDir: string, repo: string): string {
  return join(projectDir, GRAPH_ROOT, repo);
}

// AI-DLC's own install and workspace are not the project's code (the Reverse
// Engineering stage tells the scan to leave them out); graphify counts the
// install's TypeScript tools, so the coverage check drops them.
const AIDLC_DIRS = [".claude/", ".kiro/", ".codex/", ".cursor/", ".opencode/", ".aidlc/", "aidlc/"];
export function isAidlcOwned(rel: string): boolean {
  if (AIDLC_DIRS.some((d) => rel.startsWith(d))) return true;
  if (rel.startsWith(".github/") || rel.startsWith(".agents/")) {
    return rel.split("/").some((seg) => seg.startsWith("aidlc"));
  }
  return false;
}

// --- graph.json ---

export interface GraphFiles {
  files: Set<string>;
  schemaWarning: string | null;
}

interface GraphNode {
  source_file?: unknown;
  file_type?: unknown;
}

export function graphJsonPath(graphDir: string): string {
  const nested = join(graphDir, "graphify-out", "graph.json");
  if (existsSync(nested)) return nested;
  return join(graphDir, "graph.json");
}

// The source files graphify counted, relative to the source root. A node is a
// code node when its file_type is "code" (the default) and it names a file.
export function readGraphFiles(graphPath: string, sourceRoot: string): GraphFiles {
  const data = JSON.parse(readFileSync(graphPath, "utf-8")) as {
    nodes?: unknown;
    graph?: { schema_version?: unknown };
  };
  if (!data || !Array.isArray(data.nodes)) throw new Error(`${graphPath} has no "nodes" list`);
  const version = data.graph?.schema_version;
  const schemaWarning =
    version !== undefined && !SUPPORTED_SCHEMA_VERSIONS.has(Number(version))
      ? `graph.json schema_version ${String(version)} is not the one this plugin was tested with (${[...SUPPORTED_SCHEMA_VERSIONS].join(", ")}); install graphify at ${GRAPHIFY_TESTED_REF}`
      : null;
  const files = new Set<string>();
  const root = toPosix(resolve(sourceRoot));
  for (const raw of data.nodes as GraphNode[]) {
    if (!raw || typeof raw.source_file !== "string" || raw.source_file === "") continue;
    if ((raw.file_type ?? "code") !== "code") continue;
    let file = toPosix(raw.source_file);
    if (isAbsolute(file) || /^[A-Za-z]:\//.test(file)) {
      const rel = toPosix(relative(root, file));
      if (rel.startsWith("../") || isAbsolute(rel)) continue;
      file = rel;
    }
    file = normalizeRel(file);
    if (file !== "") files.add(file);
  }
  return { files, schemaWarning };
}

// --- component-inventory.md ---

export interface Inventory {
  // component heading → the paths its `**Paths**:` lines name
  components: Map<string, string[]>;
  // paths listed under the "Outside Components" section
  outside: string[];
  // root-wide paths that were not counted as coverage
  broad: Array<{ owner: string; path: string }>;
}

const PATHS_LINE = /^\s*[-*]?\s*\*\*Paths?\*\*\s*:\s*(.*)$/i;
const ROOT_PATTERNS = new Set([".", "./", "*", "**", "**/*", "/"]);

export function splitPaths(cell: string): string[] {
  const ticked = [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  const parts = ticked.length > 0 ? ticked : cell.split(/\s*(?:<br\s*\/?>|,|、|;|；)\s*/);
  return parts
    .map((p) => normalizeRel(p.replace(/\s+[—–-]\s+.*$/, "").replace(/:L?\d+(?:-L?\d+)?$/, "")))
    .filter((p) => p !== "" && !/^(none|n\/a|-)$/i.test(p));
}

export function parseInventory(text: string): Inventory {
  const components = new Map<string, string[]>();
  const outside: string[] = [];
  const broad: Array<{ owner: string; path: string }> = [];
  let heading = "";
  let inOutside = false;
  let fence = false;
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    const h = /^(#{2,4})\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) {
      const title = h[2].trim();
      if (h[1] === "##") inOutside = /outside components/i.test(title);
      if (!inOutside || h[1] !== "##") heading = title;
      continue;
    }
    const m = PATHS_LINE.exec(line);
    if (!m) continue;
    for (const path of splitPaths(m[1])) {
      if (ROOT_PATTERNS.has(path)) {
        broad.push({ owner: inOutside ? "Outside Components" : heading || "(no heading)", path });
        continue;
      }
      if (inOutside) {
        outside.push(path);
        continue;
      }
      const key = heading || "(no heading)";
      const list = components.get(key) ?? [];
      list.push(path);
      components.set(key, list);
    }
  }
  return { components, outside, broad };
}

function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i++;
        if (glob[i + 1] === "/") i++;
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "i");
}

export function pathMatches(file: string, pattern: string): boolean {
  const p = normalizeRel(pattern);
  if (/[*?]/.test(p)) return globToRegExp(p).test(file);
  const dir = p.endsWith("/") ? p : `${p}/`;
  return file.toLowerCase() === p.replace(/\/$/, "").toLowerCase() || file.toLowerCase().startsWith(dir.toLowerCase());
}

// --- coverage ---

export interface CoverageReport {
  total: number;
  covered: number;
  outside: number;
  uncovered: string[];
  unusedPaths: string[];
}

export function coverage(files: Iterable<string>, inv: Inventory): CoverageReport {
  const owned: string[] = [];
  for (const paths of inv.components.values()) owned.push(...paths);
  const used = new Set<string>();
  let total = 0;
  let covered = 0;
  let outside = 0;
  const uncovered: string[] = [];
  for (const file of [...files].sort()) {
    if (isAidlcOwned(file)) continue;
    total++;
    const hit = owned.find((p) => pathMatches(file, p));
    if (hit) {
      covered++;
      used.add(hit);
      continue;
    }
    const out = inv.outside.find((p) => pathMatches(file, p));
    if (out) {
      outside++;
      used.add(out);
      continue;
    }
    uncovered.push(file);
  }
  const unusedPaths = [...owned, ...inv.outside].filter((p) => !used.has(p));
  return { total, covered, outside, uncovered, unusedPaths };
}

export function checkCoverage(
  inventoryPath: string,
  projectDir: string,
  repo: string,
  limit = 50,
): CheckResult {
  const graphDir = graphDirFor(projectDir, repo);
  const graphPath = graphJsonPath(graphDir);
  if (!existsSync(graphPath)) {
    return result([], [], [], [
      `no graphify graph for ${repo || "this repository"} (${toPosix(relative(projectDir, graphDir))}); build it with "aidlc atlas-graph build --repo ${repo}" to count the source files independently`,
    ]);
  }
  const sourceRoot = sourceRootFor(projectDir, repo);
  const warnings: string[] = [];
  let graph: GraphFiles;
  try {
    graph = readGraphFiles(graphPath, sourceRoot);
  } catch (e) {
    return result([{ level: "error", where: toPosix(relative(projectDir, graphPath)), message: `cannot read the graph: ${e instanceof Error ? e.message : String(e)}` }], [], [], []);
  }
  if (graph.schemaWarning) warnings.push(graph.schemaWarning);
  const stale = staleness(graphDir, sourceRoot);
  if (stale) warnings.push(stale);
  const where = basename(inventoryPath);
  const inv = parseInventory(readFileSync(inventoryPath, "utf-8"));
  for (const b of inv.broad) {
    warnings.push(`"${b.path}" under ${b.owner} names the whole repository and is not counted; name the component's own folders`);
  }
  const findings: Finding[] = [];
  if (inv.components.size === 0) {
    findings.push({
      level: "error",
      where,
      message: "no component has a **Paths**: line, so no source file can be assigned to a component",
    });
  }
  const report = coverage(graph.files, inv);
  if (report.uncovered.length > 0) {
    const shown = report.uncovered.slice(0, limit);
    const more = report.uncovered.length - shown.length;
    findings.push({
      level: "error",
      where,
      message:
        `${report.uncovered.length} of ${report.total} source files graphify counted belong to no component and are not listed under Outside Components: ` +
        `${shown.join(", ")}${more > 0 ? ` and ${more} more` : ""}`,
    });
  }
  for (const p of report.unusedPaths) {
    if (!existsSync(join(sourceRoot, p.replace(/[*?].*$/, "")))) {
      warnings.push(`the path "${p}" in ${where} matches no file graphify counted and does not exist`);
    }
  }
  return result(findings, warnings, [
    `coverage: ${report.covered} in components, ${report.outside} outside components, ${report.uncovered.length} unassigned, of ${report.total} source files graphify counted`,
  ], []);
}

// The commit the graph was built from against the source's HEAD now.
export function staleness(graphDir: string, sourceRoot: string): string | null {
  const infoPath = join(graphDir, BUILD_INFO);
  if (!existsSync(infoPath)) return null;
  let commit = "";
  try {
    commit = String((JSON.parse(readFileSync(infoPath, "utf-8")) as { source_commit?: unknown }).source_commit ?? "");
  } catch {
    return `cannot read ${BUILD_INFO}`;
  }
  const head = gitHead(sourceRoot);
  if (commit === "" || head === null || commit === head) return null;
  return `the graph was built from commit ${commit.slice(0, 12)} but the source is now at ${head.slice(0, 12)}; rebuild it with "aidlc atlas-graph build"`;
}

export function gitHead(dir: string): string | null {
  // Read .git directly rather than spawn git: a sensor runs under a time budget.
  let gitDir = join(dir, ".git");
  try {
    if (statSync(gitDir).isFile()) {
      const m = /^gitdir:\s*(.+)$/m.exec(readFileSync(gitDir, "utf-8"));
      if (!m) return null;
      gitDir = resolve(dir, m[1].trim());
    }
    const head = readFileSync(join(gitDir, "HEAD"), "utf-8").trim();
    if (!head.startsWith("ref:")) return head;
    const ref = head.slice(4).trim();
    const commonDir = existsSync(join(gitDir, "commondir"))
      ? resolve(gitDir, readFileSync(join(gitDir, "commondir"), "utf-8").trim())
      : gitDir;
    for (const base of [gitDir, commonDir]) {
      const refFile = join(base, ref);
      if (existsSync(refFile)) return readFileSync(refFile, "utf-8").trim();
    }
    const packed = join(commonDir, "packed-refs");
    if (existsSync(packed)) {
      for (const line of readFileSync(packed, "utf-8").split("\n")) {
        const [sha, name] = line.trim().split(" ");
        if (name === ref) return sha;
      }
    }
  } catch {
    return null;
  }
  return null;
}

// --- citations ---

export interface Citation {
  path: string;
  start: number;
  end: number;
  line: number; // where in the artifact
}

// `src/app/a.ts:12`, `a.ts:L12-L30`, also unticked. A candidate with no folder
// that names no file is taken for something else (a host and port).
const CITATION = /(?<![\w/@:.-])((?:[\w.@+-]+\/)*[\w@+-][\w.@+-]*\.[A-Za-z0-9]{1,10}):L?(\d+)(?:\s*[-–]\s*L?(\d+))?(?![\w/])/g;

export function extractCitations(text: string): Citation[] {
  const out: Citation[] = [];
  let fence = false;
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    for (const m of line.matchAll(CITATION)) {
      const before = line.slice(0, m.index ?? 0);
      if (/(?:https?|file):\/\/\S*$/.test(before)) continue;
      const start = Number(m[2]);
      const end = m[3] ? Number(m[3]) : start;
      out.push({ path: normalizeRel(m[1]), start, end, line: i + 1 });
    }
  }
  return out;
}

const lineCounts = new Map<string, number>();
function lineCount(file: string): number {
  const cached = lineCounts.get(file);
  if (cached !== undefined) return cached;
  const text = readFileSync(file, "utf-8");
  const n = text === "" ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
  lineCounts.set(file, n);
  return n;
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

// Artifacts whose claims are about the code: a knowledge base with none of
// these citing a single line is written from memory, not from the code.
export const EVIDENCE_ARTIFACTS = new Set([
  "architecture.md",
  "code-structure.md",
  "api-documentation.md",
  "component-inventory.md",
  "dependencies.md",
  "code-quality-assessment.md",
]);

export function checkCitations(artifactPath: string, projectDir: string, repo: string): CheckResult {
  const name = basename(artifactPath);
  if (!name.endsWith(".md") || name === "reverse-engineering-timestamp.md") return passThrough();
  const text = readFileSync(artifactPath, "utf-8");
  const sourceRoot = sourceRootFor(projectDir, repo);
  const findings: Finding[] = [];
  const warnings: string[] = [];
  let ok = 0;
  const cites = extractCitations(text);
  for (const c of cites) {
    const roots = sourceRoot === projectDir ? [projectDir] : [sourceRoot, projectDir];
    const file = roots.map((r) => join(r, c.path)).find(isFile);
    const where = `${name}:${c.line}`;
    if (!file) {
      if (!c.path.includes("/")) continue;
      findings.push({ level: "error", where, message: `cites ${c.path}:${c.start}, but there is no such file in the repository` });
      continue;
    }
    if (c.start < 1 || c.end < c.start) {
      findings.push({ level: "error", where, message: `cites ${c.path}:${c.start}-${c.end}, which is not a line range` });
      continue;
    }
    const n = lineCount(file);
    if (c.end > n) {
      findings.push({ level: "error", where, message: `cites ${c.path}:${c.end}, but the file has ${n} lines` });
      continue;
    }
    ok++;
  }
  const unknowns = (text.match(/\bUNKNOWN\b/g) ?? []).length;
  if (cites.length === 0 && EVIDENCE_ARTIFACTS.has(name)) {
    warnings.push(`${name} cites no path:line; each claim about the code should name the lines it rests on, or say UNKNOWN`);
  }
  return result(findings, warnings, [`${name}: ${ok} of ${cites.length} citations resolve; ${unknowns} UNKNOWN`], []);
}

// --- a knowledge base folder, for the command ---

export function repoOfCodekbPath(artifactPath: string): string {
  return basename(dirname(artifactPath));
}

export function markdownFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => join(dir, f));
}

// The published knowledge base folders for a repository, one per space.
export function publishedCodekbDirs(projectDir: string, repo: string): string[] {
  const spaces = join(projectDir, "aidlc", "spaces");
  if (!existsSync(spaces)) return [];
  const out: string[] = [];
  for (const space of readdirSync(spaces)) {
    const d = join(spaces, space, "codekb", repo);
    if (existsSync(join(d, "component-inventory.md"))) out.push(d);
  }
  return out;
}
