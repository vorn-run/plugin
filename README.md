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

**opencode** reads skills natively. Add the MCP server, then point its
`skills.paths` at a clone of this repo:

```
opencode mcp add vorn -- npx -y @vornrun/mcp@latest
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

**Gemini CLI** has no plugin system. Add the MCP server directly:

```
gemini mcp add -s user vorn npx -y @vornrun/mcp@latest
```

No `--` separator: Gemini takes the command and its arguments positionally and
rejects the separator form. `-s user` because it writes to project settings
otherwise. Gemini also suppresses MCP servers in a folder it does not trust.

## What it installs

| | |
| --- | --- |
| `.mcp.json` | the `vorn` MCP server (`@vornrun/mcp`) — 40+ tools |
| `skills/vorn-browser` | driving the session browser pane |
| `skills/vorn-orchestration` | launching, watching and steering other agents |
| `skills/vorn-workflows` | building, running and debugging workflows |

Skills load on demand, so they cost nothing until the agent needs them.

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
