---
target: build-and-test
plugin: angular
adds:
  sensors:
    - angular-test-integrity
    - angular-acceptance-gate
fragments:
  - anchor: after-step:8
    order: 100
  - anchor: after-step:9
    order: 100
  - anchor: in:Sensors
    order: 100
---

## fragment: after-step:8

### Step 8a (angular): Human-written acceptance cases as the final gate

When the team supplied acceptance test cases (a spreadsheet, a Markdown or CSV
table, or a JSON list in the workspace; ask once where they are if the
requirements or practices do not say), they are the acceptance criteria and the
final gate of this stage. Do not rewrite them.

1. Convert the cases before any test is written:
   `{{INVOKE}} angular-cases <case file>... --out <record>/construction/build-and-test`
   (`.xlsx`, `.csv` or a Markdown table; `--sheet` picks sheets, `--alias
   "<header>=<field>"` maps a column name it does not know). It writes
   `angular-acceptance-cases.json` (the structured cases, each source file's
   SHA-256 and the hash of the cases) and a readable
   `angular-acceptance-cases.md`. Read its warnings; a case it could not parse
   is fixed in the source with the person, not in the JSON. For another format,
   list the case ids yourself and record the SHA-256 of the case file
   (`cases_sha256_before`).
2. Write one end-to-end test per case (Playwright, or the E2E runner the project
   already uses), in the project's E2E folder. The test title starts with
   `[<case id>]`. A test covers one case; a case may have several tests.
3. Steps follow the case in order. Elements are selected only by
   `[data-ui-id="<ui-id>"]` (cases refer to them as `@<ui-id>`); the route comes
   from the `## UI Bindings` table. REST responses the case lists are mocked at
   the network layer for that test; the requests the case expects are asserted,
   and "is not sent" becomes an assertion that no such request was made.
4. Expected values come from the converted case (`expectedUi`, `expectedCss`,
   `expectedApi`, `mockApi`), read from the JSON at test time where the runner
   allows rather than copied into the test, translated to web-first
   assertions (`toHaveText`, `toBeDisabled`, `toBeVisible`, `toHaveCSS`, ...).
   Never `test.skip`, `test.fixme`, `test.only`, fixed sleeps or forced clicks.
   A case that cannot be automated as written still gets the closest faithful
   assertion and a comment saying why; an expectation is never weakened or
   dropped.

Name the command that runs them in `build-instructions.md`.

## fragment: after-step:9

### Step 9a (angular): Run the acceptance cases, fix by failure class, record the result

Run the acceptance tests after the unit tests. For each failure, name its class
and fix it with the smallest change in the right place:

| Class | Signal | Fix in |
| --- | --- | --- |
| B. Boundary | A file in the plan's Reuse zone changed, or an Append-only line was removed | Undo that edit; reach the goal inside the Unit's own files or by appending |
| D. Design not reflected | Wrong text, class or colour, missing `data-ui-id`, element enabled or shown at the wrong time | The template and styles, against the mock-up and the `## UI Bindings` conditions |
| A. API contract misread | Request path or body differs from the case, error not handled | The API service and request mapping, against the contract and the bindings |
| R. Reuse broken | Duplicated HTTP, polling or feedback logic; `HttpClient` used in a feature | Use the shared module instead |
| T. Test defect | Selector not found although the element exists, a race | The test's selector or waiting only; never an expected value |
| E. Environment | Dev server or browser does not start | Report it in `test-results.md`; do not work around it |

Do not retry a fix that already failed; after three rounds that leave the same
case failing, stop and put the remaining failures to the person with their
classes, instead of looping.

Then write `angular-acceptance-results.json` beside this stage's other outputs
(`<record>/construction/build-and-test/`). It is a sensor side-input, not a
deliverable:

```json
{
  "source": "<case file path, or none>",
  "cases": ["ST-001", "ST-002"],
  "tests": [{ "title": "[ST-001] ...", "status": "passed" }],
  "min_pass_rate": 1.0,
  "cases_sha256_before": "<hex>",
  "cases_sha256_after": "<hex>"
}
```

`status` is `passed`, `failed`, `skipped` or `timedOut`, as the runner reports
it. With `angular-acceptance-cases.json` beside it, `cases` and the two hashes
may be left out: the gate check takes the case ids from that file and
recomputes its hashes. With no team cases, write `"source": "none"` and an
empty `cases` list.

## fragment: in:Sensors

The angular plugin adds two advisory gate checks here, both on
`build-and-test-summary.md`: `angular-acceptance-gate` reads
`angular-acceptance-results.json` (every case has a passing, non-skipped test;
no unknown case ids; with `angular-acceptance-cases.json`, the converted cases
and their source files unchanged, recomputed by the check itself, and every
`@ui-id` of a case present in a Unit's UI Bindings table) and `angular-test-integrity` scans
the project's spec files for tests switched off or forced. Their findings come
back before the gate; fix the code or the test, never the case.
