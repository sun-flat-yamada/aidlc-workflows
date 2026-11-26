---
target: reverse-engineering
plugin: angular
fragments:
  - anchor: after-step:2
    order: 100
---

## fragment: after-step:2

### Step 2a (angular): Angular workspace facts from the Angular CLI

For a scanned repository with an `angular.json`, and when the `angular-cli`
MCP server is available (added with `{{INVOKE}} angular-mcp`; it runs the
repository's own Angular CLI on this machine, read-only and offline), brief the
developer to take the workspace facts from it rather than inferring them:

- `list_projects`: every application and library, its type, root, source root
  and selector prefix. Record them in the scan results as the project map.
- `onpush_zoneless_migration`, called on the main application's source root:
  which components are not yet `OnPush` or still depend on zone.js. Record the
  result as change-detection debt, a fact about the code, not a task.

Without the server, the developer reads `angular.json` and the components
directly. Either way, name the Angular and TypeScript versions from the
repository's `package.json`.
