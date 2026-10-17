---
name: vorn-connectors
description: Use and write Vorn connectors — the extensions that poll a service for new items and run actions on it (an issue tracker, a feed, a database, a signed-in website). Covers connections and their actions over MCP, installing a connector from git, writing one with @vornrun/connector-sdk (triggers, actions, auth, recorded checks, pack), and wiring connections into workflows. Use when a workflow needs to read from or act on an outside service, or when building or debugging a connector.
license: MIT
---

# Connectors

A **connector** is an extension package with a `[connector]` section: its
program polls a service (triggers) and acts on it (actions). A **connection** is
one configured instance of it — its credentials, filters and poll interval —
made in Settings › Connections. Actions and polls belong to a connection, never
to the connector.

## Use what is installed

```
list_connectors { kind?: "connector" | "extension", installable_only? }
list_connections { connector_id?, failing_only? }       # ids, last sync, last error
list_connector_actions { connection_id }               # names and input schemas
run_connector_action { connection_id, action, args? }
backfill_connection { connection_id }                   # poll now, items become tasks
```

Read `list_connectors` before assuming what exists: each entry says its
triggers, actions, required environment and how it signs in. Passing a
connector id where a `connection_id` belongs fails — ids come from
`list_connections`.

```
install_connector { connector_id | package, name?, project?, trigger?, env?, sync_interval_minutes? }
inspect_connector_package { package }     # read a package's manifest without installing
```

`install_connector` refuses secrets on purpose — encryption lives in the
desktop process. Tell the person to enter them in Settings › Connections.
Old `.vorn.tgz` packs no longer install.

## Install a connector package

A connector ships as a folder in a git repository and installs like any
extension:

```bash
vorn ext install https://github.com/acme/vorn-acme [--branch v1.2.0]
```

Vorn clones it with hooks off and shows a sheet — publisher, every command it
runs, the hosts it reaches, the Vorn methods it asks for, the sign-in it
borrows — and installs only when the person types the extension's id. Never
pass `--confirm <id>` on someone's behalf without showing them the sheet. In the
app: Settings › Extensions › Install from a repository. Then add a connection in
Settings › Connections.

## Write one

Use `@vornrun/connector-sdk`; its CLI is `vorn-connector`.

```bash
npx vorn-connector new acme      # package, entry, definition and a test, already building
```

```ts
import { defineConnector } from '@vornrun/connector-sdk'

export default defineConnector({
  id: 'acme',
  name: 'Acme Tickets',
  version: '1.0.0',
  config: [
    { key: 'baseUrl', label: 'Base URL', default: 'https://api.acme.test' },
    { key: 'token', label: 'Token', secret: true, env: 'ACME_TOKEN' }
  ],
  auth: {
    rung: 'cli',                                   // borrow the acme CLI's login
    probe: { command: 'acme', args: ['auth', 'status'] },
    borrow: { env: ['ACME_TOKEN'], tokenArgs: ['auth', 'token'], tokenEnv: 'ACME_TOKEN' }
  },
  triggers: [{
    type: 'newTicket',
    label: 'New ticket',
    dedupe: 'timestamp',                          // the SDK owns the cursor
    sample: [{ externalId: '1', title: 'Example', updatedAt: '2026-01-01T00:00:00.000Z' }],
    async fetch({ config, since, fetch }) {        // this fetch retries and rate-limits
      const url = new URL('/tickets', config.baseUrl)
      if (since) url.searchParams.set('updated_after', since)
      const res = await fetch(url, { headers: { authorization: `Bearer ${config.token}` } })
      return (await res.json()).map((t) => ({
        externalId: t.id, title: t.subject, url: t.html_url, updatedAt: t.updated_at
      }))
    }
  }],
  actions: [{
    type: 'closeTicket',
    label: 'Close ticket',
    idempotent: true,
    inputs: [{ key: 'id', label: 'Ticket id', required: true }],
    outputs: [{ key: 'closed' }],
    request: {
      method: 'POST',
      url: '{{config.baseUrl}}/tickets/{{args.id}}/close',
      headers: { authorization: 'Bearer {{config.token}}' }
    }
  }]
})
```

