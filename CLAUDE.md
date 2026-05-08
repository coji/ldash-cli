# CLAUDE.md

## What is ldash?

CLI for Lightdash BI platform. Query data, explore data models, browse dashboards and charts.

Run `ldash --help` to see all commands.

## Setup

```
ldash setup                                       # OAuth in the browser (default)
ldash setup https://your-instance.com             # OAuth against a specific instance
ldash setup --pat                                 # paste a Personal Access Token
ldash setup --api-key <token> --project-uuid <u>  # non-interactive (agents/CI)
ldash setup --check                               # is this env ready to run setup?
```

Config stored in `~/.config/ldash/config.json`. Env vars (`LIGHTDASH_API_KEY`, `LIGHTDASH_PROJECT_UUID`, `LIGHTDASH_API_URL`) override if set.

For agents and CI, prefer env vars over `setup`:

```
export LIGHTDASH_API_URL=https://app.lightdash.cloud
export LIGHTDASH_API_KEY=<personal-access-token>
export LIGHTDASH_PROJECT_UUID=<project-uuid>
ldash config show --json | jq .ready              # true once all three resolve
ldash doctor                                      # verify token + project access
```

`ldash setup --check` reports the current state non-interactively (TTY, env vars, config-file presence) and exits non-zero when not ready, so it's safe to gate on: `ldash setup --check || exit`.

## Agent Workflows

### Find anything by name

```
ldash search "<query>"                            # cross-cutting search
ldash search "<query>" --kind chart               # narrow by kind
ldash search "<query>" --kind chart,dashboard --limit 20
```

Each hit includes a `nextCommand` you can run to drill in. Kinds: `table`, `field`, `dimension`, `metric`, `chart`, `dashboard`, `space`.

### Understand the data model

```
ldash explore list              # see all tables/models
ldash explore get <name>        # see dimensions, metrics, joins
ldash catalog metrics           # see all defined metrics
ldash query filter-ops          # valid FilterRule operators + value shapes
```

### Query data

```
ldash query run <explore> --dimensions '["d"]' --metrics '["m"]' [--filters '<json>'] [--limit N]
ldash query sql "SELECT ..."    # raw SQL
```

`--limit` defaults to 500 server-side. Run `ldash query run --help` for the full filter shape and an example payload.

### Browse BI content

```
ldash dashboard list            # find dashboards
ldash dashboard get <uuid>      # get tiles, filters, chart UUIDs
ldash chart get <uuid>          # get chart definition + data
ldash chart results <uuid>      # get data only
```

### Health check

```
ldash doctor                    # apiUrl → apiKey → auth → project
ldash doctor --json             # machine-readable, with stable codes per check
```

Exits non-zero on any failed check, so `ldash doctor && deploy` works as a CI gate.

### Export as code

```
ldash chart code                # all charts as code
ldash dashboard code            # all dashboards as code
```

### When CLI doesn't cover your need

```
ldash api GET /api/v1/org/projects
ldash api POST /api/v1/projects/{uuid}/sqlQuery --body '{"sql":"SELECT 1"}'
```

## Input shortcuts

Every JSON-bearing flag (`--filters`, `--sorts`, `--dimensions`, `--metrics`, `--body`) and the `query sql` positional accept:

- `-` → read from stdin (`cat filters.json | ldash query run orders --filters -`)
- `@path/to/file` → read from a file (`ldash query run orders --filters @./filters.json`)
- otherwise treated as an inline value

Use these to dodge nested-shell quoting on complex JSON.

## Output shortcuts

- `--json` — compact JSON for piping
- `--fields a,b,c` — project list/object results down to selected keys
- `--compact` — apply a sensible per-command default subset (`uuid,name,description` etc.)

```
ldash chart list --compact                        # uuid + name + description
ldash chart list --fields uuid,name,spaceName     # custom subset
```

## Error envelope

Under `--json`, every error returns a structured envelope with a stable `code`:

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

Branch on `code` rather than parsing message text. Codes include `AUTH_MISSING`, `AUTH_INVALID`, `FORBIDDEN`, `PROJECT_MISSING`, `EXPLORE_NOT_FOUND`, `FIELD_NOT_FOUND`, `CHART_NOT_FOUND`, `DASHBOARD_NOT_FOUND`, `SPACE_NOT_FOUND`, `RATE_LIMITED`, `UPSTREAM`, `NETWORK`, `INVALID_INPUT`, `MISSING_FLAG`, `MISSING_ARGUMENT`, `UNKNOWN_FLAG`, `UNKNOWN_GROUP`, `UNKNOWN_COMMAND`, `BAD_REQUEST`, and `UNKNOWN` (full list in `src/errors.ts`). The hint usually points at a concrete next command (e.g. `EXPLORE_NOT_FOUND` → `Run "ldash explore list"`).

## Command Reference

Run `ldash --help` for all groups.
Run `ldash <group> --help` for group commands.
Run `ldash <group> <command> --help` for usage, examples, and next steps.

## Development

- `pnpm build` -- compile TypeScript to `dist/`
- `pnpm lint` -- lint with Biome
- `pnpm format` / `pnpm format:fix` -- check / fix formatting with Prettier
- `pnpm fix` -- format + lint fix
- `pnpm validate` -- format + lint + typecheck + test (CI equivalent)

### Architecture

- `src/cli.ts` -- entry point, group/command router, 3-layer help, top-level error envelope
- `src/api.ts` -- Lightdash API functions + `mapApiError` (status-code-aware error mapping)
- `src/config.ts` -- config file (~/.config/ldash/config.json) + env var resolution
- `src/commands/` -- command groups (explore, query, chart, dashboard, catalog, search, project, space, org, api-escape, config, setup, doctor)
- `src/errors.ts` -- `CliError` (What+Why+Hint+code), `CliErrorCode` union, JSON envelope
- `src/output.ts` -- `--json` / `--fields` / `--compact` projection
- `src/stdin.ts` -- `-` (stdin) and `@file` value resolution shared by every JSON-bearing flag

### Adding a Command

1. Add API function in `src/api.ts` (pass a `ResourceContext` to `throwOnError` so 404/403 hints stay actionable)
2. Add command in `src/commands/<group>.ts` with description, usage, examples, nextSteps, and an optional `compactFields` for `--compact`
