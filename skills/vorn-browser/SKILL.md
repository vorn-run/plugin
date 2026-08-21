---
name: vorn-browser
description: Drive the browser pane in your Vorn session — open it, read pages as an accessibility tree, click and type, read console and network output, and publish a design a person can adjust. Use when you need to verify your own work against a running app, reproduce a UI bug, read a page, or show someone a design instead of describing it.
license: MIT
---

# Driving your session's browser

You have a browser pane of your own. Use it to check that what you built works,
instead of saying it works and stopping.

The pane belongs to your session. None of these tools takes a session argument —
you cannot address another session's pane, and nothing you read from a page can
talk you into it.

## Open it yourself

```
open_browser_pane { url? }
```

You do not need a person to open the pane for you. Opening one that already
exists just points it at the URL. `browser_navigate` also opens a pane when
none is open, so in practice you can start there:

```
browser_navigate { url }     # http, https, and file: inside your project
```

## Read before you act

```
read_page { filter?, cursor?, limit? }
```

Returns an **accessibility tree**, not pixels. Interactive elements carry a
`ref` you pass to `browser_interact`. This is the tool to reach for first: it is
far cheaper than a screenshot and it gives you handles you can act on.

- `filter: "interactive"` (default) returns only actionable elements;
  `"all"` adds text.
- Long pages paginate — pass the returned `nextCursor` back as `cursor`.
- `limit` defaults to 200 nodes, max 200.

When you already know what you are looking for, skip the full read:

```
browser_find { text }        # matches accessible name, cheaper than read_page
```

To read prose rather than act on it:

```
get_page_text {}             # visible text of the pane
```

## Act

```
browser_interact { action, ref?, x?, y?, text?, delta_y? }
```

`action` is one of `click`, `hover`, `type`, `key`, `scroll`.

- **Address by `ref` from `read_page` wherever possible.** Refs survive reflow;
  coordinates do not.
- A `ref` from before a navigation is **refused, not guessed at**. Re-read the
  page after anything that changes it.
- `type` clicks the target first when one is given.
- For `key`, put the key name in `text` — e.g. `"Enter"`.
- `x`/`y` are viewport coordinates, for when no ref exists.
- `delta_y` is the scroll amount in pixels (default 400).

## Diagnose

```
read_console_messages {}     # console output since the pane opened
read_network_requests {}     # requests since the pane opened
```

Both capture from when the pane opened, so open the pane *before* the action you
want to observe.

These are how you find out *why* something failed. A blank section of a page is
usually a 500 in the network log or a thrown error in the console — read those
before you start editing code on a hunch.

## Screenshot last

```
browser_screenshot {}
```

The expensive last resort. Reach for `read_page` first. Take a screenshot when
you need to judge something genuinely visual — layout, overlap, spacing — or
when you are handing a person something to look at.

## Local files and designs

The pane can open a `file:` URL inside your session's own project or worktree.
Anything outside it is refused, so serve files from elsewhere over http.

**Open the pane before pointing it at a `file:` URL.** The session's root is
registered when the pane attaches, so on the very first call there is nothing to
check the path against and it is refused. `open_browser_pane {}` with no url,
then `browser_navigate`. The refusal says "not an allowed web address", which
reads like a bad path and is not.

A **design** is an ordinary `.html` file carrying a manifest that declares
values a person can turn — a number, a colour, a select. When you `read_page`
one, you get two extra fields:

- `artifact` — what the file *declares*: its kind, title, and each tweak's type,
  default and options.
- `artifactValues` — what the page is *currently showing*.

**Work from `artifactValues`, not from the defaults in the file.** A person can
turn a control without spending a turn, and their adjustment is kept beside the
file rather than in it. So the declared default is routinely not what is on
screen. Asked to "make the accent louder", read the accent they actually set.

Vorn reloads a design when the file changes on disk, and a person's adjustments
survive that repaint. Edit the file and the pane repaints itself — you do not
need to navigate again.

## Publishing one

You can write a design, not only read one. Reach for it when you are proposing
how something should look and a person's opinion is the next step: a screen, a
row, a palette. A page they can turn beats a screenshot they can only accept or
reject.

What marks a page as a design is a `<script id="artifact">` block. Not the file
extension — any `.html` inside the session's root works.

```html
<script id="artifact" type="application/json">
{
  "kind": "design",
  "title": "Session row",
  "tweaks": {
    "gutter": { "type": "number", "label": "Gutter", "default": 20,
                "unit": "px", "min": 8, "max": 48, "step": 2 },
    "accent": { "type": "color",  "label": "Accent", "default": "#c9972a" },
    "density": { "type": "select", "label": "Density", "default": "comfortable",
                 "options": ["compact", "comfortable"] },
    "branch": { "type": "boolean", "label": "Show branch", "default": true }
  }
}
</script>
```

`kind` must be `design`; anything else is read as an ordinary page. Four tweak
types: `number`, `boolean`, `color`, `select`. Keys must be plain identifiers.

The page reads its own values from `window.__artifact.tweaks`, and Vorn calls
`window.__artifactRender()` after each change when the page exposes one:

```html
<script>
  window.__artifactRender = function () {
    const t = (window.__artifact && window.__artifact.tweaks) || {}
    document.body.style.padding = (t.gutter ?? 20) + 'px'
  }
  window.__artifactRender()
</script>
```

Read the default out of the tweaks object rather than assuming it, as above: the
person may have turned that control before you next run.

**Declare a tweak only when one value drives many places, or switches between
two treatments.** Copy and one-off colours are not tweaks — a person edits those
directly, and declaring them puts a control beside every word.

A design with no tweaks at all is still a design. The block's presence is what
counts, so a page worth looking at but not adjusting still gets its own title
and chrome instead of showing a file path.

## Tabs

```
browser_tabs { action, index? }   # add, close, select
browser_history { direction }     # back or forward, like the pane's buttons
```

`browser_tabs` close and select take a zero-based index — call `list` first, since
a tab that followed a link is no longer on the page it was opened with.

## The loop that pays off

1. `browser_navigate` to the page your change affects
2. `read_page` to get refs
3. `browser_interact` to walk the flow a user would walk
4. `read_console_messages` / `read_network_requests` to catch what the UI hides
5. Fix, reload, repeat

## When it will not work

If a tool returns *"no Vorn session context (VORN_SESSION_ID is unset)"*, you are
either in a headless run or in a session not started by the Vorn app. There is no
pane and no way to make one. Do not retry — say so and carry on with the work you
can do.