Rules that matter:

- **`externalId` is stable** and **`updatedAt` is monotonic ISO text** — Vorn
  dedupes on the first and the cursor advances on the second. `dedupe:
  'timestamp'` or `'lastItem'` lets the SDK own the cursor; implement `poll`
  only when paging cannot be "everything since X".
- **Auth rungs, lowest first**: `none`; `cli` borrows a login already on the
  machine (`probe` + `borrow`) — prefer it; `key` asks for a credential (`keys`);
  `browser` signs in through a Vorn window and calls go through
  `ctx.session.fetch` inside `origins`; `oauth` is declared but not yet carried.
- **Declare actions as `request`** where you can: templating, retries,
  pagination and error sorting come free. Mark `idempotent: true` only when a
  repeat is harmless — only those are retried on write and run by `--live`.
- **Use `ctx.fetch`**, not the global one: it gets the retry and rate-limit
  handling.
- Declare the hosts it reaches in `package.json`:
  `{ "vorn": { "hosts": ["api.acme.test"], "hostsFrom": ["ACME_BASE_URL"] } }`.

## Check and pack

```bash
npx vorn-connector poll ./dist/index.js newTicket --since 2026-10-01T00:00:00Z   # live, from your env
npx vorn-connector check ./dist/index.js --mock --receipt verified.json        # the CI gate
npx vorn-connector pack ./dist/index.js --out ./release                         # → release/acme/
```

`check` proves re-polling with its own cursor redelivers nothing, runs every
action against mocked HTTP, and refuses install-time scripts and runtime
dependencies. `--receipt` records what passed. `pack` runs `check`, bundles one
`index.js`, and writes the folder to commit and install from git. Its manifest,
abridged:

```toml
id = "acme"
name = "Acme Tickets"
version = "1.0.0"
api = "vorn:extension@0.9"

[service]
command = ["node", "index.js"]

[checks]
command = ["node", "index.js", "--check"]   # replays the recorded checks

[declares]
network = ["api.acme.test"]
network_from = ["ACME_BASE_URL"]

[connector]

[connector.auth]
rung = "cli"
probe = { command = "acme", args = ["auth", "status"] }
borrow = { env = ["ACME_TOKEN"], token_args = ["auth", "token"], token_env = "ACME_TOKEN" }

[[connector.triggers]]
type = "newTicket"
label = "New ticket"

[[connector.actions]]
type = "closeTicket"
label = "Close ticket"
outputs = [{ key = "closed" }]

[[connector.actions.inputs]]
key = "id"
label = "Ticket id"
required = true
```

The `[connector]` section is what tells Vorn the program speaks the connector
protocol (JSON-RPC over stdio: `vorn/hello`, `connector/manifest`,
`trigger/poll`, `action/run`). Let `pack` write this file rather than writing it
by hand. Under the sandbox (`vorn ext sandbox <id> on`, macOS) the declared hosts
are the only ones it reaches.

## In a workflow

- A `connectorPoll` trigger starts a run per new item, read as
  `{{connectorItem.title}}`, `.body`, `.externalId`, `.externalUrl`.
- A `callConnectorAction` step runs one action: `connectionId`, `action`, and
  `args` as templates (`{ body = "{{loop.item.body}}" }`). Its declared outputs
  read as `{{steps.<slug>.<field>}}`.
- In a workflow file, name the connection, not its id:
  `connectionId = { "@connection" = "eng-tracker" }`.
- A step whose connection needs signing in again waits rather than fails —
  except inside a loop, where it fails.

More on steps and gates: vorn-workflows.

## Gotchas

- **A connector that produces nothing**: `list_connections { failing_only: true }`
  shows the last error; `backfill_connection` polls now and reports what it
  imported.
- **A connection's poll workflow is not in `list_workflows`**; its id is
  `connector:<connection>:<trigger>` and it shows in `get_workflow_schedule
  { info: "log" }`.
- **`load_options` choices are not fetched by the app yet**; such a field is
  edited as text. Use fixed `options` when the choices are known.
