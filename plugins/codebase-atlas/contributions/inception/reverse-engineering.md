---
target: reverse-engineering
plugin: codebase-atlas
adds:
  sensors:
    - atlas-citations
    - atlas-coverage
fragments:
  - anchor: after-step:1
    order: 110
  - anchor: after-step:2
    order: 110
  - anchor: after-step:3
    order: 110
  - anchor: in:Sensors
    order: 110
---

## fragment: after-step:1

### Step 1a (codebase-atlas): Count the source files independently

For each repository selected for a scan (not for a reused one), build a
deterministic count of its source before the developer starts, so that what the
scan covers is checked against a list the scan did not write:

```
{{INVOKE}} atlas-graph build --repo <repo>
```

`<repo>` is the name the knowledge base uses (`{{INVOKE}} engine workspace codekb --repo <repo> --json`
prints it); for an unrecorded project-root repo, pass the name `codekb-path`
gives the project folder. The command runs graphify (tree-sitter AST, no LLM,
nothing sent anywhere) over the repository and writes
`aidlc/codebase-atlas/graph/<repo>/`; it reads the project's files and changes
none of them. It is bookkeeping: say nothing about it when it works. When
graphify is not installed, tell the person once, in one line, that the
independent file count is skipped this time and that installing graphify turns
it on (the command prints how); then go on. The scan never waits for it.

## fragment: after-step:2

### Step 2a (codebase-atlas): Evidence and the full count in the developer brief

Add to the developer's brief:

- Read `{{HARNESS_DIR}}/knowledge/aidlc-developer-agent/atlas-evidence-guide.md`
  and follow it: each finding names the `path:line` it rests on, what the code
  does not settle is written `UNKNOWN` with what was checked, and old and new
  implementations of one purpose, half-built scaffolding and configuration-driven
  wiring are recorded as what they are.
- When Step 1a built a graph, its file list is the denominator:
  `aidlc/codebase-atlas/graph/<repo>/graphify-out/graph.json` (each node's
  `source_file`). Every file on it ends up in a component, under Outside
  Components with its reason, or in **Left out**; none is silently missing from
  Scan Coverage. Files graphify does not parse (configuration, SQL, templates,
  copybooks, job control) are not on it: list those from the code itself.

## fragment: after-step:3

### Step 3a (codebase-atlas): Paths, citations and the check before publishing

Whoever writes the nine artifacts (the architect, or the developer working
alone) is also briefed with the evidence guide above, and:

- In `component-inventory.md`, every component carries a `**Paths**:` line
  naming the repo-relative folders, files or globs it owns, each in backticks
  (never the whole repository), for example
  ``- **Paths**: `src/orders/`, `src/shared/money.ts` ``. Code that
  deliberately belongs to no component (generated, vendored, samples) goes
  under a `## Outside Components` section, each path with its reason.
- Claims in the other artifacts cite the lines they rest on, as the guide says.

Before the `codekb-publish` call, check the staged candidate:

```
{{INVOKE}} atlas-graph check --repo <repo> --codekb <record>/.aidlc-engine/codekb-stage-<repo>/
```

It writes nothing. Fix what it reports in the staged files: give an
unassigned file its component or an Outside Components entry, and correct or
remove a citation that does not resolve (a claim that loses its evidence
becomes `UNKNOWN`, it is not kept without it). Run it at most three times; what
is still reported then goes to the person in Step 5 as an open point, in one
line per kind. Write `kind: full` in the Scope of Analysis block only when no
source file is left unassigned.

## fragment: in:Sensors

The codebase-atlas plugin adds two advisory gate checks over each repository's
knowledge base: `atlas-citations` (every `path:line` an artifact cites is a
line of the repository) and `atlas-coverage` (on `component-inventory.md`:
every source file graphify counted belongs to a component or to Outside
Components; without a graph it reports the check as not run). Their findings
come back before the gate; fix the artifacts, not the count.
