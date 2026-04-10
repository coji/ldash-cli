# ldash

CLI tool for [Lightdash](https://www.lightdash.com/) API, designed for coding agents (Cursor, Claude Code) and humans.

Query data, explore models, manage dashboards and charts from the terminal.

## Install

```bash
npm install -g ldash-cli
```

## Setup

Interactive wizard:

```bash
ldash setup
```

Or step-by-step (agent-friendly):

```bash
ldash setup https://your-instance.com     # save URL + open browser for PAT
ldash setup --api-key <token>             # save API key + list projects
ldash setup --project-uuid <uuid>         # save project UUID, done
```

Config is stored in `~/.config/ldash/config.json`. Environment variables (`LIGHTDASH_API_KEY`, `LIGHTDASH_PROJECT_UUID`, `LIGHTDASH_API_URL`) take precedence if set.

## Usage

```bash
ldash <group> <command> [args...] [--json]
```

### Groups

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

### Quick Start

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
ldash dashboard get <dashboardUuid>
ldash chart get <chartUuid>
```

### Escape Hatch

Access any Lightdash API endpoint directly:

```bash
ldash api GET /api/v1/org/projects
ldash api POST /api/v1/projects/{uuid}/sqlQuery --body '{"sql":"SELECT 1"}'
```

### Output

- Default: pretty-printed JSON
- `--json`: compact single-line JSON (for piping to `jq`)

```bash
ldash chart list --json | jq '.[].name'
```

### Help

3-layer help system:

```bash
ldash --help                    # all groups
ldash explore --help            # commands in a group
ldash explore get --help        # usage, examples, next steps
```

### Error Messages

Errors include What, Why, and Hint for self-correction:

```
Error: Missing required argument <exploreId>
Why: "explore get" needs a exploreId to look up.
Hint: Run "ldash explore list" to see available options.
```

## How is this different from the official Lightdash CLI?

The official [`@lightdash/cli`](https://www.npmjs.com/package/@lightdash/cli) focuses on **dbt development workflows** — compiling, deploying, previewing, and generating schema files.

`ldash` focuses on **data access and BI content browsing** — querying data, exploring models, and inspecting dashboards/charts via the Lightdash API.

|                                | Official `lightdash`     | `ldash`                  |
| ------------------------------ | ------------------------ | ------------------------ |
| **Purpose**                    | dbt dev & deploy         | Data access & queries    |
| **dbt compile/deploy/preview** | Yes                      | No                       |
| **schema.yml generation**      | Yes                      | No                       |
| **Explore data models**        | No                       | Yes                      |
| **Run metric queries**         | No                       | Yes                      |
| **Browse charts/dashboards**   | No                       | Yes                      |
| **Data catalog**               | No                       | Yes                      |
| **SQL execution**              | DWH direct (dbt profile) | API-based                |
| **Auth**                       | Login (email/token)      | Config file / env vars   |
| **Target users**               | dbt developers           | Coding agents & analysts |

They are complementary — use both if you need dbt workflows AND data access.

## License

MIT
