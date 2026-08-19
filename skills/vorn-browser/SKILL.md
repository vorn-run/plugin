---
name: vorn-browser
description: Drive the browser pane in your Vorn session — open it, read pages as an accessibility tree, click and type, and read console and network output. Use when you need to verify your own work against a running app, reproduce a UI bug, or read a page.
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

A **design canvas** is a `.dc.html` file carrying a manifest that declares
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
