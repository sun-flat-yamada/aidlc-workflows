// angular-bindings-lib.ts — the UI Bindings check (angular plugin).
//
// Reads the `## UI Bindings` YAML table of a Unit's frontend-components.md and
// checks it in levels, each run only when its counterpart is found:
//   1. the table itself (shape, ids, states and transitions)
//   2. the API contract (OpenAPI files the table names, or the OpenAPI blocks of
//      contract-summary.md)
//   3. the mock-up HTML each screen names (`data-ui-id`)
//   4. the generated templates (`data-ui-id` / `uiId`), at Code Generation
// A level whose counterpart is missing is reported under `not_checked`, never as
// a failure. Ported from an Angular AI-DLC SDK's input gate; YAML via the
// built-in Bun.YAML, so the tool stays dependency-free. Self-contained (a
// plugin tool must not import a core tool).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";

export interface Finding {
  level: "error" | "warning";
  where: string;
  message: string;
}

export interface CheckResult {
  pass: boolean;
  findings_count: number;
  findings: Finding[];
  warnings: Finding[];
  checked: string[];
  not_checked: string[];
}

type Obj = Record<string, unknown>;

const ID = /^[a-z][a-z0-9-]*$/;
const ELEMENT_KINDS = new Set(["button", "toggle", "input", "select", "indicator", "text", "list", "container"]);
const EVENTS = new Set(["press", "longPress", "change", "submit"]);
const POLL = /^\d+(ms|s)$/;
const JSON_PATH = /^\$(\.[A-Za-z_][\w]*)*$/;
// Error kinds the SDK mapped to HTTP codes; other kinds are project-specific and
// only checked for their spelling.
const ERROR_CODES: Record<string, string[]> = {
  validation: ["400", "422"],
  busy: ["409", "503"],
  "not-found": ["404"],
};
const SKIP_DIRS = new Set(["node_modules", "dist", "coverage", ".angular", ".git", "aidlc", "aidlc-docs", "test-results", "playwright-report", ".nx"]);

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

// --- Reading the table ------------------------------------------------------

/** The first ```yaml block under a `## UI Bindings` heading, or null when the section is absent. */
export function extractBindingsYaml(markdown: string): string | null {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((l) => /^##\s+UI Bindings\s*$/i.test(l.trim()));
  if (start < 0) return null;
  let inBlock = false;
  const block: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!inBlock && /^##\s/.test(line)) break;
    if (!inBlock && /^\s*```\s*(ya?ml)\s*$/i.test(line)) {
      inBlock = true;
      continue;
    }
    if (inBlock && /^\s*```\s*$/.test(line)) return block.join("\n");
    if (inBlock) block.push(line);
  }
  return inBlock ? block.join("\n") : "";
}

export function parseYaml(text: string): unknown {
  return Bun.YAML.parse(text);
}

// --- OpenAPI ----------------------------------------------------------------

interface JsonSchema {
  $ref?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  allOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
}

export interface Operation {
  operationId: string;
  method: string;
  path: string;
  requestSchema?: JsonSchema;
  responseSchema?: JsonSchema;
  responseCodes: string[];
  shared: boolean;
  source: string;
  doc: unknown;
}

function resolveRef(doc: unknown, schema: JsonSchema | undefined, depth = 0): JsonSchema | undefined {
  if (!schema || depth > 20) return schema;
  if (typeof schema.$ref === "string" && schema.$ref.startsWith("#/")) {
    const target = schema.$ref
      .slice(2)
      .split("/")
      .reduce<unknown>((node, key) => (isObj(node) ? node[key.replace(/~1/g, "/").replace(/~0/g, "~")] : undefined), doc);
    return resolveRef(doc, target as JsonSchema, depth + 1);
  }
  return schema;
}

