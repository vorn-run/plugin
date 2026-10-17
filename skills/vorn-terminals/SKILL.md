---
name: vorn-terminals
description: Open and drive Vorn sessions and terminals from the command line or MCP — start an agent, read its screen, send it input, wait for it to exit or go idle, stream events, open saved layouts, and make a script report its progress on its card with OSC 7501. Use when you need to run or watch something in another terminal, wait on a session, script Vorn, or give a long-running command a status Vorn can show.
license: MIT
---

# Driving terminals

Two ways in, same server underneath:

- **`vorn` command** — installed with Vorn, on PATH. Starts a server if none is
  running. Best in scripts: real exit codes, and `wait` blocks on events instead
  of polling.
- **MCP tools** — `launch_session`, `read_session_output` and friends, for use
  mid-turn without a shell.

Your own session's id is in `$VORN_SESSION_ID`.

## Start an agent

```bash
vorn session start --agent claude --prompt "fix the failing parser test" \
  --worktree --name parser-fix
vorn session start --agent codex --headless --wait --prompt "summarise CHANGES.md"
```

Options: `--prompt`, `--project <name>`, `--path <dir>` (default: this git
root), `--branch`, `--worktree`, `--headless`, `--wait` (with `--headless`:
stay until it ends), `--name <label>`. It prints the new id; `--json` prints the
record.

`--agent` takes any agent switched on in Settings › Extensions. Vorn ships
`claude`, `copilot`, `codex`, `opencode` and `gemini` on, `hermes` off. An
unknown or switched-off agent fails and names the ones that are on.

There is no flag for a plain shell or a command; open those through a layout
(below).

MCP: `launch_session { agent_type, project_name, project_path, prompt?,
branch?, use_worktree?, display_name?, headless? }`.

## Targets

Every command that takes `<target>` resolves it the same way; the first rule
that matches wins:

1. a whole session id
2. a label, exactly, then ignoring case
3. a position: `3` is the third row of `vorn session list`
4. the start or end of an id

| Exit | Meaning |
| --- | --- |
| 0 | done |
| 1 | failed |
| 2 | bad command line |
| 3 | target matched several (candidates on stderr; `--json` puts `{"error":"ambiguous","candidates":[...]}` on stdout) |
| 4 | no server could be reached or started |
| 124 | `session wait --timeout` ran out |

`--json` writes data to stdout and notices to stderr, so output pipes cleanly.

## List, read, send, kill

```bash
vorn session list [--recent] [--project <name>] [--json]
vorn session read parser-fix --lines 60 --trim
vorn session read 2 --scrollback --unwrap --trim     # the terminal itself, wrapped rows joined
vorn session read 2 --format html                    # colours as spans in a <pre>; vt keeps SGR
vorn session send parser-fix "run the tests again"   # Enter is appended
vorn session send parser-fix $'\x03' --raw           # Ctrl+C, nothing appended
vorn session kill parser-fix
```

`read` without `--scrollback`, `--unwrap` or a `--format` prints the output the
server kept; with any of them it reads the terminal's screen and scrollback.
A headless session has no terminal to `send` to.

MCP: `list_sessions { filter: "active"|"recent", project_name?, project_path? }`,
`read_session_output { id, lines? }` (rolling 1000-line buffer, ANSI stripped),
`write_to_terminal { id, data, raw? }`, `send_key { id, key }` for one key
without Enter (`y`, `escape`, `ctrl+c`, `shift+tab`, `up`),
`kill_session { id, headless? }`, `rename_session { id, display_name }`,
`reorder_sessions { session_ids }`, `list_session_events { session_id?,
event_type?, limit? }`.

Session `status` is `running`, `waiting` (asking something), `idle` or `error`.

## Wait

```bash
vorn session wait parser-fix --timeout 20m            # exits with the program's own code
vorn session wait parser-fix --status idle            # its turn ended
vorn session wait parser-fix --status blocked --json  # it is asking for something
```

`--timeout` takes `30s`, `5m`, `1500ms` or bare seconds, and exits 124 when it
runs out. `--status idle|done|blocked` exits 0 when the status is reached and 1
if the program ends first (except `done`). Status comes from the program's own
report, then hooks, then screen rules — the same thing the card shows.

