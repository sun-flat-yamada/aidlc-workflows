# angular — AIDLC plugin for Angular front ends

> A plugin of the `fork/custom-for-angular` branch of this fork. It adds
> Angular-specific practice to the AI-DLC workflow without editing `core/`, so
> the branch keeps taking upstream updates cleanly. With the plugin off, the
> install is bare core.

The practices come from an in-repository AI-DLC SDK for Angular front-panel
GUIs that ran a generate → gate → fix loop against a human-written acceptance
specification. What carried over, and what did not and why, is listed in
[ADOPTION.ja.md](ADOPTION.ja.md).

## What it adds

| Where | What |
| --- | --- |
| Team rules (`memory/rules.md`) | Angular house rules: the project's own Angular version, standalone + `OnPush` + `inject()` + signals + built-in control flow, REST through the project's API client wrapper, reuse before write, `data-ui-id` on every element a test or binding names, texts copied verbatim, which input decides what when inputs disagree, append-only shared wiring files, tests never weakened |
| Construction rules (`memory/phases/construction.md`) | The build → lint → unit-with-coverage loop until green, default thresholds 80/70/80/80, what each unit test covers |
| `functional-design` (contribution) | Step 4a: a `## UI Bindings` section in `frontend-components.md` — a YAML table binding each screen element (`ui-id`) to its operation (`operationId`), request mapping, states, transitions and per-error-kind outcomes |
| `code-generation` (contribution) | Step 2a: a `## Change Impact Map` in the plan with four zones (Reuse / Append-only / New-rebuild / Delete) and the Angular step order; Step 4a: what the developer delegation adds; the `angular-test-integrity` sensor |
| `build-and-test` (contribution) | Step 8a: the team's acceptance cases become one E2E test per case titled `[<case id>]`, selected by `data-ui-id`, REST mocked per case, expected values verbatim; Step 9a: run them, fix by failure class (Boundary / Design / API / Reuse / Test / Environment), stop after three rounds, write `angular-acceptance-results.json`; both sensors |
| `aidlc-developer-agent` (persona contribution) | A pointer to the Angular guide and the impact map |
| Knowledge | `aidlc-developer-agent/angular-implementation-guide.md`, `aidlc-quality-agent/angular-acceptance-gate-guide.md` |
| Sensors (advisory, at the gate) | `angular-test-integrity` scans the project's `*.spec.ts` / `*.test.ts` for `.skip`, `.only`, `xit`, `fit`, `test.fixme`, `waitForTimeout`, `force: true`; `angular-acceptance-gate` reads `angular-acceptance-results.json` (every case has a passing, non-skipped test, no unknown ids, case file unchanged) |

Advisory gate checks report their findings to the agent before the gate opens,
so the agent fixes them first; they never block the person.

## Install

The packager builds the plugin for every harness with the rest of the tree:

```bash
bun scripts/package.ts                    # emits dist/plugins/angular/<harness>/
bun dist/claude/.claude/tools/aidlc-plugin-validate.ts plugins/angular
```

Then install it like any AI-DLC plugin, e.g. in Claude Code:

```
/plugin marketplace add <this-repo-or-path>/dist/plugins
/plugin install aidlc-angular@aidlc-plugins
# start a fresh session: the SessionStart hook composes it
```

For Kiro and other hosts, see
[Authoring a Plugin §5](../../docs/harness-engineering/10-authoring-a-plugin.md).

## Test

```bash
bun scripts/package.ts
bun test plugins/angular/tests/plugin.test.ts
```

The tests run the content validator, the sensors' `main(argv)` contract and
verdicts, and compose the plugin into a Claude install to check that sensors,
scripts, knowledge, graph bindings, stage steps and team rules land.