function propertiesOf(doc: unknown, schema: JsonSchema | undefined): Map<string, JsonSchema> {
  const out = new Map<string, JsonSchema>();
  const s = resolveRef(doc, schema);
  if (!s) return out;
  for (const [k, v] of Object.entries(s.properties ?? {})) out.set(k, v);
  for (const part of [...(s.allOf ?? []), ...(s.oneOf ?? []), ...(s.anyOf ?? [])]) {
    for (const [k, v] of propertiesOf(doc, part)) out.set(k, v);
  }
  return out;
}

function requiredOf(doc: unknown, schema: JsonSchema | undefined): string[] {
  const s = resolveRef(doc, schema);
  return [...(s?.required ?? []), ...(s?.allOf ?? []).flatMap((p) => requiredOf(doc, p))];
}

/** Whether `$.a.b` exists in the schema; undefined when it cannot be decided. */
export function schemaHasPath(doc: unknown, schema: JsonSchema | undefined, jsonPath: string): boolean | undefined {
  const parts = jsonPath.replace(/^\$\.?/, "").split(".").filter(Boolean);
  let current = resolveRef(doc, schema);
  for (const part of parts) {
    if (!current) return undefined;
    const props = propertiesOf(doc, current);
    if (props.size === 0) return undefined;
    const next = props.get(part);
    if (!next) return false;
    current = resolveRef(doc, next);
  }
  return true;
}

function jsonContent(content: unknown): JsonSchema | undefined {
  if (!isObj(content)) return undefined;
  const json = content["application/json"] ?? Object.entries(content).find(([k]) => k.includes("json"))?.[1];
  return isObj(json) ? (json.schema as JsonSchema | undefined) : undefined;
}

export function operationsOf(doc: unknown, source: string): Operation[] {
  if (!isObj(doc) || !isObj(doc.paths)) return [];
  const ops: Operation[] = [];
  for (const [p, item] of Object.entries(doc.paths)) {
    if (!isObj(item)) continue;
    for (const method of ["get", "put", "post", "patch", "delete"]) {
      const op = item[method];
      if (!isObj(op) || typeof op.operationId !== "string") continue;
      const responses = isObj(op.responses) ? op.responses : {};
      const okCode = Object.keys(responses).find((c) => /^2\d\d$/.test(c));
      ops.push({
        operationId: op.operationId,
        method: method.toUpperCase(),
        path: p,
        requestSchema: isObj(op.requestBody) ? jsonContent(op.requestBody.content) : undefined,
        responseSchema: okCode && isObj(responses[okCode]) ? jsonContent((responses[okCode] as Obj).content) : undefined,
        responseCodes: Object.keys(responses),
        shared: op["x-ui-binding"] === "shared",
        source,
        doc,
      });
    }
  }
  return ops;
}

/** OpenAPI documents in the fenced yaml/json blocks of a Markdown file (contract-summary.md). */
export function openApiBlocks(markdown: string): unknown[] {
  const docs: unknown[] = [];
  for (const m of markdown.replace(/\r\n/g, "\n").matchAll(/^\s*```\s*(ya?ml|json)\s*\n([\s\S]*?)^\s*```\s*$/gim)) {
    try {
      const doc = m[1].toLowerCase() === "json" ? JSON.parse(m[2]) : parseYaml(m[2]);
      if (isObj(doc) && "openapi" in doc && isObj(doc.paths)) docs.push(doc);
    } catch {
      // A block that does not parse is not an OpenAPI document this check can use.
    }
  }
  return docs;
}

// --- HTML -------------------------------------------------------------------

/** `data-ui-id` values in document order, duplicates kept, comments ignored. */
export function extractUiIds(html: string): string[] {
  const text = html.replace(/<!--[\s\S]*?-->/g, "");
  return [...text.matchAll(/data-ui-id\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]);
}

