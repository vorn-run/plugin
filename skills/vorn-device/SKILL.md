---
name: vorn-device
description: Drive an iOS simulator from your Vorn session — claim one, read the screen as an accessibility tree, tap and type, and read logs. Use when verifying an iOS app change, reproducing a bug on device, or walking a flow a user would walk.
license: MIT
compatibility: Requires macOS with Xcode installed. The Command Line Tools alone do not ship simctl.
---

# Driving a simulator

You can drive a real iOS simulator. Use it to check that an app change works,
rather than reasoning about it from the source and stopping there.

## Claim one first

```
device_list {}                 # simulators, their state, and who holds each
device_claim { udid }          # claim it, booting if needed
```

`device_list` is the only device tool that works before you claim anything, so
start there. Every other tool acts on the device you hold.

**A claim another session holds fails and names the holder.** Do not work around
that by claiming a different simulator mid-task — two agents driving one screen
produce results that look exactly like app bugs, and you will debug the wrong
thing for an hour.

Release when you are done, so the next session can work:

```
device_release {}
```

A simulator Vorn booted is shut down; one that was already running is left alone.

## Read before you act

```
read_screen { filter?, cursor?, limit? }
```

An accessibility tree, not pixels. Elements carry a `ref` you pass to
`device_interact`. Prefer it over a screenshot: far cheaper, and it hands you
something you can act on.

```
device_find { text }           # search the whole screen, not just page one
```

`read_screen` paginates; `device_find` searches everything. When you know what
you are looking for, find is the shorter path.

## Act

```
device_interact { action, ref?, x?, y?, text?, to_x?, to_y?, duration? }
```

`action` is one of `tap`, `swipe`, `type`, `button`, `press` (long press).

Two things that will bite you if you skim:

- **Coordinates are in POINTS**, which is what taps take. A screenshot is
  typically 3x larger in pixels — divide by the reported scale factor before
  using an image coordinate, or you will tap the wrong thing entirely.
- **A ref from before an earlier interaction is refused, not guessed at.**
  Read the screen again after anything that changes it.

A swipe starting at the very edge is refused too: iOS claims those as system
gestures and swallows them, which looks to you like nothing happened. Pass
`system_gesture: true` when a system gesture is genuinely the intent.

## Run an app

```
device_install { path }        # a built .app bundle — it does not build for you
device_launch { bundle_id }
device_terminate { bundle_id }
device_open_url { url }        # web URL, or a custom scheme to test deep links
```

## Diagnose

```
device_logs { limit? }         # captured since you claimed the device
```

Logs capture from the moment of the claim, so claim *before* the action you want
to observe.

```
device_screenshot { max_edge? }
```

The expensive last resort, same as on the browser side. Reach for `read_screen`
first and take a screenshot only when the question is genuinely visual — layout,
overlap, rendering — or when handing a person something to look at.

## Let a person watch

```
open_device_pane {}
```

Optional. Every device tool works with the pane closed; this only puts the
screen where a person can see it.

## The loop

1. `device_list` → `device_claim`
2. `device_install` and `device_launch` the build under test
3. `read_screen` for refs, `device_interact` to walk the flow
4. `device_logs` when something does not behave
5. `device_release` when done

## When it will not work

**`xcrun: unable to find utility "simctl", not a developer tool or in PATH`**

`xcode-select` is pointing at the Command Line Tools, which do not ship the
simulator. Xcode itself is usually installed anyway — check with
`xcode-select -p`, and if it prints `/Library/Developer/CommandLineTools`, run
the tools with the real developer directory:

```
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun simctl list devices
```

That override needs no sudo and changes nothing for anyone else. Repointing
`xcode-select` for the whole machine is a person's decision, not yours — say
what you found and let them make it.

If a tool returns *"no Vorn session context (VORN_SESSION_ID is unset)"*, you are
in a headless run or a session not started by the Vorn app. There is no device
to claim and no way to make one. Do not retry — say so and carry on with the
work you can do.
