# CLAUDE.md

## What is ldash?

CLI for Lightdash BI platform. Query data, explore data models, browse dashboards and charts.

Run `ldash --help` to see all commands.

## Setup

```
ldash setup https://your-instance.com     # save URL + open browser for PAT
ldash setup --api-key <token>             # save API key + list projects
ldash setup --project-uuid <uuid>         # done
```

Config stored in `~/.config/ldash/config.json`. Env vars (`LIGHTDASH_API_KEY`, `LIGHTDASH_PROJECT_UUID`, `LIGHTDASH_API_URL`) override if set.

## Agent Workflows

### Understand the data model

```
ldash explore list              # see all tables/models
ldash explore get <name>        # see dimensions, metrics, joins
ldash catalog metrics           # see all defined metrics
```

### Query data

```
ldash query run <explore> --dimensions '["d"]' --metrics '["m"]' [--limit N]
ldash query sql "SELECT ..."    # raw SQL
```

### Browse BI content

```
ldash dashboard list            # find dashboards
ldash dashboard get <uuid>      # get tiles, filters, chart UUIDs
ldash chart get <uuid>          # get chart definition + data
ldash chart results <uuid>      # get data only
```

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

## Command Reference

Run `ldash --help` for all groups.
Run `ldash <group> --help` for group commands.
Run `ldash <group> <command> --help` for usage, examples, and next steps.

## Development

- `pnpm build` -- compile TypeScript to `dist/`
- `pnpm lint` -- lint with Biome
- `pnpm format` / `pnpm format:fix` -- check / fix formatting with Prettier
- `pnpm fix` -- format + lint fix
- `pnpm validate` -- format + lint + typecheck (CI equivalent)

### Architecture

- `src/cli.ts` -- entry point, group/command router, 3-layer help
- `src/api.ts` -- Lightdash API functions (shared layer)
- `src/config.ts` -- config file (~/.config/ldash/config.json) + env var resolution
- `src/commands/` -- command groups (explore, query, chart, dashboard, catalog, project, space, org, api-escape, config, setup)
- `src/errors.ts` -- CliError (What+Why+Hint), error formatting
- `src/output.ts` -- output with `--json` flag support

### Adding a Command

1. Add API function in `src/api.ts`
2. Add command in `src/commands/<group>.ts` with description, usage, examples, nextSteps