/** ui-ids in Angular templates and inline templates: `data-ui-id="x"` or a `uiId="x"` input. */
export function extractTemplateUiIds(text: string): string[] {
  const clean = text.replace(/<!--[\s\S]*?-->/g, "");
  return [...clean.matchAll(/(?:data-ui-id|uiId)\s*=\s*["']([a-z][a-z0-9-]*)["']/g)].map((m) => m[1]);
}

function walk(root: string, accept: (name: string) => boolean, out: string[], limit = 20000): void {
  if (out.length >= limit) return;
  let names: string[];
  try {
    names = readdirSync(root);
  } catch {
    return;
  }
  for (const name of names.sort()) {
    if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
    const path = join(root, name);
    let dir = false;
    try {
      dir = statSync(path).isDirectory();
    } catch {
      continue;
    }
    if (dir) walk(path, accept, out, limit);
    else if (accept(name)) out.push(path);
    if (out.length >= limit) return;
  }
}

// --- Locating the counterparts ---------------------------------------------

/** `<record>` for a file at `<record>/construction/<unit>/<stage>/<file>`, when the layout matches. */
export function recordDirOf(file: string): string | null {
  const stageDir = dirname(file);
  const unitDir = dirname(stageDir);
  const construction = dirname(unitDir);
  return construction.endsWith("construction") ? dirname(construction) : null;
}

function firstExisting(candidates: string[]): string | null {
  for (const c of candidates) if (existsSync(c)) return c;
  return null;
}

export interface Context {
  projectDir: string;
  bindingsFile: string;
  recordDir: string | null;
}

// --- The check --------------------------------------------------------------

export interface Bindings {
  screens: Record<string, Obj>;
  apiSpecs: string[];
}

export function checkBindings(raw: unknown, ctx: Context): { result: CheckResult; bindings: Bindings | null; operations: Map<string, Operation> } {
  const findings: Finding[] = [];
  const checked: string[] = [];
  const notChecked: string[] = [];
  const err = (where: string, message: string) => findings.push({ level: "error", where, message });
  const warn = (where: string, message: string) => findings.push({ level: "warning", where, message });
  const operations = new Map<string, Operation>();
  const done = () => {
    const errors = findings.filter((f) => f.level === "error");
    return {
      pass: errors.length === 0,
      findings_count: errors.length,
      findings: errors,
      warnings: findings.filter((f) => f.level === "warning"),
      checked,
      not_checked: notChecked,
    };
  };

  // Level 1: the table itself.
  if (!isObj(raw) || !isObj(raw.screens)) {
    err("UI Bindings", "the yaml block needs a `screens:` map");
    return { result: done(), bindings: null, operations };
  }
  const bindings: Bindings = { screens: {}, apiSpecs: strings(raw.apiSpecs) };
  const allIds = new Map<string, string>();
  const checkOutcome = (o: unknown, at: string, states: Set<string>) => {
    if (o === undefined) return;
    if (!isObj(o)) return err(at, "must be a map");
    if (o.transition !== undefined && (typeof o.transition !== "string" || !states.has(o.transition))) {
      err(at, `transition "${String(o.transition)}" is not in states`);
    }
  };
  const checkAction = (a: unknown, at: string, states: Set<string>) => {
    if (a === undefined) return;
    if (!isObj(a)) return err(at, "must be a map");
    checkOutcome(a, at, states);
    checkOutcome(a.success, `${at}.success`, states);
    if (a.call !== undefined && typeof a.call !== "string") err(`${at}.call`, "must be an operationId");
    if (a.request !== undefined && !isObj(a.request)) err(`${at}.request`, "must map request fields to expressions");
    if (a.errors !== undefined) {
      if (!isObj(a.errors)) err(`${at}.errors`, "must map error kinds to outcomes");
      else
        for (const [kind, o] of Object.entries(a.errors)) {
          if (kind !== "default" && !ID.test(kind)) err(`${at}.errors.${kind}`, "error kind must be `default` or kebab-case");
          checkOutcome(o, `${at}.errors.${kind}`, states);
        }
    }
  };
  for (const [screenId, s] of Object.entries(raw.screens)) {
    const where = (suffix = "") => `screens.${screenId}${suffix}`;
    if (!ID.test(screenId)) err(where(), "screen id must be kebab-case");
    if (!isObj(s)) {
      err(where(), "must be a map");
      continue;
    }
    bindings.screens[screenId] = s;
    if (typeof s.route !== "string" || !s.route.startsWith("/")) err(where(".route"), "route must start with /");
    const stateList = strings(s.states);
    if (stateList.length === 0) err(where(".states"), "declare at least one state");
    for (const st of stateList) if (!ID.test(st)) err(where(".states"), `state "${st}" must be kebab-case`);
    const states = new Set(stateList);
    if (typeof s.initial !== "string" || !states.has(s.initial)) err(where(".initial"), `"${String(s.initial)}" is not in states`);
    checkAction(s.onEnter, where(".onEnter"), states);
    const elements = isObj(s.elements) ? s.elements : {};
    if (!isObj(s.elements)) err(where(".elements"), "declare the screen's elements");
    for (const id of [...Object.keys(elements), ...strings(s.static)]) {
      if (!ID.test(id)) err(where(`.elements.${id}`), "ui-id must be kebab-case");
      const other = allIds.get(id);
      if (other && other !== screenId) err(where(`.elements.${id}`), `ui-id "${id}" is also used by screen ${other}; ui-ids are unique across screens`);
      allIds.set(id, screenId);
    }
    for (const [elId, el] of Object.entries(elements)) {
      const at = where(`.elements.${elId}`);
      if (!isObj(el)) {
        err(at, "must be a map");
        continue;
      }
      if (typeof el.kind !== "string" || !ELEMENT_KINDS.has(el.kind)) err(`${at}.kind`, `kind must be one of ${[...ELEMENT_KINDS].join(", ")}`);
      if (el.source !== undefined) {
        if (!isObj(el.source) || typeof el.source.call !== "string") err(`${at}.source`, "source needs a `call`");
        else {
          if (el.source.poll !== undefined && (typeof el.source.poll !== "string" || !POLL.test(el.source.poll))) err(`${at}.source.poll`, "poll is like `5s` or `500ms`");
          if (el.source.path !== undefined && (typeof el.source.path !== "string" || !JSON_PATH.test(el.source.path))) err(`${at}.source.path`, "path is like `$.field.sub`");
        }
      }
      if (el.on !== undefined) {
        if (!isObj(el.on)) err(`${at}.on`, "must map events to actions");
        else
          for (const [event, a] of Object.entries(el.on)) {
            if (!EVENTS.has(event)) err(`${at}.on.${event}`, `event must be one of ${[...EVENTS].join(", ")}`);
            checkAction(a, `${at}.on.${event}`, states);
          }
      }
      if (el.kind === "indicator" && !el.source && !el.map) warn(at, "indicator without source or map");
      if (el.kind === "button" && !el.on) warn(at, 'button without an "on" event');
      if ((el.kind === "input" || el.kind === "toggle" || el.kind === "select") && !el.bind) warn(at, `${el.kind} without "bind"`);
    }
  }
  checked.push("table");

  // Level 2: the contract.
  const docs: { doc: unknown; source: string }[] = [];
  for (const spec of bindings.apiSpecs) {
    const file = isAbsolute(spec) ? spec : join(ctx.projectDir, spec);
    if (!existsSync(file)) {
      err("apiSpecs", `${spec} not found`);
      continue;
    }
    try {
      const text = readFileSync(file, "utf-8");
      docs.push({ doc: file.endsWith(".json") ? JSON.parse(text) : parseYaml(text), source: spec });
    } catch (e) {
      err("apiSpecs", `${spec} does not parse: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (bindings.apiSpecs.length === 0 && ctx.recordDir) {
    const summary = join(ctx.recordDir, "inception", "contract-design", "contract-summary.md");
    if (existsSync(summary)) for (const doc of openApiBlocks(readFileSync(summary, "utf-8"))) docs.push({ doc, source: "contract-summary.md" });
  }
  for (const { doc, source } of docs) {
    for (const op of operationsOf(doc, source)) {
      if (operations.has(op.operationId)) err(source, `duplicate operationId "${op.operationId}"`);
      operations.set(op.operationId, op);
    }
  }
  if (operations.size === 0) notChecked.push("contract (no apiSpecs and no OpenAPI block in contract-summary.md)");
  else {
    checked.push("contract");
    const used = new Set<string>();
    const checkCall = (a: unknown, at: string) => {
      if (!isObj(a) || typeof a.call !== "string") return;
      used.add(a.call);
      const op = operations.get(a.call);
      if (!op) return err(at, `operationId "${a.call}" is not in the contract`);
      if (isObj(a.request)) {
        const props = propertiesOf(op.doc, op.requestSchema);
        if (!op.requestSchema) err(`${at}.request`, `${a.call} has no JSON request body`);
        for (const k of Object.keys(a.request)) if (op.requestSchema && props.size && !props.has(k)) err(`${at}.request.${k}`, `"${k}" is not a property of the ${a.call} request body`);
        for (const r of requiredOf(op.doc, op.requestSchema)) if (!(r in a.request)) warn(`${at}.request`, `required request property "${r}" of ${a.call} is not mapped`);
      } else if (op.requestSchema && op.method !== "GET") warn(at, `${a.call} expects a request body but no request mapping is given`);
      const errors = isObj(a.errors) ? a.errors : {};
      for (const kind of Object.keys(errors)) {
        const codes = ERROR_CODES[kind];
        if (codes && !codes.some((c) => op.responseCodes.includes(c))) warn(`${at}.errors.${kind}`, `${a.call} declares no ${codes.join("/")} response`);
      }
      for (const [kind, codes] of Object.entries(ERROR_CODES)) {
        const present = codes.filter((c) => op.responseCodes.includes(c));
        if (present.length && !(kind in errors) && !("default" in errors)) warn(at, `${a.call} can answer ${present.join("/")} but no "${kind}" (or "default") outcome is bound`);
      }
    };
    for (const [screenId, s] of Object.entries(bindings.screens)) {
      checkCall(s.onEnter, `screens.${screenId}.onEnter`);
      for (const [elId, el] of Object.entries(isObj(s.elements) ? s.elements : {})) {
        if (!isObj(el)) continue;
        const at = `screens.${screenId}.elements.${elId}`;
        if (isObj(el.source) && typeof el.source.call === "string") {
          used.add(el.source.call);
          const op = operations.get(el.source.call);
          if (!op) err(`${at}.source`, `operationId "${el.source.call}" is not in the contract`);
          else if (typeof el.source.path === "string" && schemaHasPath(op.doc, op.responseSchema, el.source.path) === false) {
            err(`${at}.source.path`, `${el.source.path} is not in the ${el.source.call} response`);
          }
        }
        for (const [event, a] of Object.entries(isObj(el.on) ? el.on : {})) checkCall(a, `${at}.on.${event}`);
      }
    }
    for (const op of operations.values()) {
      if (!used.has(op.operationId) && !op.shared) warn(op.source, `operationId "${op.operationId}" (${op.method} ${op.path}) is not bound to any screen of this Unit`);
    }
  }

  // Level 3: the mock-up HTML.
  for (const [screenId, s] of Object.entries(bindings.screens)) {
    if (typeof s.design !== "string") {
      notChecked.push(`design of ${screenId} (no design file named)`);
      continue;
    }
    const candidates = [isAbsolute(s.design) ? s.design : join(ctx.projectDir, s.design), join(dirname(ctx.bindingsFile), s.design)];
    if (ctx.recordDir) candidates.push(join(ctx.recordDir, s.design), join(ctx.recordDir, "inception", "refined-mockups", s.design));
    const file = firstExisting(candidates);
    if (!file) {
      err(`screens.${screenId}.design`, `${s.design} not found`);
      continue;
    }
    checked.push(`design of ${screenId}`);
    const htmlIds = extractUiIds(readFileSync(file, "utf-8"));
    for (const d of new Set(htmlIds.filter((x, i) => htmlIds.indexOf(x) !== i))) err(s.design, `duplicate data-ui-id="${d}"`);
    const declared = new Set([...Object.keys(isObj(s.elements) ? s.elements : {}), ...strings(s.static)]);
    for (const h of new Set(htmlIds)) if (!declared.has(h)) err(s.design, `data-ui-id="${h}" is neither bound in elements nor listed in static`);
    for (const e of declared) if (!htmlIds.includes(e)) err(`screens.${screenId}.elements.${e}`, `no data-ui-id="${e}" in ${s.design}`);
  }

  // Requirement ids (warning only).
  if (ctx.recordDir) {
    const reqFile = join(ctx.recordDir, "inception", "requirements-analysis", "requirements.md");
    if (existsSync(reqFile)) {
      const reqText = readFileSync(reqFile, "utf-8");
      for (const [screenId, s] of Object.entries(bindings.screens)) {
        for (const req of strings(s.requirements)) if (!reqText.includes(req)) warn(`screens.${screenId}.requirements`, `${req} not found in requirements.md`);
      }
    }
  }
  return { result: done(), bindings, operations };
}

/** Every ui-id a table binds or lists as static. */
export function boundUiIds(bindings: Bindings): Set<string> {
  const ids = new Set<string>();
  for (const s of Object.values(bindings.screens)) {
    for (const id of Object.keys(isObj(s.elements) ? s.elements : {})) ids.add(id);
    for (const id of strings(s.static)) ids.add(id);
  }
  return ids;
}

/** Level 4: the generated templates carry every ui-id of the table. */
/**
 * Where the Angular templates live: every `projects.*.sourceRoot` of `angular.json`, else `src/`.
 * Mock-ups and other HTML outside the app's sources never count as templates.
 */
export function sourceRoots(projectDir: string): string[] {
  const roots = new Set<string>();
  try {
    const ws = JSON.parse(readFileSync(join(projectDir, "angular.json"), "utf-8")) as Obj;
    const projects = isObj(ws.projects) ? ws.projects : {};
    for (const p of Object.values(projects)) {
      if (!isObj(p)) continue;
      const root = typeof p.sourceRoot === "string" ? p.sourceRoot : typeof p.root === "string" && p.root ? join(p.root, "src") : "src";
      roots.add(join(projectDir, root));
    }
  } catch {
    // no workspace file: the CLI's default layout
  }
  if (roots.size === 0) roots.add(join(projectDir, "src"));
  return [...roots].filter((r) => existsSync(r));
}

export function checkTemplates(bindings: Bindings, projectDir: string, knownIds: Set<string>): CheckResult {
  const files: string[] = [];
  const accept = (n: string) => /\.(html|ts)$/.test(n) && !/\.(spec|test)\.ts$/.test(n);
  for (const root of sourceRoots(projectDir)) walk(root, accept, files);
  const found = new Map<string, string>();
  for (const f of files) {
    let text = "";
    try {
      text = readFileSync(f, "utf-8");
    } catch {
      continue;
    }
    for (const id of extractTemplateUiIds(text)) if (!found.has(id)) found.set(id, relative(projectDir, f).split("\\").join("/"));
  }
  const findings: Finding[] = [];
  const warnings: Finding[] = [];
  for (const id of boundUiIds(bindings)) if (!found.has(id)) findings.push({ level: "error", where: `ui-id ${id}`, message: `no template carries data-ui-id="${id}"` });
  for (const [id, file] of found) if (!knownIds.has(id)) warnings.push({ level: "warning", where: file, message: `data-ui-id="${id}" is in no UI Bindings table` });
  return { pass: findings.length === 0, findings_count: findings.length, findings, warnings, checked: ["templates"], not_checked: [] };
}

/** ui-ids of every Unit's table in the record (for templates and acceptance cases). */
export function allRecordUiIds(recordDir: string): { ids: Set<string>; tables: number } {
  const ids = new Set<string>();
  let tables = 0;
  const construction = join(recordDir, "construction");
  let units: string[] = [];
  try {
    units = readdirSync(construction);
  } catch {
    return { ids, tables };
  }
  for (const unit of units) {
    const file = join(construction, unit, "functional-design", "frontend-components.md");
    if (!existsSync(file)) continue;
    const yaml = extractBindingsYaml(readFileSync(file, "utf-8"));
    if (!yaml) continue;
    try {
      const raw = parseYaml(yaml);
      if (!isObj(raw) || !isObj(raw.screens)) continue;
      tables++;
      for (const id of boundUiIds({ screens: raw.screens as Record<string, Obj>, apiSpecs: [] })) ids.add(id);
    } catch {
      // An unparsable table is reported by its own Unit's check.
    }
  }
  return { ids, tables };
}

/** Screen x element x trigger x API x outcome, for review. */
export function renderMatrix(bindings: Bindings, operations: Map<string, Operation>): string {
  const api = (call: unknown) => {
    if (typeof call !== "string") return "-";
    const op = operations.get(call);
    return op ? `\`${call}\` \`${op.method} ${op.path}\`` : `\`${call}\``;
  };
  const cell = (s: string) => s.replace(/\|/g, "\\|");
  const out = (o: unknown) => (isObj(o) ? [o.transition && `-> ${o.transition}`, o.show].filter(Boolean).join(" / ") || "-" : "-");
  const errs = (a: Obj) => (isObj(a.errors) ? Object.entries(a.errors).map(([k, v]) => `${k}: ${out(v)}`).join("; ") : "") || "-";
  const lines = ["# UI Bindings matrix", ""];
  for (const [id, s] of Object.entries(bindings.screens)) {
    lines.push(`## ${id} (route \`${String(s.route)}\`)`, "", `States: ${strings(s.states).map((x) => (x === s.initial ? `**${x}** (initial)` : x)).join(", ")}`, "");
    lines.push("| ui-id | kind | trigger | API | success | errors | conditions |", "| --- | --- | --- | --- | --- | --- | --- |");
    if (isObj(s.onEnter)) lines.push(`| (screen) | - | enter | ${api(s.onEnter.call)} | ${out(s.onEnter.success)} | ${cell(errs(s.onEnter))} | - |`);
    for (const [elId, el] of Object.entries(isObj(s.elements) ? s.elements : {})) {
      if (!isObj(el)) continue;
      const cond = cell([el.enabledWhen && `enabled: ${el.enabledWhen}`, el.visibleWhen && `visible: ${el.visibleWhen}`].filter(Boolean).join("; ") || "-");
      const events = Object.entries(isObj(el.on) ? el.on : {});
      if (isObj(el.source)) lines.push(`| \`${elId}\` | ${el.kind} | ${el.source.poll ? `poll ${el.source.poll}` : "load"} | ${api(el.source.call)} | \`${String(el.source.path ?? "$")}\` | - | ${cond} |`);
      for (const [event, a] of events) if (isObj(a)) lines.push(`| \`${elId}\` | ${el.kind} | ${event} | ${api(a.call)} | ${out(a.success ?? a)} | ${cell(errs(a))} | ${cond} |`);
      if (!isObj(el.source) && events.length === 0) lines.push(`| \`${elId}\` | ${el.kind} | ${el.bind ? `bind \`${el.bind}\`` : "-"} | - | - | - | ${cond} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
