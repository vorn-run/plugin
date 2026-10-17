---
name: vorn-agents
description: Add a coding agent CLI to Vorn as an adapter — an extension whose [agent] section says, as data, how to find, launch, resume and run it headless, list its models, read its past sessions, and tell its status from OSC 7501 reports, hooks or screen rules. Use when asked to support a new agent CLI in Vorn, fix how Vorn detects an agent's status, or change how an agent launches or resumes.
license: MIT
---

# Agent adapters

Vorn runs every agent CLI through an adapter: a package whose
`vorn-extension.toml` has an `[agent]` section. Usually no program at all.
Vorn's own (claude, copilot, codex, opencode, gemini, and hermes, off by
default) live in `packages/core/crates/adapters/agents/<id>/` in the Vorn repo,
in this same format, and are switched on and off in Settings › Extensions.
Read one of them before writing yours.

## The package

```
acme-adapter/
  vorn-extension.toml
  icon.svg
  fixtures/status/          # recorded screens, one per state
```

```toml
id = "example.acme"
name = "Acme"
version = "1.0.0"
api = "vorn:extension@0.9"
description = "Runs the Acme coding agent."

[agent]
id = "acme"                  # the agent type sessions carry; lowercase, digits, dashes; not "shell"
name = "Acme Code"           # Settings and the launcher
label = "Acme"               # menus, palette, task board
short_name = "Acme"          # workflow steps
description = "Acme CLI"
url = "https://acme.example/docs"
install = "npm install -g acme-cli"
icon = "icon.svg"
mark = "▲"                   # one character where only text is drawn
color = "#ff7a45"
tint = "#ff7a4520"

[agent.launch]
command = "acme"                    # found on PATH
args = []
headless_args = ["--yes"]           # instead of args when headless
prompt = ["--prompt", "{prompt}"]   # omit when the prompt is a plain argument

[agent.resume]
args = ["--resume", "{id}"]         # back to conversation {id}
pin = ["--session-id", "{id}"]      # start a new one under an id Vorn picks
selectors = { with_value = ["--resume", "--session-id"], bare = ["--continue"] }

[agent.headless]                    # the prompt goes to stdin
prompt = ["--print"]
no_prompt = ["--print", ""]
resume = ["--resume", "{id}"]

[agent.models]
flag = "--model"

[agent.models.list]
args = ["models"]
lines = '^[^\s/]+/\S+$'             # each matching line is a model id

[agent.history]
activity = "turn"

[agent.history.jsonl]
file = "~/.acme/history.jsonl"
session = "sessionId"
project = "cwd"
time = "timestamp"
title = "prompt"
```

More, when the CLI has it:

- `[agent.resume] at = "start"` with `selectors = { subcommand = "resume" }`
  for `acme resume <id>`; no `pin` but a database → `[agent.resume.capture]
  db`, `query` (`?1` is the session's directory, lowercase, forward slashes).
  No resume by id at all → leave `[agent.resume]` out.
- `[agent.headless] resume_tail` replaces the ending of a resumed run;
  `stream = true` with a `[service]` lets a program read a JSON event stream
  (`guest.handle("agent.stream", {session, lines})` → `{conversation?, events?}`).
- `[agent.models.list]` can instead be a JSON-lines exchange: `steps` of
  `send`, `reply`, `fail`, `require`, `models`, `next`, `cursor`, read through
  `[agent.models.list.choice]` (`id`, `label`, `description`, `skip`).
- `[agent.history.sqlite]` or `[agent.history.json_files]` instead of `jsonl`.
- `[agent.env] strip`, `strip_prefixes` — variables the agent sets inside its
  own sessions, kept out of everything Vorn starts.
- `[agent.usage]` — where a transcript records context use.
- `[agent.mcp] commands`, `note` — how the person connects the agent to Vorn's
  tools, shown in Settings › Skills & MCP.

Paths start with `~`, `/`, `{data}` or `{env:NAME|fallback}`, and never hold
`..`.

## Status: three sources, in order

What a card shows comes from the first that speaks:

1. **OSC 7501** — the CLI reports itself (`state=working|blocked|idle|done|error`,
   see vorn-terminals). Best when the CLI can do it: exact, and no guessing.
   While it reports, nothing else is read.
2. **Hooks** — the CLI calls Vorn on its own events.
3. **Screen rules** — patterns over the last screen. The fallback for a CLI that
   says nothing.

**Hooks**, one of two ways:

```toml
[agent.hooks.settings]              # HTTP hooks merged into the agent's JSON settings while Vorn runs
file = "~/.acme/settings.json"
events = ["PreToolUse", "PostToolUse", "Stop", "Notification", "PermissionRequest", "SessionStart", "SessionEnd"]
own_status = { since = "3.0.0", events = ["SessionStart", "PermissionRequest"] }
```

`own_status` says from which CLI version it reports OSC 7501 itself, and the
only hooks Vorn still needs from then on.

```toml
[agent.hooks.file]                  # a hooks file of Vorn's own, whose scripts post each event
path = "{env:ACME_HOME|~/.acme}/hooks/vorn.json"
session = "acme-{terminal}"
events = [["sessionStart", "SessionStart"], ["preToolUse", "PreToolUse"]]
```

**Screen rules** — first match wins, statuses `working`, `waiting`, `idle`:

```toml
[[agent.status]]
status = "waiting"
rows = [-20, -1]                    # the last 20 rows
any = ['Allow this command\?']

[[agent.status]]
status = "working"
rows = [-10, -1]
any = ['(?i)esc to cancel']

[[agent.status]]
status = "idle"
rows = [-6, -1]
any = ['^\s*> ']
```

A rule may also use `all`, `none`, `cursor_rows`, `cursor = "visible"|"hidden"`
and `title`. Order rules from most to least specific: a permission prompt
usually also matches the idle prompt.

Record a screen for every state beside the rules,
`fixtures/status/<state>-<name>.toml`:

```toml
status = "waiting"
screen = '''
 Allow this command?
   rm -rf build/
 1. Yes   2. No
'''
```

## Try it

```bash
vorn ext link ./acme-adapter
vorn session start --agent acme --prompt "say hello"
vorn session wait acme --status idle --timeout 2m
```

It appears in the launcher, the agent and model pickers, Settings › Coding
Agents and Skills & MCP. Removing the package takes it out. Test each state on
a real screen: start it, make it ask for a permission, let it finish, and watch
the card (or `vorn events --filter session.status`).

An adapter is an extension, so it can also draw on its own cards — a card
footer with `when = { agent = ["acme"] }` (vorn-extensions;
`examples/extensions/agent-footer` in the Vorn repo).

## Gotchas

- **Do not guess flags.** Read the CLI's `--help` and record what it prints;
  an adapter that passes a flag the CLI lacks fails at launch.
- **`selectors` must match what a person may already have configured**,
  or Vorn adds a second `--resume`.
- **Screen rules break when the CLI's UI changes.** Prefer OSC 7501 or hooks
  whenever the CLI offers either, and keep the recorded screens current.