```bash
id=$(vorn session start --agent claude --worktree --prompt "$task")
vorn session wait "$id" --status idle --timeout 30m && vorn session read "$id" --lines 40 --trim
```

## Events

```bash
vorn events --json --filter session.status,session.exited --session parser-fix
```

One object per line until stopped:
`{"v":1,"event":"session.exited","at":1760000000000,"session":"…","data":{…}}`.
Events: `session.created`, `session.status`, `session.exited`, `session.mark`
(shell command marks), `session.program` (OSC 7501 reports), `agent.hook`,
`git.changed`, `task.created`, `task.statusChanged`. A slow reader gets only
the latest `session.status` and `git.changed` of a batch.

## Layouts

A layout is a TOML file in `~/.vorn/layouts/` (or one an extension ships with
`[[contributes.layouts]]`). It is one thing to open, or a split of children:

```toml
name = "dev"
project = "web"
view = "flexible"        # or "grid" (with columns = 1..4) or "tabs"
split = "horizontal"
ratio = 0.6

[[children]]
agent = "claude"
label = "agent"

[[children]]
command = ["npm", "run", "dev"]
label = "server"

[[children]]
shell = true
cwd = "packages/api"

[[children]]
pane = "browser"
url = "http://localhost:3000"
```

```bash
vorn layout list
vorn layout open dev [--project <name or path>]   # prints the new session ids
vorn layout save dev [--project …] [--force]      # the project's open sessions, in the view shown, with its splits
vorn layout check ~/.vorn/layouts/dev.toml        # every mistake as file:line: message
```

Sessions open in tree order, shown by `view`: `flexible` lays the cards out as
resizable split panes, each split's direction and `ratio` as written; `grid`
puts them in rows of `columns` (automatic without it; `columns` goes only with
`grid`); `tabs` shows one at a time. Without `view`, a layout with a split opens
flexible, `columns` alone means grid, and a single session leaves the view as
it is. A `command` runs in a shell that stays open after it ends. A `pane` opens
beside the session before it and needs the app open.

## Report a program's status (OSC 7501)

A program running in a Vorn terminal can tell Vorn what it is doing. The card
shows the message and progress, and `session wait --status` and the
`session.program` event read it. While a program reports, its report wins over
hooks and screen rules.

```
ESC ] 7501 ; state=<state>[:kind=<kind>][:progress=<0-100>][:id=<id>][:app=<name>][:title=<b64>][:msg=<b64>] ESC \
```

- `state`: `working`, `blocked`, `idle`, `done`, `error`, or `clear` (removes
  the record and its children; no `id` clears all).
- `kind` (with `blocked`): `permission`, `question` or `auth`.
- `id`: empty for the program itself; `build`, `build/test` add steps shown under
  it. Segments are letters, digits, `-`, `_`, `.`.
- `msg` and `title` are base64. A control character in the decoded text drops
  the report. BEL also ends the sequence.
- `working`, `blocked` and `idle` records drop at the next shell prompt or when
  the program exits. `ESC ] 7501 ; ? ESC \` asks whether the terminal supports it.

The card's status follows: working → running, blocked → waiting, error → error,
done and idle → idle.

```bash
report() {  # report <state> [message] [extra fields]
  local msg=""
  [ -n "$2" ] && msg=":msg=$(printf %s "$2" | base64 | tr -d '\n')"
  printf '\033]7501;state=%s%s:app=deploy%s\033\\' "$1" "${3:+:$3}" "$msg"
}
report working "Building" "progress=10"
report working "Unit tests" "id=test:progress=40"
report blocked "Approve the plan in the browser" "kind=question"
report done "Deployed 4f2a1c"
```

It must reach the terminal itself. A script run in a Vorn terminal can do it; a
layout `command` is a good host for one. A command run from inside an agent's
tool call usually cannot: its stdout goes to the agent, and it has no `/dev/tty`.
An agent's own status comes from its CLI, hooks and screen rules (see
vorn-agents). `vorn workflow run --wait` and `vorn session start --headless
--wait` report this way themselves when run in a terminal.

## Gotchas

- `read_session_output` and `session read` read a screen, not a transcript. A
  spinner or TUI redraw comes back as overlapping fragments. Read for state, not
  history.
- `session start` and `launch_session` return once the session exists, not once
  the agent has read the prompt. Wait for a status before judging it.
- Sessions a person started are theirs. Read freely; think before you send.
