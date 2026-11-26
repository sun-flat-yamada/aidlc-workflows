---
id: angular-acceptance-gate
kind: deterministic
fire_on: gate
command: bun {{HARNESS_DIR}}/tools/aidlc-sensor-angular-acceptance-gate.ts
default_severity: advisory
description: Checks angular-acceptance-results.json - every human-written acceptance case has a passing end-to-end test, none skipped, none unknown, case file unchanged (angular plugin, advisory)
category: document-shape
matches: "**/{aidlc-docs,intents}/**"
input_schema:
  output_path: string
  stage_slug: string
output_schema:
  pass: boolean
  findings_count: integer
  cases: integer
  passed: integer
  findings: array
timeout_seconds: 10
---

# angular-acceptance-gate sensor (angular plugin)

ADVISORY. Fires at the Build and Test gate on `build-and-test-summary.md` and
reads `angular-acceptance-results.json` in the same folder (the Build and Test
contribution of this plugin writes it). Every other deliverable passes through.

It reports a finding when:

- the results file is missing or is not valid JSON;
- a case in `cases` has no test whose title starts with `[<case id>]`;
- a test for a case did not pass, or was skipped;
- a test names a case id that is not in `cases`;
- `cases_sha256_before` and `cases_sha256_after` differ (the expected values
  were edited during the run);
- the pass rate is below `min_pass_rate` (default 1.0).

When the team supplied no acceptance cases, the file says
`"source": "none"` with an empty `cases` list and the sensor passes.
