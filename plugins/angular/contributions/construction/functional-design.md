---
target: functional-design
plugin: angular
adds:
  sensors:
    - angular-ui-bindings
fragments:
  - anchor: after-step:4
    order: 100
  - anchor: in:Sensors
    order: 100
---

## fragment: after-step:4

### Step 4a (angular): Bind each screen element to its operation and states

When this Unit writes `frontend-components.md`, add a `## UI Bindings` section
to it. HTML/CSS mock-ups and an API contract alone leave implicit which element
calls which operation, what the screen does while it waits, and what it shows
for each error; the implementer then guesses. The section makes those links
explicit with stable IDs, in a fenced ```yaml block that is the source of truth
for screen behaviour:

```yaml
apiSpecs: [<openapi file>]     # project-relative; omit to use the OpenAPI blocks of contract-summary.md
screens:
  <screen-id>:                 # kebab-case, unique
    route: /<path>
    requirements: [FR1, AC1.2.1]
    design: <mock-up file>     # project-relative, or a file of Refined Mockups
    states: [loading, editing, saving, saved, error]
    initial: loading
    onEnter: { call: <operationId>, success: { transition: editing }, errors: { default: { transition: error } } }
    static: [<decorative ui-ids>]
    elements:
      <ui-id>:                 # becomes data-ui-id="<ui-id>" in the markup
        kind: button           # button | toggle | input | select | indicator | text | list | container
        bind: body.<field>     # input -> request field
        validate: <rule>
        enabledWhen: "state == 'editing' && form.valid"
        visibleWhen: "<expression>"
        source: { call: <operationId>, poll: 5s, path: $.<field> }   # read-only displays
        map: { <value>: <css-class or label> }
        on:
          press:
            call: <operationId>
            request: { <request field>: form.<field> }
            transition: saving
            success: { transition: saved, show: <message id> }
            errors:              # one key per error kind the API returns, plus default
              validation: { transition: editing, show: fieldErrors }
              default:    { transition: editing, show: <message id> }
```

Rules for the section:

- Every `call` is an operation the contract names (its `operationId`, or the
  operation in `contract-summary.md`); every `transition` and `initial` is a
  declared state; every element a test will check has a `<ui-id>`.
- Each error response the contract declares for a called operation has an
  outcome under `errors` (or is covered by `default`, said in one line).
- When inputs disagree, this table decides behaviour, the mock-up decides
  presentation and the contract decides the wire format; record the
  disagreement under the Unit's assumptions rather than choosing silently.
- Use `functional-spec.md` for the state machine prose; this table names the
  same states, it does not redefine them.

## fragment: in:Sensors

The angular plugin adds `angular-ui-bindings` (advisory, at the gate, once per
Unit on `functional-spec.md`): it reads the `## UI Bindings` table of this
Unit's `frontend-components.md` and checks it against itself (ids, states,
transitions), the contract (`apiSpecs:` files or the OpenAPI blocks of
`contract-summary.md`: operation ids, request fields, response paths) and each
screen's mock-up (`data-ui-id`). A Unit without the table passes; a level whose
counterpart is missing is listed as not checked. Run it on demand with
`{{INVOKE}} angular-bindings-check <path to frontend-components.md>`.
