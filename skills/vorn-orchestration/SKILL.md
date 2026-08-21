---
name: vorn-orchestration
description: Launch, watch and steer other agent sessions running in Vorn. Use when work can be parallelised, when you need a second agent on a different branch or worktree, or when you need to read or unblock a session that is already running.
license: MIT
---

# Running other agents

Vorn is an orchestrator. You are one session in it, and you can start and drive
others. Use this when work splits cleanly — not to hand off work you could
finish yourself in less time than the handoff costs.

## See what is running

```
list_sessions { status? }        # "active" (running) or "recent" (past)
```

Returns each session's `id`, `agentType`, `projectName`, `status`, `branch` and
`pid`. `status` is the field that matters: `running` means the agent is mid-turn,
`idle` means it is waiting for input.

## Start one

```
launch_session {
  agent_type,      # claude | copilot | codex | opencode | gemini
  project_name,
  project_path,    # absolute
  prompt?,
  branch?,
  use_worktree?,   # true = isolated git worktree
  display_name?,
  headless?        # true = no UI, runs to completion
}
```

`agent_type`, `project_name` and `project_path` are required; the rest are
optional. Requires the Vorn app to be running.

**Pass `use_worktree: true` whenever the new session will edit files.** Two
agents writing the same working tree will clobber each other. A worktree gives it
an isolated checkout on its own branch.

**Choose interactive or headless deliberately:**

- `headless: true` — runs to completion and exits. Right for a bounded task you
  want a result from. It has no UI and **no browser pane**.
- interactive (default) — a terminal session a person can watch and take over.
  Right for open-ended work.

Give a `display_name`. A grid of sessions called `claude` helps nobody.

## Watch it

```
read_session_output { id, lines? }
```

Reads the session's terminal output from a rolling 1000-line buffer with ANSI
codes stripped. This is a real read of another agent's screen — use it to see
whether it is making progress, stuck, or waiting on a prompt.

```
list_session_events {}    # created / exited / renamed, for post-mortems
```

## Steer it

```
write_to_terminal { id, data, raw? }
```

Sends input to a running session, as if typed. A carriage return is appended
unless `raw: true`. Use it to answer a question the agent is blocked on, or to
redirect it.

```
send_key { id, key }
```

Sends a single keystroke or combo **without** Enter — for TUI interaction:
menu selections (`1`, `2`, `y`, `n`), arrows, `Escape`.

Read before you write. `read_session_output` first, so you are answering the
question actually on screen rather than the one you assume is.

```
kill_session { id }
rename_session { id, display_name }
reorder_sessions { ids }
```

## A working pattern

1. Split the work into parts that do not touch the same files.
2. `launch_session` each with `use_worktree: true` and a clear `prompt`.
3. Poll `read_session_output` rather than blocking — check, do your own work,
   check again.
4. When one goes `idle` mid-task, read its output: it is usually asking
   something. Answer with `write_to_terminal`.
5. Review each result yourself before merging. You are accountable for what the
   agents you started produce.

## Judgement

Delegate when the parts are genuinely independent and each is big enough to be
worth the setup. Do it yourself when the work is small, when the parts share
files, or when defining the task takes longer than doing it.

Sessions you did not start belong to someone else — a person may be typing in
one right now. Read freely; think before you write to one.

## Gotchas

- **`read_session_output` reads a terminal, not a transcript.** It returns a
  rolling buffer with escape sequences stripped, so an agent that redraws in
  place — a spinner, a status line, a TUI — comes back as overlapping fragments
  on one line. That is what the screen genuinely contains, not corruption and
  not a truncated read. Read it for the state a session is in; do not try to
  reconstruct its history from it.
- **`launch_session` returns once the session exists, not once it has done
  anything.** The prompt is delivered to a terminal that may still be starting.
  Give it a moment before reading output and concluding it ignored you.
