---
id: atlas-coverage
kind: deterministic
fire_on: gate
command: bun {{HARNESS_DIR}}/tools/aidlc-sensor-atlas-coverage.ts
default_severity: advisory
description: Checks that every source file graphify counted belongs to a component of component-inventory.md or to its Outside Components section (codebase-atlas plugin, advisory)
category: document-shape
matches: "**/codekb/**"
input_schema:
  output_path: string
  stage_slug: string
output_schema:
  pass: boolean
  findings_count: integer
  findings: array
  warnings: array
  checked: array
  not_checked: array
timeout_seconds: 60
---

# atlas-coverage sensor (codebase-atlas plugin)

ADVISORY. Fires at the Reverse Engineering gate and acts on
`component-inventory.md`; every other artifact passes through.

It reads the graph `aidlc atlas-graph build --repo <repo>` wrote under
`aidlc/codebase-atlas/graph/<repo>/`: the source files graphify (tree-sitter
AST, no LLM) counted, less AI-DLC's own install and workspace. Each file must
match a path on a component's `**Paths**:` line (a folder, a file or a glob,
repo-relative; the longest match wins) or a path under the
`## Outside Components` section (generated, vendored or otherwise deliberately
not a component, each with its reason).

| Finding | Warning |
| --- | --- |
| no component has a `**Paths**:` line; source files that belong nowhere (the first 50 listed, and a count) | a path naming the whole repository (`./`, `**`), which is not counted; a path that matches nothing and does not exist; a graph built from another commit than the source's HEAD; a graph schema this plugin was not tested with |

With no graph built (graphify is optional), the check is named under
`not_checked` and passes: the stage goes on as it does without the plugin.
Files graphify does not parse (configuration, SQL, copybooks) are not in the
graph, so the developer still lists them from the code itself.
