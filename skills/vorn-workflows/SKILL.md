---
name: vorn-workflows
description: Write, run and debug Vorn workflows — repeatable pipelines of agents, scripts, conditions, loops, approval gates and connector actions, kept as TOML files in the project's .vorn/workflows folder or built through MCP. Use when a task should become repeatable automation, when adding a gate a person approves, when wiring a connection into a pipeline, or when you need to find out why a run behaved as it did.
license: MIT
---

# Vorn workflows

A workflow is one trigger and a graph of steps that Vorn's server runs — with
or without the app open. Reach for one when a sequence is worth repeating, and
gate it with checks rather than an agent's opinion.

> **Version note.** TOML workflow files, a script's `json` output and parallel
> loops are in the next Vorn build, not in 0.8.0-beta.14. Until then Vorn reads
> `.kdl` workflow files; `vorn workflow --help` names the extension `check`
> takes on the build you have.

## Where a workflow lives

- **A file in its project**: every `.toml` in `<project>/.vorn/workflows/`.
  Vorn watches the folder, runs what it finds, and writes editor changes back,
  keeping comments. Delete the file and the workflow goes. **Save to project**
  in a workflow's menu turns a stored one into a file.
- **Stored in Vorn**: made in the editor or with `create_workflow`.

Prefer a file for anything a project depends on: it is reviewed and versioned
with the code.

## A file

```toml
# Triage open issues: an agent reads each, a person approves the plans.
name = "Triage issues"
id = "triage-issues"
enabled = true

[trigger]
id = "start"
type = "manual"

[[trigger.inputs]]
key = "repo"
label = "Repository"
type = "text"
required = true

[[step]]
id = "fetch"
type = "script"
slug = "fetch"
scriptType = "bash"
scriptContent = """
gh issue list --repo {{inputs.repo}} --state open --limit 20 --json number,title,body --jq '{items: .}'
"""

[[step]]
id = "any"
type = "condition"
variable = "{{steps.fetch.json.items.length}}"
operator = "notEquals"
value = "0"

[[step]]
id = "each"
type = "loop"
slug = "each"
needs = ["any:true"]
mode = "forEach"
items = "{{steps.fetch.json.items}}"
bodyNodeIds = ["triage"]
parallel = true
concurrency = 3

[[step]]
id = "triage"
type = "launchAgent"
slug = "triage"
agentType = "claude"
headless = true
projectName = { "@project-name" = "app" }
projectPath = { "@project" = "." }
prompt = "Issue #{{loop.item.number}}: {{loop.item.title}}\n\n{{loop.item.body}}\n\nPlan a fix in two lines."

[[step]]
id = "approve"
type = "approval"
slug = "approve"
message = "Plans, one per issue:\n{{steps.each.outputs}}"
```

