# Vorn plugin

Teaches a coding agent what it can do when it runs inside
[Vorn](https://github.com/vorn-run/vorn), and installs the Vorn MCP server that
gives it those abilities.

Without this, an agent in a Vorn session behaves like an agent in a bare
terminal. With it, the agent knows it can drive a browser pane, drive an iOS
simulator, start and steer sibling agents, and build and run workflows.

## What it teaches

| Skill | Covers |
|---|---|
| `vorn-browser` | The browser pane — reading pages as an accessibility tree, interacting, console and network output, and design canvases |
| `vorn-device` | iOS simulators — claiming one, reading the screen, tapping, logs |
| `vorn-orchestration` | Launching, watching and steering sibling agent sessions |
| `vorn-workflows` | Building, running and debugging workflows |

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

**opencode** has its own skills system and does not read the skill files here.
Add the MCP server:

```
opencode mcp add vorn -- npx -y @vornrun/mcp@latest
```

`opencode/plugin.js` in this repo carries the same knowledge for opencode, and
re-injects it at compaction. It is **not published yet**, so there is no
`opencode plugin` line to run — an opencode session gets the tools but not the
guidance until it ships as a package.

**Gemini CLI**

```
gemini extensions install https://github.com/vorn-run/plugin
```

The extension carries both the MCP server and the skills — Gemini has no skills
system, so `GEMINI.md` includes all four skill files directly rather than loading
them on demand.

Gemini suppresses MCP servers, including user-level ones, in a folder it does not
trust. If the server shows as `Disabled`, trust the folder or pass `--skip-trust`.

## What it installs

| | |
| --- | --- |
| `.mcp.json` | the `vorn` MCP server (`@vornrun/mcp`) — 67 tools |
| `skills/vorn-browser` | driving the session browser pane |
| `skills/vorn-device` | driving an iOS simulator |
| `skills/vorn-orchestration` | launching, watching and steering other agents |
| `skills/vorn-workflows` | building, running and debugging workflows |

On every harness with a skills system, these load on demand — about 324 tokens
always-on, and roughly 1k more only when a skill actually fires. Gemini has no
skills system, so its extension includes all four up front instead.

## Why skills and not a longer prompt

Agents defer MCP tool descriptions — a tool's *name* enters context, its
documentation usually does not. So `browser_interact` appearing in a tool list
does not tell an agent that refs come from `read_page`, that refs die on
navigation, or that console capture starts when the pane opens. The skills carry
that; the tool list carries the names.

Skill bodies are also re-injected after compaction, where prompt text is
summarised away.

## Requirements

- The Vorn app running (the MCP server talks to it over a local socket)
- Browser tools additionally need an interactive session started by Vorn —
  headless runs have no pane

## Layout

```
.claude-plugin/plugin.json   Claude Code manifest
.codex-plugin/plugin.json    Codex manifest
plugin.json                  Copilot CLI manifest
.mcp.json                    MCP server definition
skills/<name>/SKILL.md       shared by all three
opencode/plugin.js           opencode: re-injects context at compaction
```

Three manifests, one set of skills. Claude, Copilot and Codex all read
`skills/<name>/SKILL.md`, so the content is written once.

## Licence

MIT
