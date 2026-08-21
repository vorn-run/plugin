---
name: vorn-workflows
description: Build, run and inspect Vorn workflows — multi-step agent pipelines with triggers, conditions, loops, approvals, and connectors that reach an issue tracker, a document store or a query. Use when a task should become repeatable automation, when wiring a connector into a pipeline, or when you need to check why a workflow run behaved as it did.
license: MIT
---

# Vorn workflows

A workflow is a graph of nodes Vorn executes: agents, scripts, conditions,
approvals. Reach for one when a sequence is worth repeating — otherwise just do
the work.

## Look before you build

```
list_workflows {}                          # optionally by workspace
list_workflow_runs { workflow_id? , task_id? }
get_workflow_schedule { workflow_id }      # execution log or next run
```

`list_workflow_runs` is the tool for "why did that behave that way." Each run
carries `status`, `startedAt`, `completedAt`, the `inputs` it ran with, and a
`nodeStates` array with per-node status. Read that before you theorise.

## Run one

```
execute_workflow { workflow_id, inputs? }
stop_workflow_run { run_id }
```

`inputs` supplies values for the parameters the workflow declares on its trigger
node; declared defaults fill in the rest.

## Build one

`create_workflow` takes **either** shape:

**Flat** — a trigger plus a list of actions. Use this for a straight line:

```
create_workflow {
  name,
  trigger,
  actions: [ ... ]
}
```

**Full** — `nodes` and `edges`, for anything with a branch, loop or approval:

```
create_workflow {
  name,
  nodes: [...],
  edges: [...],
  icon?, icon_color?, enabled?, stagger_delay_ms?
}
```

Node types: `trigger`, `launchAgent`, `script`, `condition`, `approval`,
`createTaskFromItem`, `callConnectorAction`.

Three rules that are easy to miss:

- **Give a node a `slug`** to reference its output downstream as
  `{{steps.<slug>.<field>}}`.
- **A headless `launchAgent` with an `outputSchema` returns typed fields**, which
  is what makes a downstream `condition` node able to test them. Without a
  schema you get text, and the condition has nothing to read.
- **Wire condition outcomes** with an edge `conditionBranch` of `"true"` or
  `"false"`. A condition node with unlabelled edges does not branch.

```
update_workflow { workflow_id, ... }
delete_workflow { workflow_id }
```

## Connectors

A connector is how a workflow reaches something outside Vorn — an issue
tracker, a document store, a query. It arrives two ways: as a **trigger** that
starts a workflow when an issue is filed or a query returns a row, and as a
`callConnectorAction` node that acts partway through one.

```
list_connectors {}                          # what exists, and what each offers
install_connector { connector_id, ... }     # creates a connection
list_connector_actions { connection_id }    # actions, with input schemas
run_connector_action { connection_id, action, args? }
```

**Actions belong to a connection, not to a connector.** A connector is the
integration; a connection is one configured instance of it, with its own
credentials and filters. Passing a connector id where a `connection_id` belongs
fails — `list_connections` is where the ids you can actually use come from.

Read `list_connectors` before assuming what is available: each entry carries its
own triggers, actions, required environment variables, and how it authenticates.
That answer is better than anything written here, because it reflects what this
machine has.

Call `list_connector_actions` before wiring a `callConnectorAction` node. The
action name and its arguments come from there, and a node built on a guessed
name fails at run time rather than at build time.

Secrets are refused by `install_connector` on purpose: encryption lives in the
desktop process, so a person enters them in Settings > Connectors. Everything
else about a connector can be installed without them.

## Move one between machines

```
export_workflow { workflow_id }   # absolute paths → {{project.path}}
import_workflow { ... }           # resolved against a registered project
```

Export rewrites absolute paths and local remote-host bindings so the file is
portable — commit it beside the code it drives.

## Gotchas

- **`list_workflow_runs` needs one of its two arguments.** Both read as
  optional, and calling it bare fails with "provide either workflow_id or
  task_id".
- **A contextual workflow cannot be exported.** Its nodes hold
  `{{context.projectName}}`, which is not a registered project, so export has
  nothing to make the paths relative to.
- **Connector triggers do not appear in `list_workflows`.** They run as
  workflows with ids like `connector:<connection>:<trigger>`, and only
  `get_workflow_schedule { info: "log" }` shows them. Asked why a connector did
  not fire, look there — `list_workflows` returning nothing is not evidence it
  does not exist.

## Designing one that works

Look at an existing workflow before writing your first. `list_workflows` then
read its nodes: the shape of a real one teaches more than the schema.

What separates a workflow that holds up from one that looks fine and is not:

- **Gate with a `script` node, not an agent's opinion.** Typecheck, tests and
  coverage either pass or they do not.
- **Then have an agent check the gate was satisfied honestly.** A test that
  executes a line and asserts nothing passes coverage and proves nothing.
- **Put an `approval` node before anything irreversible** — pushing, publishing,
  closing someone's issue.
- **Iterative loops accrete.** If a loop implements-then-reviews until it passes,
  add a cleanup step afterwards to delete what the loop left behind.