- A step has `id`, `type`, `label`, `slug`, `onError`, `x`, `y`, `needs`, and
  beside them its settings (what the editor's panel shows).
- A step runs after the one before it unless it says what it `needs`. Several
  ids wait for all. `"any:true"` / `"any:false"` follow a condition's branch;
  `needs = []` starts a step with nothing before it.
- Multi-line text goes in `"""`; use `'''` when it holds backslashes.
- Portable references: `{ "@project" = "src/app" }` is a path in the file's
  project, `{ "@project" = "." }` the project itself, `{ "@project-name" = "web" }`
  its name, and `connectionId = { "@connection" = "eng-tracker" }` a connection
  by name, so the file runs against whoever's connection has that name.
- TOML has no null: `{ "@json" = "null" }`. Keys starting with `@` are the
  format's own.

Check a file before you rely on it:

```bash
vorn workflow check .vorn/workflows/*.toml
# triage.toml:14:1: needs `fetch`, which no step here is
```

It names each mistake by file, line and column, the step types and connections
this machine lacks, and hints at misspelt step fields. Exits 1 on any mistake.

## Steps and triggers

Every step and trigger type is declared by an extension. What a fresh install
has:

| From | Steps | Triggers |
| --- | --- | --- |
| the engine | `condition`, `approval`, `loop` | |
| Workflow steps and triggers (built-in) | `launchAgent`, `script`, `httpRequest` | `manual`, `recurring` (cron), `once`, `sessionRestored`, `webhook` |
| Tasks (built-in) | `createTaskFromItem` | `taskCreated`, `taskStatusChanged` |
| Connectors (built-in) | `callConnectorAction` | `connectorPoll` |

Built-ins can be switched off in Settings › Extensions. A step whose extension
is off fails with a message naming the extension to turn on; the workflow is
kept. Installed extensions add types of their own (vorn-extensions), each run
by calling the extension with the step's filled-in config.

Read the schema rather than guessing a field:

```
describe_workflow_nodes { types?: ["loop", "approval"] }
```

It returns each core type's config schema, outputs, the rules the checker
enforces, the edge schema, limits, template namespaces and a full example.

## Templates

`{{namespace.path}}` anywhere a setting takes text:

- `{{steps.<slug>.<field>}}` — an earlier step's output (give the step a `slug`)
- `{{inputs.<key>}}` — a manual run's inputs
- `{{task.title}}`, `.description`, `.branch`… — the task a task trigger fired for
- `{{trigger.*}}` — status change, restore, or a webhook's body, headers, query
- `{{connectorItem.title}}`, `.body`, `.externalId`, `.externalUrl`
- `{{context.cwd}}`, `.projectPath`, `.branch`, `.worktreePath` — a contextual run
- `{{loop.item}}`, `{{loop.item.<field>}}`, `{{loop.index}}` (0-based),
  `{{loop.number}}` (1-based), `{{loop.count}}` — inside a loop only

**Typed agent output.** A headless `launchAgent` with an `outputSchema` (JSON
Schema) returns each top-level property as `{{steps.<slug>.<field>}}`; a
`condition` can then test `{{steps.review.approved}} equals true`. Without a
schema you get text.

**A script's JSON.** When everything a script prints is one JSON value, read
into it: `{{steps.fetch.json.items}}`, `.json.items.0.title`,
`.json.items.length`. `{{steps.fetch.output}}` stays the raw text. Colours are
stripped first, so `jq` output works.

## Loops

A `loop` owns the steps in `bodyNodeIds`. Wire it: loop → the body's entry
steps, body steps to each other, the body's last steps → the step after.

- `mode = "repeat"` runs up to `maxIterations` (1–10), stopping early when
  `until` holds.
- `mode = "forEach"` runs once per item of `items`, a template naming a list.
  No cap.
- `parallel = true` (forEach only) runs items side by side, `concurrency` at a
  time (default 4, max 16). Each item shows as its own row ("Triage · item 3").
  Results keep list order; one failing item stops the ones not yet started.
  `until` is not allowed.

After the loop: `{{steps.<loop>.results}}` (per pass: item, status, every
step's output) and `{{steps.<loop>.outputs}}` (each pass's last output). A body
cannot hold an approval, a trigger or another loop, and nothing outside may
point into it. A failing body step ends the loop unless it has
`onError = "continue"`.

## Approval gates

An `approval` pauses the run until a person decides — in the app, beside agents
asking for permission, or through `resolve_gate`.

- `message` — the question. `view` — a review page (HTML, or a `.html` path)
  the reviewer can comment on.
- `edit` — text the reviewer may rewrite; later steps read
  `{{steps.<gate>.text}}`. When it expands to a JSON list of records the
  reviewer gets a table and `{{steps.<gate>.items}}` is the rows they kept,
  ready for a `forEach` loop.
- `feedback = { from = "<earlier step id>", maxRounds = 3 }` lets the reviewer
  send the work back with a comment: everything from that step re-runs, reading
  `{{steps.<gate>.feedback}}` and `{{steps.<gate>.comments}}`.
- A reject ends the run.

```
list_workflow_runs {}                 # no filter: runs parked on a gate, and what each asks
resolve_gate { run_id, decision: "approve" | "reject" | "changes", comment?, edited?, comments?, node_id? }
```

`changes` needs a `comment`. Read what you are approving first; approve only
what a person asked you to.

## Run and inspect

```bash
vorn workflow list [--json]
vorn workflow run "Triage issues" --input repo=acme/web [--wait] [--json]
vorn workflow runs --workflow "Triage issues" --limit 5 --json
vorn workflow stop <run>
```

`run` returns once the run is queued; `--wait` stays until it ends, shows its
progress, and fails when the run does.

```
list_workflows { workspace_id? }
execute_workflow { workflow_id, inputs? }
list_workflow_runs { workflow_id?, task_id?, limit? }   # status, inputs, nodeStates per step
get_workflow_schedule { workflow_id?, info?: "log" | "next_run" }
stop_workflow_run { run_id }
```

Asked why a run did what it did, read its `nodeStates` before theorising.

## Build one through MCP

`create_workflow { name, nodes, edges }` for a full graph (or `trigger` +
`actions` for a straight line of agents). Edges carry `conditionBranch:
"true" | "false"` out of a condition. `update_workflow { workflow_id, … }`
replaces `nodes` and `edges` whole, so read, edit, send the full list.
`delete_workflow { workflow_id }`. Each node's config is checked against its
schema, so a wrong field name is refused with its path.

`export_workflow { workflow_id }` makes a portable JSON (paths become
`{{project.path}}`, connections become requirements);
`import_workflow { workflow, project_name, bundle? }` brings it back and
rebinds connections it can match. For a project, a TOML file is simpler.

## Connections in a workflow

`callConnectorAction` runs an action of a connection:
`connectionId` (from `list_connections`, or `{ "@connection" = "name" }` in a
file), `action` and `args` (from `list_connector_actions`), every arg a
template. A `connectorPoll` trigger starts a run per new item, read as
`{{connectorItem.*}}`. Writing and installing connectors: vorn-connectors.

## Gotchas

- **Connector triggers do not show in `list_workflows`.** A connection's poll
  runs as a workflow with id `connector:<connection>:<trigger>`; look in
  `get_workflow_schedule { info: "log" }`.
- **A contextual workflow cannot be exported**: its `{{context.*}}` has no
  project to make paths relative to.
- **`httpRequest` succeeds on a 4xx or 5xx.** Test
  `{{steps.<slug>.output}}`; only a network error or the 30 s timeout fails it.
- **A script's non-zero exit fails the step.** Keep templated values as data
  (a quoted heredoc), not code.

## Designing one that holds up

- Gate with a `script` (typecheck, tests) rather than an agent's opinion — then
  have an agent check the gate was satisfied honestly.
- Put an `approval` before anything irreversible: pushing, publishing, closing
  someone's issue.
- Iterate-until-pass loops accrete; add a cleanup step after them.
- Read an existing workflow (`list_workflows`, or a file in `.vorn/workflows/`)
  before writing your first.
