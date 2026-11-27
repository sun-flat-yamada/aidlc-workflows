---
id: atlas-citations
kind: deterministic
fire_on: gate
command: bun {{HARNESS_DIR}}/tools/aidlc-sensor-atlas-citations.ts
default_severity: advisory
description: Checks that every path:line a code knowledge base artifact cites names a file of the repository and a line it has (codebase-atlas plugin, advisory)
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

# atlas-citations sensor (codebase-atlas plugin)

ADVISORY. Fires at the Reverse Engineering gate on each artifact of
`aidlc/spaces/<active-space>/codekb/<repo>/` except
`reverse-engineering-timestamp.md`.

| Checks | Finding |
| --- | --- |
| each `path:line` or `path:start-end` outside code fences (backticked or not) | the file is not in the repository (`<project>/<repo>/` for a registered repo, else the project root), or the line is past the file's end, or the range is backwards |
| `architecture.md`, `code-structure.md`, `api-documentation.md`, `component-inventory.md`, `dependencies.md`, `code-quality-assessment.md` | a warning when the artifact cites no line at all |

A candidate with no folder that names no file (`localhost:8080`) is not taken
for a citation. `checked` reports how many citations resolved and how many
`UNKNOWN` markers the artifact carries.

The same check runs on demand, also on the staged candidate before it is
published: `aidlc atlas-graph check --repo <repo> --codekb <folder>`.
