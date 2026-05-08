# ldash

[日本語](README.ja.md)

CLI for the [Lightdash](https://www.lightdash.com/) API. Query data, explore models, browse dashboards and charts from the terminal.

Built for coding agents (Cursor, Claude Code, etc.) and humans alike.

## Install

```bash
npx @coji/ldash-cli --help

# or install globally
npm install -g @coji/ldash-cli
```

## Setup

**Sign in with your browser** — no token copy-paste needed:

```bash
ldash setup
```

This opens Lightdash in your browser. Click "Authorize" and you're done — ldash picks up the session, fetches your projects, and lets you choose one. No API keys to manage manually.

Against a specific instance:

```bash
ldash setup https://your-instance.com
```

### Alternative: paste a Personal Access Token

If OAuth isn't available (old self-hosted Lightdash, restrictive network):

```bash
ldash setup --pat                         # opens token page, prompts for paste
```

### For coding agents & CI (non-interactive)

Agents can't click through a browser, so use env vars or flags:

```bash
# Option A — environment variables
export LIGHTDASH_API_URL=https://app.lightdash.cloud
export LIGHTDASH_API_KEY=<token>
export LIGHTDASH_PROJECT_UUID=<uuid>
ldash explore list                        # works without any setup command

# Option B — one-shot
ldash setup https://app.lightdash.cloud \
  --api-key <token> \
  --project-uuid <uuid>
```

Create a Personal Access Token at `<your-instance>/generalSettings/personalAccessTokens`.

Verify readiness from a script:

```bash
ldash setup --check                       # exits non-zero when not ready
ldash config show --json | jq .ready      # one-liner readiness check
ldash doctor                              # full probe: URL → token → project
```

### Configuration precedence

1. Environment variables (`LIGHTDASH_API_KEY`, `LIGHTDASH_API_URL`, `LIGHTDASH_PROJECT_UUID`)
2. Config file at `~/.config/ldash/config.json` (written by `ldash setup`)
3. Built-in defaults

Run `ldash config show` to see the effective config and where each value came from.

## Quick Start

```bash
# Find anything by name across explores, fields, charts, dashboards, ...
ldash search "<query>"

# Discover data models
ldash explore list
ldash explore get <exploreId>

# Query data
ldash query run <exploreId> \
  --dimensions '["orders_status"]' \
  --metrics '["orders_count"]' \
  --limit 10

# Run raw SQL
ldash query sql "SELECT * FROM orders LIMIT 10"

# Browse dashboards & charts
ldash dashboard list
ldash chart get <chartUuid>

# End-to-end health check (URL → token → project)
ldash doctor
```

## Commands

```
ldash <group> <command> [args...] [--json]
```

| Group       | Description                                                  |
| ----------- | ------------------------------------------------------------ |
| `explore`   | Data models (tables, dimensions, metrics)                    |
| `query`     | Run queries (metric queries, SQL, totals, filter operators)  |
| `chart`     | Saved charts and their data                                  |
| `dashboard` | Dashboards (tiles, filters, layout)                          |
| `catalog`   | Data catalog and metrics                                     |
| `search`    | Cross-cutting search (tables, fields, charts, dashboards, …) |
| `project`   | Projects and validation                                      |
| `space`     | Spaces (folders)                                             |
| `org`       | Organization settings                                        |
| `api`       | Direct API access (escape hatch)                             |
| `config`    | Manage CLI configuration                                     |
| `setup`     | Setup wizard                                                 |
| `doctor`    | End-to-end health check (URL → token → project)              |

### Escape Hatch

Access any Lightdash API endpoint directly:

```bash
ldash api GET /api/v1/org/projects
ldash api POST /api/v1/projects/{uuid}/sqlQuery --body '{"sql":"SELECT 1"}'
```

### Output

- Default: pretty-printed JSON
- `--json`: compact JSON for piping
- `--fields a,b,c`: project list/object results down to selected keys
- `--compact`: per-command sensible default subset (`uuid,name,description` etc.)

```bash
ldash chart list --json | jq '.[].name'
ldash chart list --compact                # uuid + name + description
ldash chart list --fields uuid,name,spaceName
```

### Stdin / file input

Every JSON-bearing flag (`--filters`, `--sorts`, `--dimensions`, `--metrics`, `--body`) and the `query sql` positional accept:

- `-` to read from stdin
- `@path/to/file` to read from a file

```bash
echo '{"sql":"SELECT 1"}' | ldash api POST /api/v1/projects/<uuid>/sqlQuery --body -
ldash query run orders --filters @./filters.json
ldash query sql @./query.sql
```

### Stable error envelope

Under `--json`, errors return a structured envelope with a stable `code` so agents can branch without parsing message text:

```json
{
  "ok": false,
  "error": {
    "code": "EXPLORE_NOT_FOUND",
    "what": "...",
    "why": "...",
    "hint": "..."
  }
}
```

The `hint` usually points at a concrete next command (e.g. `EXPLORE_NOT_FOUND` → `Run "ldash explore list"`). Full code list in [`src/errors.ts`](src/errors.ts).

### Help

3-layer help with usage examples and suggested next steps:

```bash
ldash --help                    # all groups
ldash explore --help            # commands in a group
ldash explore get --help        # usage, examples, next steps
```

## Comparison with the official Lightdash CLI

The official [`@lightdash/cli`](https://www.npmjs.com/package/@lightdash/cli) focuses on **dbt development workflows** (compile, deploy, preview, generate schema).

`ldash` focuses on **data access** (query, explore, browse charts/dashboards via the API).

|                              | `@lightdash/cli`         | `ldash`                  |
| ---------------------------- | ------------------------ | ------------------------ |
| **Focus**                    | dbt dev & deploy         | Data access & queries    |
| **dbt compile/deploy**       | Yes                      | No                       |
| **Explore data models**      | No                       | Yes                      |
| **Run metric queries**       | No                       | Yes                      |
| **Browse charts/dashboards** | No                       | Yes                      |
| **SQL execution**            | DWH direct (dbt profile) | API-based                |
| **Auth**                     | Login (email/token)      | Browser OAuth / env vars |
| **Target users**             | dbt developers           | Coding agents & analysts |

They are complementary.

## License

MIT
