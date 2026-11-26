# Angular Implementation Guide (angular plugin)

How to turn a Unit's design into Angular code an agent gets right the first
time. Applies when the workspace has an `angular.json` (or an Nx workspace with
Angular projects). The project's own conventions win where they differ.

## Inputs and who decides what

| Input | Decides |
| --- | --- |
| Mock-up HTML/CSS (Refined Mockups or the team's design files) | Structure, texts, classes, look |
| API contract (OpenAPI or `contract-summary.md`) | Paths, methods, request and response types, error codes |
| `## UI Bindings` in `frontend-components.md` | Which element calls which operation, request mapping, response to display, states, error handling |

Each kind of information has one owner and the owners are linked by stable IDs
(`data-ui-id`, `operationId`, requirement and case IDs), not by prose. When two
inputs disagree, follow the owner above and record the disagreement as an
assumption.

## Per screen

1. **Types and API service.** `<resource>.model.ts` with interfaces from the
   contract schemas; `<resource>-api.ts` with one method per operation, built on
   the project's API client wrapper (never a feature-level `HttpClient`), so
   errors arrive as the project's typed error.
2. **Page component.** `<feature>-page.ts`, standalone, `OnPush`, `inject()`.
   - The template reproduces the mock-up's structure, texts and classes; copy
     the mock-up CSS into the component styles, keeping design tokens. Every
     `data-ui-id` of the mock-up appears exactly once.
   - State is a `signal` over the declared states, starting at `initial`;
     `onEnter` runs on init.
   - `bind` maps to a form control, `validate` to a validator,
     `enabledWhen` / `visibleWhen` to `computed` signals.
   - `on` actions call the API method with the `request` mapping, set the
     pending `transition`, then apply `success` or the `errors.<kind>` /
     `errors.default` outcome. `show: fieldErrors` shows each field error under
     its field.
   - `source` with `poll` polls while the screen is shown and stops on destroy;
     `map` turns a value into a CSS class or label.
   - Built-in control flow (`@if`, `@for` with `track`), not `*ngIf` / `*ngFor`.
3. **Wiring (append-only).** Add the route with `loadComponent`, and a menu
   entry when the requirements ask for one, by appending lines.
4. **Unit tests next to each file** (`<name>.spec.ts`).
   - API service: every operation, the request body, each error kind.
   - Page: initial load, each action's success path, each bound error kind,
     validation, `enabledWhen` / `visibleWhen`, polling start and stop. Query
     by `[data-ui-id="..."]`. In a zoneless app, `await fixture.whenStable()`
     after each change.
   - HTTP through `provideHttpClient()` and `provideHttpClientTesting()`,
     asserting with `HttpTestingController` (`expectOne`, `flush`, `verify`).
   - Replace device or platform services with small fakes in `providers`.

## Verify until green

Run the project's build, lint and unit tests with coverage (for an Angular CLI
project `ng build`, `ng lint`, `ng test --coverage`, or their `npm run`
wrappers) after each file set. Default thresholds: statements 80, branches 70,
functions 80, lines 80.

## Never

- Edit a Reuse-zone file, or remove or reorder a line in an Append-only file.
- Invent an operation, field or text that is not in the inputs.
- Skip or focus tests (`.skip`, `.only`, `xit`, `fit`), lower a threshold, or
  add `eslint-disable` to pass lint.
- Upgrade Angular, TypeScript or the test runner as part of a feature: Angular
  pins the TypeScript minor, so they move together in a change of their own.

## The Angular CLI MCP server

When the project has the `angular-cli` MCP server (added by the person with
`aidlc angular-mcp`), it runs the project's own Angular CLI on this machine,
read-only and offline. Use it for facts the CLI knows better than a general
guide:

| Tool | Use it to |
| --- | --- |
| `list_projects` | Find the workspace (`angular.json` path), the application or library a Unit belongs to, its source root and the Angular version; call it first |
| `get_best_practices` | With the workspace path from `list_projects`, read the best-practices guide for the installed Angular version before planning or writing code; where it differs from this guide, it wins |
| `onpush_zoneless_migration` | See which components are not yet `OnPush` or depend on zone.js, before touching change detection |

Builds, tests and the dev server are still run with the project's own commands,
so their output is the stage's evidence. Without the server, this guide and the
project's code are the sources.
