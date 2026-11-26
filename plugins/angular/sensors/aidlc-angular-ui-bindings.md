---
id: angular-ui-bindings
kind: deterministic
fire_on: gate
command: bun {{HARNESS_DIR}}/tools/aidlc-sensor-angular-ui-bindings.ts
default_severity: advisory
description: Checks a Unit's UI Bindings table against itself, the API contract and the mock-ups at Functional Design, and against the generated templates at Code Generation (angular plugin, advisory)
category: document-shape
matches: "**/{aidlc-docs,intents}/**"
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
timeout_seconds: 30
---

# angular-ui-bindings sensor (angular plugin)

ADVISORY. Reads the fenced ```yaml block under `## UI Bindings` in a Unit's
`frontend-components.md` (the table the functional-design contribution asks
for). A Unit with no such section passes.

| Fires on | Checks |
| --- | --- |
| `functional-spec.md` (Functional Design) | 1. the table: kinds, kebab-case ids unique across screens, `initial` and every `transition` declared in `states`, error kinds, `poll` and `path` forms. 2. the contract: every `call` is an `operationId` of the OpenAPI files under `apiSpecs:` (project-relative) or, without them, of the OpenAPI blocks in `contract-summary.md`; `request` keys exist in the request body; `source.path` exists in the response. 3. the mock-up: every bound ui-id is a `data-ui-id` in the screen's `design:` HTML, and every `data-ui-id` there is bound or `static` |
| `code-summary.md` (Code Generation) | 4. every ui-id of the Unit's table appears in a template as `data-ui-id="..."` (or a `uiId="..."` input) |

Errors count as findings. Warnings (an unmapped required request field, an
error response with no outcome, an operation no screen calls, an unknown
requirement id, a template ui-id in no table) are listed beside them. A level
whose counterpart is missing is named under `not_checked`, never failed.

The same check runs on demand: `aidlc angular-bindings-check <file>`.
