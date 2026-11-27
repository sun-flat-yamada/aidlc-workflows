# codebase-atlas — AIDLC plugin for evidence-backed Reverse Engineering

> A plugin of the `fork/custom` branch of this fork. It brings the checks of
> [Codebase Atlas](https://github.com/sun-flat-yamada/codebase-atlas) (a
> framework that turns existing code into specifications for AI agents) into
> AI-DLC's Reverse Engineering stage, without editing `core/`, so the fork keeps
> taking upstream updates cleanly. With the plugin off, the install is bare core.

AI-DLC's Reverse Engineering writes a code knowledge base (nine artifacts per
repository) that later stages trust. Codebase Atlas showed two things that an
agent's own "done" does not guarantee: that each claim is in the code, and that
no part of the code was left out. This plugin makes both checkable. What carried
over, and what did not and why, is in [ADOPTION.ja.md](ADOPTION.ja.md).

## What it adds

| Where | What |
| --- | --- |
| `reverse-engineering` Step 1a (contribution) | `aidlc atlas-graph build --repo <repo>` before the scan: graphify (tree-sitter AST, ~40 languages, no LLM, offline) counts the repository's source files into `aidlc/codebase-atlas/graph/<repo>/`. Optional: without graphify the person hears one line and the stage goes on |
| `reverse-engineering` Step 2a (contribution) | The developer brief: the evidence guide, and the graph's file list as the denominator every file of which ends in a component, Outside Components or **Left out** |
| `reverse-engineering` Step 3a (contribution) | A `**Paths**:` line per component in `component-inventory.md` and an `## Outside Components` section; `path:line` citations in the other artifacts; `aidlc atlas-graph check` on the staged candidate before `codekb-publish` (at most three rounds); `kind: full` only with no unassigned file |
| Knowledge `aidlc-developer-agent/atlas-evidence-guide.md` | Every claim names its `path:line`; fact, inference and `UNKNOWN` kept apart; universal claims only after counting; old and new implementations, scaffolding and configuration-driven wiring recorded as they are; count by role with more than one marker, check the count by a second route, assign every file |
| Sensor `atlas-citations` (advisory, at the gate) | Every `path:line` an artifact cites names a file of the repository and a line it has; an evidence artifact with no citation is a warning |
| Sensor `atlas-coverage` (advisory, at the gate) | On `component-inventory.md`: every source file graphify counted (less AI-DLC's own install) matches a component's `**Paths**:` or Outside Components. No graph: reported as not run, passes |
| Command `aidlc atlas-graph` | `build` (above) and `check [--repo <repo>] [--codekb <folder>] [--json]`, the two sensors' checks over a whole folder (exit 1 on findings) |

Advisory gate checks report their findings to the agent before the gate opens,
so the agent fixes them first; they never block the person.

## graphify

Install it (Python 3.11+) at the commit this plugin was tested with, the same
pin as Codebase Atlas's `GRAPHIFY_TESTED_REF`:

```bash
uv tool install git+https://github.com/sun-flat-yamada/graphify@14f35e381cab8d0ae10824a336114a907c288146
```

`atlas-graph build` runs it with `GRAPHIFY_BACKEND=none`: graphify otherwise
names its communities with an LLM when it finds an API key or the `claude` CLI,
and the count must stay local. It respects the repository's `.gitignore`, and
the build checks that the source's `git status` is the same before and after.
The graph is a second count, never evidence: claims still cite the source.

## Install

```bash
bun scripts/package.ts                    # emits dist/plugins/codebase-atlas/<harness>/
bun dist/claude/.claude/tools/aidlc-plugin-validate.ts plugins/codebase-atlas
```

Then install it like any AI-DLC plugin, e.g. in Claude Code:

```
/plugin marketplace add <this-repo-or-path>/dist/plugins
/plugin install aidlc-codebase-atlas@aidlc-plugins
# start a fresh session: the SessionStart hook composes it
```

For Kiro and other hosts, see
[Authoring a Plugin §5](../../docs/harness-engineering/10-authoring-a-plugin.md).

## Test

```bash
bun scripts/package.ts
bun test plugins/codebase-atlas/tests/plugin.test.ts
```

The tests run the content validator, the sensors' `main(argv)` contract, the
citation, inventory and graph readers, both checks on a fixture knowledge base,
the `check` command, and compose the plugin into a Claude install to check that
the sensors bind to Reverse Engineering and the three steps land before its
Completion Handoff.
