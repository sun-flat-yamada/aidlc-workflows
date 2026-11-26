// angular-mcp-config.ts — shared by the angular-mcp command and the angular doctor
// check: where each harness keeps its project MCP configuration, and the Angular
// CLI MCP server entry this plugin writes there. Self-contained (a plugin tool
// must not import a core tool).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const SERVER_NAME = "angular-cli";

// The server runs on the person's machine over stdio, from the project's own
// installed Angular CLI (`--no-install`: nothing is downloaded, and the tools
// match the project's Angular version). `--read-only` leaves builds, tests and
// the dev server to the stages' own commands; `--local-only` keeps every tool
// offline (it drops search_documentation, which calls angular.dev).
export const SERVER_ARGS = ["--no-install", "ng", "mcp", "--read-only", "--local-only"];

// The oldest CLI with `ng mcp`; the flags above were checked on 22.3.
export const MIN_CLI = [20, 2, 0] as const;

export interface ServerEntry {
  command: string;
  args: string[];
}

export function serverEntry(platform: NodeJS.Platform = process.platform): ServerEntry {
  // On Windows `npx` is a .cmd shim that hosts cannot spawn without a shell.
  return platform === "win32"
    ? { command: "cmd", args: ["/c", "npx", ...SERVER_ARGS] }
    : { command: "npx", args: [...SERVER_ARGS] };
}

export type ConfigKind = "json-mcpServers" | "codex-toml";

export interface ConfigTarget {
  kind: ConfigKind;
  // Relative to the project directory.
  path: string;
}

// The project-level MCP file each harness reads. Harnesses not listed get the
// entry printed for the person to add where their host reads it.
export function configTarget(harnessDir: string): ConfigTarget | null {
  switch (harnessDir) {
    case ".claude":
      return { kind: "json-mcpServers", path: ".mcp.json" };
    case ".kiro":
      return { kind: "json-mcpServers", path: join(".kiro", "settings", "mcp.json") };
    case ".cursor":
      return { kind: "json-mcpServers", path: join(".cursor", "mcp.json") };
    case ".codex":
      return { kind: "codex-toml", path: join(".codex", "config.toml") };
    default:
      return null;
  }
}

export function isAngularWorkspace(projectDir: string): boolean {
  return existsSync(join(projectDir, "angular.json"));
}

export function localCliVersion(projectDir: string): string | null {
  const pkg = join(projectDir, "node_modules", "@angular", "cli", "package.json");
  if (!existsSync(pkg)) return null;
  try {
    const version = JSON.parse(readFileSync(pkg, "utf-8")).version;
    return typeof version === "string" ? version : null;
  } catch {
    return null;
  }
}

export function supportsMcp(version: string): boolean {
  const parts = version.split(/[.-]/).slice(0, 3).map((p) => Number.parseInt(p, 10));
  for (let i = 0; i < 3; i++) {
    const have = Number.isFinite(parts[i]) ? parts[i] : 0;
    if (have !== MIN_CLI[i]) return have > MIN_CLI[i];
  }
  return true;
}

export function codexBlock(entry: ServerEntry): string {
  const args = entry.args.map((a) => JSON.stringify(a)).join(", ");
  return `[mcp_servers.${SERVER_NAME}]\ncommand = ${JSON.stringify(entry.command)}\nargs = [${args}]\n`;
}

// Whether the target already names the server, and whether it is this entry.
export function configuredState(projectDir: string, target: ConfigTarget, entry: ServerEntry): "absent" | "same" | "different" {
  const file = join(projectDir, target.path);
  if (!existsSync(file)) return "absent";
  const text = readFileSync(file, "utf-8");
  if (target.kind === "codex-toml") {
    const header = `[mcp_servers.${SERVER_NAME}]`;
    if (!text.includes(header)) return "absent";
    return text.includes(codexBlock(entry).trimEnd()) ? "same" : "different";
  }
  try {
    const current = JSON.parse(text)?.mcpServers?.[SERVER_NAME];
    if (current === undefined) return "absent";
    return JSON.stringify({ command: current.command, args: current.args }) === JSON.stringify(entry) ? "same" : "different";
  } catch {
    return "different";
  }
}
