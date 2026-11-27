# Evidence and Coverage Guide for Reverse Engineering (codebase-atlas plugin)

The code knowledge base is read by agents that will change this code. A claim
that sounds right but is not in the code costs more than a gap, because nobody
re-checks it. This guide applies whenever you scan code for Reverse Engineering
or write its nine artifacts. It comes from Codebase Atlas, where specifications
generated from existing code were checked claim by claim against the source.

## 1. Every claim names the lines it rests on

- A claim about the code carries the location that shows it:
  `src/orders/OrderService.java:42` or a range `src/orders/OrderService.java:42-67`,
  repo-relative, in backticks. One location per claim is enough; pick the line
  that settles it (the declaration, the call, the configuration entry).
- Cite what you opened. A summary, a file name, a README, a comment or a search
  hit is where to look, not evidence: open the file and cite the line.
- A sensor checks that every cited file exists and has that line. It cannot
  check that the line says what you claim, so read the line before citing it.
- Tables (components, endpoints, dependencies, tables and their columns) carry
  a location per row.

## 2. Facts, inferences and UNKNOWN are kept apart

- **Fact**: the code shows it; cite it.
- **Inference**: you conclude it from facts; say "inferred from" and cite the
  facts. Never present an inference as a fact.
- **UNKNOWN**: the code does not settle it (behaviour decided by data, by an
  external system, by configuration not in the repository, by a runtime you
  cannot see). Write `UNKNOWN` with what you checked and what would settle it,
  for example `UNKNOWN: the retry limit comes from RETRY_MAX, which no file in
  the repository sets (checked config/, .env.example, deploy/)`. Never fill the
  gap with the likely answer.
- A claim about "all", "only" or "none" ("every endpoint requires auth", "no
  other caller") is made only after counting the whole population, and says
  what was counted. Otherwise write what you saw and mark the rest `UNKNOWN`.

## 3. The code as it is, not as it was meant to be

- **Two implementations of one purpose** (an old and a new data access layer,
  two payment flows) are recorded as two, with which entry points use which.
  Do not merge them into one "the system does X".
- **Scaffolding is not a feature**: a type, interface or route with no wiring
  or no implementation behind it is recorded as present but not working.
- **Configuration-driven behaviour** (dependency injection, reflection, routing
  tables, XML or annotation registration, feature flags) is followed to where it
  is wired. Do not describe it from the names alone.
- What looks like a defect is recorded as what the code does now, marked as a
  suspected defect, in `code-quality-assessment.md`. It is not silently
  corrected in the description.

## 4. Count the whole, then cover it

Coverage means every part of the code is accounted for, not that the main
parts were described.

- **The denominator comes first.** Before describing, list what there is:
  modules, entry points (screens, endpoints, jobs, message handlers, CLI
  commands), external boundaries (databases, queues, files, other services).
  When `aidlc atlas-graph build` produced a graph, its file list is the source
  file denominator; files graphify does not parse (configuration, SQL,
  templates, copybooks, job control) are listed from the code itself.
- **Count by role, not by one marker.** An entry point can be registered in
  several ways (an annotation, a routing file, a framework convention, a
  generated form). One search for one marker is never the full count: name the
  kinds of marker the stack uses and count each.
- **Check the count by a second route.** Where the stack has a declaration
  (a project file, a routing table, a schema) and the files on disk, count both
  and compare the sets, not just the totals: equal totals can hide one missing
  and one extra.
- **Assign everything.** Every source file belongs to a component (its
  `**Paths**:` line in `component-inventory.md`), or to `## Outside Components`
  with a reason, or to the developer's **Left out** list (build output and the
  other folders the code analysis guide skips). Depth may vary: an area can be
  skimmed, and Scan Coverage says so. Assignment may not: an unassigned file is
  a gap, and `atlas-coverage` reports it.
- **Do not narrow the scope silently.** When the scan cannot cover everything
  selected, say what was left and why in Scan Coverage; never call the scan
  full.
