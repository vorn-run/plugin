---
name: vorn-orchestration
description: Split work across several agent sessions in Vorn and steer them — start agents on their own worktrees, watch their status, answer what they ask, and review what they produce. Use when work can be parallelised, when you need a second agent on a different branch, or when you need to read or unblock a session that is already running.
license: MIT
---

# Running other agents

Vorn runs many agent sessions side by side. You are one of them, and you can
start and steer others. Do it when the work splits cleanly — not to hand off
work you could finish faster than the handoff costs.

The mechanics of each command are in vorn-terminals; this is how to use them
together.

## See what is running

```
list_sessions { filter?: "active" | "recent", project_name?, project_path? }
get_my_context { cwd?, task_id? }     # your project, and the task you are on
```

Active sessions come back with `id`, `agentType`, `projectName`, `status`,
`displayName`, `branch` and `pid`. `status` is the field that matters:
`running` (mid-turn), `waiting` (asking something), `idle` (turn ended),
`error`. From a shell: `vorn session list --json`.

## Start one

```
launch_session {
  agent_type,      # an agent switched on: claude, copilot, codex, opencode, gemini…
  project_name,
  project_path,    # absolute
  prompt?,
  branch?,
  use_worktree?,   # true = its own git worktree
  display_name?,
  headless?        # true = no terminal, runs to completion
}
```

```bash
vorn session start --agent copilot --worktree --name api-tests \
  --prompt "add tests for the /orders endpoint; do not touch src/ui"
```

- **Pass `use_worktree: true` (`--worktree`) whenever it will edit files.** Two
  agents in one working tree clobber each other.
- **Headless** runs to completion with no terminal and no browser pane: right
  for a bounded task you want a result from. **Interactive** (default) is a
  terminal a person can watch and take over: right for open-ended work.
- **Name it.** A grid of sessions called `claude` helps nobody.
- An agent that is switched off is refused, and the error lists the ones that
  are on.

## Watch without burning turns

Prefer waiting on status to polling output:

```bash
vorn session wait api-tests --status idle --timeout 30m
vorn session wait api-tests --status blocked    # it is asking you something
vorn events --json --filter session.status --session api-tests
```

From MCP, `read_session_output { id, lines? }` reads its screen and
`list_session_events { session_id?, event_type?, limit? }` gives created,
exited and renamed events for a post-mortem.

## Steer it

Read first, so you answer the question actually on screen:

```
read_session_output { id, lines: 60 }
write_to_terminal { id, data }       # typed, Enter appended unless raw: true
send_key { id, key }                 # one key, no Enter: "1", "y", "escape", "ctrl+c"
```

`kill_session { id, headless? }`, `rename_session { id, display_name }` and
`reorder_sessions { session_ids }` tidy up.

## A working pattern

1. Split the work into parts that do not touch the same files.
2. Start each with a worktree, a name and a prompt that says what is out of
   bounds.
3. Wait on `--status idle` or `blocked` rather than reading in a loop; do your
   own part meanwhile.
4. When one is `waiting`, read its screen and answer.
5. Review each result yourself before merging. You are accountable for what the
   agents you started produce.

## Judgement

Delegate when the parts are independent and each is big enough to be worth the
setup. Do it yourself when the work is small, the parts share files, or
defining the task takes longer than doing it.

Sessions you did not start belong to someone else — a person may be typing in
one now. Read freely; think before you write to one.

## Gotchas

- **Output is a screen, not a transcript.** Spinners and redraws come back as
  overlapping fragments. Read it for state, not history.
- **Starting returns before the agent has done anything.** The prompt reaches a
  terminal that may still be loading; wait for a status before concluding it
  ignored you.
- **A headless session has no terminal**: you cannot type into it, only wait for
  it and read what it kept.
