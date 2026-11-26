// angular-mcp.ts — the `aidlc angular-mcp` command (angular plugin).
//
// Adds the Angular CLI MCP server to the project's MCP configuration for the
// harness in use, when the person runs it. It never overwrites an entry of the
// same name that says something else, and never touches other servers.
//
//   aidlc angular-mcp             add the server (local stdio, read-only, offline)
//   aidlc angular-mcp --dry-run   say what would change, change nothing
//   aidlc angular-mcp --remove    remove the entry this command added
//   aidlc angular-mcp --print     print the entry for a host this command does not edit
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  codexBlock,
  configTarget,
  configuredState,
  isAngularWorkspace,
  localCliVersion,
  SERVER_NAME,
  serverEntry,
  supportsMcp,
  type ConfigTarget,
  type ServerEntry,
} from "./angular-mcp-config.ts";

function say(line: string): void {
  process.stdout.write(`${line}\n`);
}

function snippet(entry: ServerEntry): string {
  return JSON.stringify({ mcpServers: { [SERVER_NAME]: entry } }, null, 2);
}

function addEntry(projectDir: string, target: ConfigTarget, entry: ServerEntry): void {
  const file = join(projectDir, target.path);
  mkdirSync(dirname(file), { recursive: true });
  if (target.kind === "codex-toml") {
    const current = existsSync(file) ? readFileSync(file, "utf-8") : "";
    const sep = current.length === 0 || current.endsWith("\n\n") ? "" : current.endsWith("\n") ? "\n" : "\n\n";
    writeFileSync(file, `${current}${sep}${codexBlock(entry)}`);
    return;
  }
  const config = existsSync(file) ? JSON.parse(readFileSync(file, "utf-8")) : {};
  config.mcpServers = { ...(config.mcpServers ?? {}), [SERVER_NAME]: entry };
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
}

function removeEntry(projectDir: string, target: ConfigTarget, entry: ServerEntry): void {
  const file = join(projectDir, target.path);
  if (target.kind === "codex-toml") {
    const text = readFileSync(file, "utf-8");
    writeFileSync(file, text.replace(codexBlock(entry), "").replace(/\n{3,}$/, "\n\n"));
    return;
  }
  const config = JSON.parse(readFileSync(file, "utf-8"));
  delete config.mcpServers[SERVER_NAME];
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
}

export function main(argv: string[]): number {
  const dryRun = argv.includes("--dry-run");
  const remove = argv.includes("--remove");
  const print = argv.includes("--print");
  const projectDir = process.env.AIDLC_PROJECT_DIR ?? process.cwd();
  const harnessDir = process.env.AIDLC_HARNESS_DIR ?? ".claude";
  const entry = serverEntry();
  const target = configTarget(harnessDir);

  if (print || !target) {
    if (!target) say(`This command does not edit MCP settings for ${harnessDir}. Add this server where your host reads project MCP servers:`);
    say(snippet(entry));
    return 0;
  }

  const state = configuredState(projectDir, target, entry);
  if (remove) {
    if (state === "absent") {
      say(`${target.path} has no ${SERVER_NAME} server; nothing to remove.`);
      return 0;
    }
    if (state === "different") {
      say(`${target.path} has a ${SERVER_NAME} server this command did not write; left as it is. Remove it by hand if you want it gone.`);
      return 1;
    }
    if (!dryRun) removeEntry(projectDir, target, entry);
    say(`${dryRun ? "Would remove" : "Removed"} the ${SERVER_NAME} server from ${target.path}.`);
    return 0;
  }

  if (!isAngularWorkspace(projectDir)) {
    say("No angular.json in this project, so the Angular CLI MCP server has nothing to read. Nothing changed.");
    return 1;
  }
  const version = localCliVersion(projectDir);
  if (!version) {
    say("The project's Angular CLI is not installed (node_modules/@angular/cli). Install the project's dependencies first (for example `npm ci`), then run this again. Nothing changed.");
    return 1;
  }
  if (!supportsMcp(version)) {
    say(`The project's Angular CLI is ${version}; \`ng mcp\` needs 20.2 or later. Nothing changed.`);
    return 1;
  }
  if (state === "same") {
    say(`${target.path} already runs the ${SERVER_NAME} server (Angular CLI ${version}, local, read-only, offline).`);
    return 0;
  }
  if (state === "different") {
    say(`${target.path} already has a ${SERVER_NAME} server with other settings; left as it is. To use this plugin's settings, remove that entry and run this again, or set it by hand to:`);
    say(snippet(entry));
    return 1;
  }
  if (!dryRun) addEntry(projectDir, target, entry);
  say(
    `${dryRun ? "Would add" : "Added"} the ${SERVER_NAME} server to ${target.path}: the project's own Angular CLI ${version} on this machine, ` +
      "read-only and offline. Restart your AI tool (or reload its MCP servers) to pick it up; undo with `aidlc angular-mcp --remove`.",
  );
  return 0;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
