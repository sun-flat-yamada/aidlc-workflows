---
target: code-generation
plugin: angular
adds:
  sensors:
    - angular-test-integrity
fragments:
  - anchor: after-step:2
    order: 100
  - anchor: after-step:4
    order: 100
  - anchor: in:Sensors
    order: 100
---

## fragment: after-step:2

### Step 2a (angular): Change impact map

In an Angular workspace, add a `## Change Impact Map` section to
`code-generation-plan.md` before the plan steps, so the build changes only what
it should:

| Zone | Meaning | What the plan lists |
| --- | --- | --- |
| Reuse | Shared code the Unit imports and never edits (core services, the API client wrapper, shared UI components, design tokens, build and lint configuration) | The modules reused, by path |
| Append-only | Shared wiring files (route table, app config providers, menu lists) | The exact lines to append; no existing line is removed, reordered or rewritten |
| New / rebuild | The Unit's own feature folder, API service, models and their specs | Each file to create, with the requirement or `<ui-id>` it serves |
| Delete | Obsolete files the Unit replaces | Each file, and that nothing still imports it |

Order the plan steps: models from the contract, the API service (one method
per operation, through the project's API client wrapper), the page or
component (template from the mock-up with every `data-ui-id`, state from the
`## UI Bindings` table of `frontend-components.md` when present), the
append-only wiring, then the specs next to each file. Anything the inputs leave
open goes under `## Assumptions` with the most conservative reading.

## fragment: after-step:4

### Step 4a (angular): What the developer delegation adds for Angular

Add to the delegation prompt:

- The Angular rules of the active team rules (standalone, `OnPush`, `inject()`,
  signals, built-in control flow, the project's existing Angular version), and
  that the developer reads `angular-implementation-guide.md` from its knowledge.
- That files in the plan's Reuse zone are not edited and Append-only files only
  gain lines; a needed change outside the plan goes into the plan first.
- That after each file set it runs the project's build, lint and unit tests
  with coverage and repeats until all pass, without `.skip` / `.only`, lowered
  thresholds or `eslint-disable`.

## fragment: in:Sensors

The angular plugin adds `angular-test-integrity` (advisory, at the gate): once
per Unit, on `code-summary.md`, it scans the project's spec files for tests
switched off (`.skip`, `.only`, `xit`, `fit`, `test.fixme`) or forced
(`waitForTimeout`, `force: true`) and names each line. Fix the test, never the
expectation.
