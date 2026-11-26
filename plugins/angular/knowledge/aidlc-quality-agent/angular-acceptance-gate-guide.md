# Angular Acceptance Gate Guide (angular plugin)

The team's human-written acceptance cases (often a spreadsheet of subsystem
tests) are the final quality gate of an Angular build: the AI does not decide
for itself that it is done.

## Why

- "The tests pass" means little when the same agent wrote the code and the
  tests. Cases written by people before the build are an independent oracle.
- The gate only holds if it cannot be softened: expected values unchanged,
  nothing skipped, every case covered.

## Case format that automates well

| Column | Notation |
| --- | --- |
| Case ID | Unique, e.g. `ST-NET-003` |
| Steps | Numbered lines; elements as `@<ui-id>` |
| API responses (mock) | `GET /api/v1/x -> 200 {json}`, one per line, in call order |
| Expected UI | Free text with `@<ui-id>` |
| Expected CSS | `@<ui-id> { property: computed-value }` |
| Expected API request | `PUT /api/v1/x {json subset}`, or "is not sent" |
| Notes | Requirement IDs for traceability |

`@<ui-id>` must name an element in the `## UI Bindings` table; flag one that
does not before writing tests.

## Reading the cases

Convert the team's file with `aidlc angular-cases <file>... --out
<record>/construction/build-and-test` (`.xlsx`, `.csv` or Markdown tables; add
`--alias "<header>=<field>"` for a header it does not know). It writes
`angular-acceptance-cases.json` and a Markdown checklist; read steps and
expected values from the JSON, never retype them from the spreadsheet. The
acceptance-gate sensor recomputes the hashes in that file, so an edited case or
a changed spreadsheet shows up before the gate.

## Writing the tests

- One test per case, title `[<case id>] <case title>`; one test covers one case.
- Mock the case's API responses at the network layer and record the requests;
  assert the expected requests (method, path, body subset) and the absence of
  any the case says is not sent.
- Select by `[data-ui-id]` only. Use web-first assertions; no fixed sleeps, no
  forced clicks, no `skip` / `fixme` / `only`.
- Keep expected values in the case data where the runner allows, rather than
  copying them into the test, so they cannot drift.

## Gate rule

Pass only when the case file is unchanged since the start (hash before equals
hash after), every case has at least one test and all its tests passed, no test
is skipped, and no test names an unknown case. `skipped` never counts as
`passed`. The `angular-acceptance-gate` sensor checks this from
`angular-acceptance-results.json`.

## Fixing failures

Classify each failure (Boundary, Design not reflected, API contract misread,
Reuse broken, Test defect, Environment) and fix the root cause in the place that
class names. Only a Test defect is fixed in the test, and then only its selector
or waiting. Bound the loop: after three rounds with the same case failing, stop
and bring the remaining failures to the person.
