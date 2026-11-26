---
id: angular-test-integrity
kind: deterministic
fire_on: gate
command: bun {{HARNESS_DIR}}/tools/aidlc-sensor-angular-test-integrity.ts
default_severity: advisory
description: Finds weakened tests in the project's *.spec.ts files (skip, only, fixme, fixed waits, forced clicks) at the Code Generation and Build and Test gates (angular plugin, advisory)
category: code-quality
matches: "**/{aidlc-docs,intents}/**"
input_schema:
  output_path: string
  stage_slug: string
output_schema:
  pass: boolean
  findings_count: integer
  scanned_files: integer
  findings: array
timeout_seconds: 30
---

# angular-test-integrity sensor (angular plugin)

ADVISORY. Fires at the gate of the stages that bind it. It acts once per gate,
on the stage's summary deliverable (`code-summary.md` for Code Generation,
`build-and-test-summary.md` for Build and Test), and passes through every other
deliverable. It scans the project's `*.spec.ts` / `*.test.ts` files (skipping
`node_modules`, build output, coverage, `.angular`, `.git` and the `aidlc`
record) and reports each line that switches a test off or makes it pass by force:

- `.skip(`, `.only(`, `.fixme(` on `describe` / `it` / `test`
- `xit(`, `xdescribe(`, `fit(`, `fdescribe(`
- `waitForTimeout(` (a fixed sleep instead of a web-first assertion)
- `force: true` (a click that ignores actionability)

A line that carries `angular-test-integrity: allow` is not reported, for the
rare case a team has decided to keep one.

Findings come back to the agent before the gate, as every advisory gate check
does, so the agent fixes the test, not the expectation.
