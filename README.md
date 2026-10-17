# Vorn plugin

Teaches a coding agent what it can do when it runs inside
[Vorn](https://github.com/vorn-run/vorn), and installs the Vorn MCP server that
gives it those abilities.

Without this, an agent in a Vorn session behaves like an agent in a bare
terminal. With it, the agent knows it can open and drive other terminals, start
and steer other agents, drive a browser pane and an iOS simulator, write and run
workflows, and build connectors, extensions and agent adapters for Vorn.

Written for Vorn 0.8.

## What it teaches

| Skill | Covers |
|---|---|
| `vorn-terminals` | The `vorn` command and session tools — start, read, send, wait, events, layouts, OSC 7501 status |
| `vorn-orchestration` | Splitting work across agent sessions and steering them |
| `vorn-browser` | The browser pane — accessibility tree, interaction, console and network, artifacts and designs |
| `vorn-device` | iOS simulators — claiming one, reading the screen, tapping, logs |
| `vorn-workflows` | Workflow files, steps and triggers, loops, approval gates, running and debugging |
| `vorn-connectors` | Connections and their actions, and writing a connector with the SDK |
| `vorn-extensions` | Writing an extension — manifest, permissions, events, storage, UI, contribution points, packing |
| `vorn-agents` | Adding an agent CLI as an adapter — launch, resume, models, history, status |

## Install

**Claude Code**

```
/plugin marketplace add vorn-run/plugin
/plugin install vorn
```

**Copilot CLI**

```
copilot plugin marketplace add vorn-run/plugin
copilot plugin install vorn@vorn
```

`copilot plugin install vorn-run/plugin` also works today, but installing
straight from a repo is deprecated and will stop working.

**Codex**

```
codex plugin marketplace add vorn-run/plugin
codex plugin add vorn@vorn
```

Codex has no `plugin install`, and `plugin add` needs the `<plugin>@<marketplace>`
form — a bare `vorn` is rejected.

Restart, or start a fresh session — bundled skills load at session start.

**opencode** reads skills natively. Add the MCP server, then point its
`skills.paths` at a clone of this repo:

```
opencode mcp add vorn -- npx -y @vornrun/mcp@0.8.0-beta.15
git clone https://github.com/vorn-run/plugin ~/.config/opencode/vorn
```

```jsonc
// ~/.config/opencode/opencode.jsonc
{
  "skills": { "paths": ["~/.config/opencode/vorn/skills"] }
}
```

The same `SKILL.md` files the other harnesses use — opencode discovers them
through its own `skill` tool, so there is no plugin to install.

**Gemini CLI**

```
gemini extensions install https://github.com/vorn-run/plugin
```

The extension carries both the MCP server and the skills — Gemini has no skills
system, so `GEMINI.md` includes every skill file directly rather than loading
them on demand.

Gemini suppresses MCP servers, including user-level ones, in a folder it does not
trust. If the server shows as `Disabled`, trust the folder or pass `--skip-trust`.

## What it installs

| | |
| --- | --- |
| `.mcp.json` | the `vorn` MCP server (`@vornrun/mcp`) — 59 tools of Vorn's own, 7 each from the Tasks and Connectors built-ins while they are on, and any an installed extension adds |
| `skills/vorn-terminals` | the `vorn` command, sessions, events, layouts, OSC 7501 |
| `skills/vorn-orchestration` | running other agents |
| `skills/vorn-browser` | driving the session browser pane |
| `skills/vorn-device` | driving an iOS simulator |
| `skills/vorn-workflows` | writing, running and debugging workflows |
| `skills/vorn-connectors` | using and writing connectors |
| `skills/vorn-extensions` | writing extensions |
| `skills/vorn-agents` | writing agent adapters |

On every harness with a skills system, these load on demand — about 900 tokens
always-on, and 1k to 3k more only when a skill actually fires. Gemini has no
skills system, so its extension includes them all up front instead.

## Why skills and not a longer prompt

Agents defer MCP tool descriptions — a tool's *name* enters context, its
documentation usually does not. So `browser_interact` appearing in a tool list
does not tell an agent that refs come from `read_page`, that refs die on
navigation, or that console capture starts when the pane opens. The skills carry
that; the tool list carries the names.

Skill bodies are also re-injected after compaction, where prompt text is
summarised away.

## Why the server version is pinned

`.mcp.json` asks for an exact `@vornrun/mcp` version rather than `@latest`.

`@latest` reads whichever registry the machine is pointed at, and a mirror that
has stopped syncing still answers -- it serves what it last fetched, under
whatever tag it last saw. Nothing errors in that case: the server starts, the
tools load, and the only symptom is a tool that should exist and does not. A
pinned version turns silence into a failure you can read.

Bump it deliberately when the server gains something the skills rely on.

From 0.8 the package relays to the tools Vorn's server serves, so the tool list
follows the running Vorn. Vorn also installs `vorn mcp`, the same server over
stdio with no npm involved; an agent that starts its MCP servers as commands can
use it instead:

```json
{ "mcpServers": { "vorn": { "command": "vorn", "args": ["mcp"] } } }
```

## Requirements

- Vorn 0.8 running (its server; the `vorn` command starts one if none is)
- The `vorn` command on PATH for the command-line examples; Settings › General ›
  Command-Line Tool installs it
- Browser and device tools additionally need an interactive session started by
  Vorn — headless runs have no pane

## Layout

```
.claude-plugin/plugin.json   Claude Code manifest
.codex-plugin/plugin.json    Codex manifest
plugin.json                  Copilot CLI manifest
.mcp.json                    MCP server definition
skills/<name>/SKILL.md       shared by every harness
```

Three manifests, one set of skills. Claude, Copilot and Codex all read
`skills/<name>/SKILL.md`, so the content is written once.

## Licence

MIT
