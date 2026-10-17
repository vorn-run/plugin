---
name: vorn-extensions
description: Build a Vorn extension end to end — the vorn-extension.toml manifest, permissions, events, storage, a program in any language over stdio JSON-RPC, UI as an element tree or a template, contribution points (sidebar, card badges and footers, panes, settings pages, commands, workflow steps and triggers, MCP tools, layouts), live development with vorn ext link, packing, the install sheet, and testing on the desktop, browser and terminal. Use when asked to extend Vorn, add something to its UI, add a workflow step or an MCP tool, or debug an extension.
license: MIT
---

# Vorn extensions

An extension is a folder with a `vorn-extension.toml`. Every package names one
API, `vorn:extension@0.9`; what else it is comes from a section:
`[connector]` (vorn-connectors), `[agent]` (vorn-agents), or neither.

Much of Vorn is built-in extensions a person switches on and off in
Settings › Extensions: Tasks, Connectors, Workflow steps and triggers, the
Workflow editor, Artifacts, Worktree cleanup, the Widget (off by default) and
each agent adapter. Yours sits beside them and runs as the person.

## Where its code runs

- **No program** — templates over rows nobody publishes, layouts, workflow
  files, an agent adapter. Data only.
- **A program, any language** — `[service] command` starts a long-lived
  process speaking JSON-RPC 2.0, one message per line, over stdin/stdout.
  `[actions.<id>] command` is a one-shot: it gets one `guest.handle` (id 1),
  answers, and exits.
- **A Wasm component** — the sandboxed form Vorn's own extensions are moving
  to. No released build runs one yet; write a program today.

## Manifest

```toml
id = "acme.exits"                 # lowercase, digits, . - _
name = "Exits"
version = "1.0.0"
api = "vorn:extension@0.9"
publisher = "Acme"
description = "Lists sessions that exited non-zero."

[service]
command = ["python3", "exits.py"]
events = ["session.created", "session.exited"]

[declares]
uses = ["sessions.read", "storage"]   # permissions; host.call is checked against them
network = ["api.acme.test"]           # the only hosts net.fetch reaches

[storage]
migrations = "migrations"             # .sql files, each run once, in name order

[[contributes.sidebar]]
id = "exits"
title = "Failed exits"
view = "views/exits.kdl"

[[contributes.commands]]
id = "clear"
title = "Clear Failed Exits"
call = "clear"                        # guest.handle("clear")
icon = "trash-2"

[mcp.failed_exits]
description = "List sessions that exited non-zero since Vorn started."
input = "mcp/failed_exits.json"       # optional JSON Schema
```

Parsing is strict: a misspelt key is an error naming the file, line and field.
Also available: `[activates]` (`agent`, `workspace_contains`, `remote_host`,
`platform`) so it shows only where it has something to say, `when = {…}` with
the same keys on any one contribution, `[icon] view_box/paths`,
`[build] command` (runs at install) and `[checks] command` (recorded checks,
run by `pack`).

## Permissions

`[declares] uses` lists what `host.call` may reach. Undeclared calls are
refused.

| Permission | Methods |
| --- | --- |
| `sessions.read` | `sessions.list`, `sessions.get`, `agents.list` |
| `sessions.launch` | `sessions.launch`, `sessions.close` |
| `terminal.read` / `terminal.send` / `terminal.selection` | `terminal.read`, `terminal.send`, `terminal.selection` |
| `card.rename` | `card.rename` |
| `agent.usage` / `agent.permissions` | `agent.usage` / `permissions.resolve` |
| `git.read` | `git.status`, `git.diff`, `worktrees.list` |
| `git.write` | `git.commit`, `worktrees.remove`, `worktrees.reclaim`, `worktrees.prune` |
| `files.read` / `files.write` | `files.read` / `files.write` |
| `secrets.read` | `secrets.get` |
| `tasks.read` | `task.list`, `task.get`, `project.list` |
| `workflows.write` | `workflow.fire` |
| `storage` | `storage.*` |

`network.tcp`, `auth.borrow`, `http.routes` and `process.run` are shown on the
install sheet but not enforced — a program runs as the person. On macOS,
`vorn ext sandbox <id> on` starts it with no network of its own, writing only
inside its folder.

## The protocol

