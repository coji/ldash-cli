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

### Configuration precedence

1. Environment variables (`LIGHTDASH_API_KEY`, `LIGHTDASH_API_URL`, `LIGHTDASH_PROJECT_UUID`)
2. Config file at `~/.config/ldash/config.json` (written by `ldash setup`)
3. Built-in defaults

Run `ldash config show` to see the effective config and where each value came from.

## Quick Start

```bash
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
```

## Commands

```
ldash <group> <command> [args...] [--json]
```

| Group       | Description                               |
| ----------- | ----------------------------------------- |
| `explore`   | Data models (tables, dimensions, metrics) |
| `query`     | Run queries (metric queries, SQL, totals) |
| `chart`     | Saved charts and their data               |
| `dashboard` | Dashboards (tiles, filters, layout)       |
| `catalog`   | Data catalog and metrics                  |
| `project`   | Projects and validation                   |
| `space`     | Spaces (folders)                          |
| `org`       | Organization settings                     |
| `api`       | Direct API access (escape hatch)          |
| `config`    | Manage CLI configuration                  |
| `setup`     | Setup wizard                              |

### Escape Hatch

Access any Lightdash API endpoint directly:

```bash
ldash api GET /api/v1/org/projects
ldash api POST /api/v1/projects/{uuid}/sqlQuery --body '{"sql":"SELECT 1"}'
```

### Output

- Default: pretty-printed JSON
- `--json`: compact JSON for piping

```bash
ldash chart list --json | jq '.[].name'
```

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
