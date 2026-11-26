## Angular house rules

- Follow the Angular version, build tool and test runner the project already uses; never upgrade or swap them as part of a feature.
- Standalone components, `ChangeDetectionStrategy.OnPush`, `inject()` instead of constructor injection, signals and `computed` for state, `input()` / `output()` functions, built-in control flow (`@if`, `@for` with `track`). When the project is zoneless, keep it zoneless.
- REST calls go through the project's own API client wrapper and its typed error, never a feature-level `HttpClient`, when such a wrapper exists. One API service per resource, one method per OpenAPI `operationId`.
- Reuse before you write: a shared service, component or token that already exists is imported, not copied or edited.
- Every element a test or a binding refers to carries `data-ui-id="<ui-id>"`, exactly once per screen; tests select elements by that attribute only.
- UI texts (labels, messages) are copied verbatim from the design or the binding table; nothing is invented.

## Inputs that disagree

- The UI binding table decides behaviour (what an element triggers, states, error handling), the design HTML/CSS decides presentation, the OpenAPI document decides the wire format. Record any gap as an assumption in the plan instead of guessing.

## Shared wiring files are append-only

- Route tables, app config providers and menu lists are edited by appending lines; existing lines are never removed, reordered or rewritten in a feature change.

## Tests are not weakened

- Never `.skip`, `.only`, `xit`, `xdescribe`, `fit`, `fdescribe` or `test.fixme`; never lower a coverage threshold; never add `eslint-disable` to get past lint.
- An expected value that comes from a human-written acceptance case is right by definition: fix the code, or the test's selector or waiting, never the expectation.