Vorn sends: `guest.init {ctx: {id, version, vorn}}` (answer `null`), then
`guest.handle {method, args, ctx: {caller, project}}` (answer a result) and
`guest.on-event {batch: [{name, data}]}` (a notification). You send:
`host.call {method, args}`, `host.publish {collection, ops}`,
`host.log {level, message}`, `net.fetch {req, connection}`, and
`storage.prefix|query|exec|get|set`. Errors are
`{"code": -32000, "message": …, "data": {"code": "<stable code>"}}`.

```python
import json, sys

def send(msg):
    sys.stdout.write(json.dumps({"jsonrpc": "2.0", **msg}) + "\n")
    sys.stdout.flush()

names, failed = {}, {}
for line in sys.stdin:
    msg = json.loads(line)
    method, params, mid = msg.get("method"), msg.get("params") or {}, msg.get("id")
    if method == "guest.init":
        send({"id": mid, "result": None})
    elif method == "guest.on-event":
        for ev in params["batch"]:
            d = ev["data"]
            if ev["name"] == "session.created":
                names[d["sessionId"]] = d.get("agent") or "shell"
            elif ev["name"] == "session.exited" and d.get("exitCode"):
                row = {"id": d["sessionId"], "name": names.get(d["sessionId"], "?"), "code": d["exitCode"]}
                failed[row["id"]] = row
                send({"method": "host.publish", "params": {"collection": "exits", "ops": [{"upsert": row}]}})
    elif method == "guest.handle":
        if params["method"] == "clear":
            failed.clear()
            send({"method": "host.publish", "params": {"collection": "exits", "ops": ["clear"]}})
            send({"id": mid, "result": {"toast": "Cleared"}})
        elif params["method"] == "mcp.failed_exits":
            send({"id": mid, "result": list(failed.values())})
        else:
            send({"id": mid, "error": {"code": -32000, "message": "no such action",
                                       "data": {"code": "unknown-action"}}})
```

A `host.call` you send is answered on stdin with your id. Never print anything
else to stdout; log with `host.log` or stderr. A handle may answer
`{"toast": "…"}`, `{"open": "<dialog id>"}` or `null`.

**Events**: `session.created {sessionId, kind, projectPath, worktreePath,
agent, model?}`, `session.status {sessionId, status}`, `session.exited
{sessionId, kind, projectPath, exitCode}`, `session.mark`, `session.program`
(OSC 7501), `agent.hook {sessionId, event, tool?}`, `agent.conversation`,
`agent.permission`, `agent.permissionClosed`, `task.created`,
`task.statusChanged`, `worktree.idle`, `git.changed`. Batches keep only the
latest `session.status` and `git.changed`.

**Storage** (`storage` permission): `storage.get/set` for keyed JSON, or SQL
through `storage.query/exec` on your own tables. Every table name starts with
the prefix `storage.prefix` returns — the id escaped, so `acme.exits` owns
`x_acme_0exits_…` — and any other table is refused. The `.sql` files in the
`[storage] migrations` folder run once each, in name order.

## UI

### Element tree (the one model)

The element tree is how extension UI is drawn, on the desktop, in the browser
and in cells. Today a tree draws a **settings page**; Worktrees and
Connections are built that way. Every other point still takes a template
(below) until the tree reaches it.

```toml
[[contributes.settings]]
id = "exits"
title = "Exits"
icon = "history"
tree = true          # instead of view = "…"
```

Vorn calls `guest.handle("ui.render", {point, surface: {cells, width, height}})`.
Answer the tree and the token set it was made for:

```json
{ "tokens": 1, "tree": { "kind": "section", "title": "Failed exits", "children": [
  { "kind": "list", "id": "exits", "empty": "Nothing failed", "select": true,
    "bulk": [{ "kind": "button", "id": "forget", "label": "Forget", "style": "danger" }],
    "children": [
      { "kind": "entry", "id": "s1", "title": "api-tests", "detail": "exit 1",
        "status": "bad", "chips": ["agent: claude"],
        "more": [{ "kind": "button", "id": "rerun:s1", "label": "Run again" }] }
    ] }
] } }
```

Kinds: `box`, `text`, `icon`, `shape`, `button` (`confirm`), `field`
(`secret`), `choice`, `badge`, `notice`, `stat`, `meter`, `section`,
`toolbar`, `list`, `group`, `entry`, `board`, `column`, `divider`. Colours are
tones (`neutral`, `good`, `warn`, `bad`, `info`, `accent`), layout is `props`
(`row`, `gap`, `p`, `grow`, `between`…). Clicks, submits and selections arrive
as `guest.handle("ui.event", {point, event: {id, kind, value?, selected?}})`;
answer `{toast?, open?, patch?}`, where `patch` is `[{id, node?}]` to swap or
drop nodes without a full render. Every answer is checked against the same
schema; a tree that fails is refused with its errors.

### Templates (frozen)

KDL templates (`vorn:view@1`, files under `views/`) are frozen: no new nodes
or features, and support will be removed. For now they are the only way to
draw every point other than a tree settings page; use a tree wherever one
works. A template declares the rows it reads and draws
them; the program fills them with `host.publish`:

```kdl
schema "vorn:view@1"

rows "exits" {
    name string
    code number
}

column when="{exits.count}" {
    list "exits" {
        row {
            text "{row.name}" grow=#true
            text "exit {row.code}" role=mono
            button Clear call="clear"
        }
    }
}
```

`examples/extensions/turns` in the Vorn repo has one for every point.

## Contribution points

| Point | What it is |
| --- | --- |
| `sidebar`, `views` | a sidebar section; a full view |
| `badges`, `card_footers`, `decorations` | per session card (rows keyed by session id) |
| `panes` | beside the terminal: `view`, a `web` page under `web/`, or a `command` |
| `composer`, `launchers` | the new-session composer; a launcher entry |
| `settings`, `windows`, `dialogs` | a settings page; a window (`size`); a dialog |
| `commands`, `menus` | palette commands (`key`, `call`, `window`); menu items (`menu = "card"`) |
| `attention` | items asking for the person |
| `nodes`, `triggers`, `workflows` | workflow step types, trigger types, shipped workflow files |
| `layouts` | `file = "layouts/dev.toml"` |
| `[mcp.<tool>]` | an MCP tool, listed as `<id>__<tool>` (`.` and `-` become `_`) and called as `guest.handle("mcp.<tool>")` |

A workflow step type:

```toml
[[contributes.nodes]]
id = "shout"
title = "Shout"
category = "steps"
config = "nodes/shout.json"                   # JSON Schema; the editor draws its form
outputs = [{ field = "output", description = "The text, in capitals" }]
```

Vorn calls `guest.handle("workflow.node.shout", {config, node, …})` with every
template filled in; answer `{status: "success"|"error"|"skipped"|"waiting",
output?, logs?, error?, structuredOutput?}`. A trigger type is
`[[contributes.triggers]]` with `timing = "cron"|"once"|"webhook"`, or fired by
the program with `host.call("workflow.fire", …)` (`workflows.write`).
`[[contributes.workflows]] file = "workflows/x.toml"` ships a workflow, added
once at install.

## Develop, pack, ship

```bash
vorn ext link ./exits        # runs it from the folder; templates reload on save
vorn ext list                # id, version, running/stopped, sandboxed, source
vorn ext remove acme.exits
```

A template mistake shows in the place it would draw, with file, line and
column. After changing the program or the manifest, run `vorn ext link` again:
it stops the program, and the next use starts the new one.

Test it on every surface — the same contribution draws in the desktop app, in
the browser (`vorn web`), and in the terminal (`vorn`, drawn in cells). A tree
in cells hides entry icons and moves hover actions into `more`, so check a
page there before calling it done.

```bash
vorn ext pack ./exits --out exits.tar.gz   # validates, runs [checks], lists the bundle
```

Ship it as a git repository. People install with:

```bash
vorn ext install https://github.com/acme/vorn-exits [--branch v1.0.0]
```

It also takes an absolute path: a git checkout is cloned, a plain folder
copied. Either way Vorn reads it with hooks off and shows a sheet — publisher,
every command it runs, the hosts it reaches, the Vorn methods it asks for, what
it adds — and installs only when the person types its id. `--confirm <id>` exists for a script that has
already shown the sheet; never use it to skip the person. In the app:
Settings › Extensions › Install from a repository.

## Gotchas

- **stdout is the protocol.** One stray print breaks the program.
- **Undeclared calls are refused**, not ignored — `denied` names the permission.
- **An MCP tool needs a `[service]`**, and its description is what an agent
  reads to pick it; make it say when to use it.
- **`vorn ext pack` refuses `agent = [...]` naming anything but `shell`** in
  `[activates]` or `when` (through 0.8.0-beta.15): the command does not
  load the agent adapters. `vorn ext link` checks it against the running server.
- **A list that selects needs an `id`**; the tree check refuses one without.
- **Built-in-only methods** (`task.importItems`, `workflow.seed`, `inbox.*`,
  `signin.*`…) are refused for installed extensions.
