# forge-state

A local-first lab bench for open-source projects. You mark a project announcement in Slack with 🧪; nightly, forge researches it, clones it, builds it inside a sealed Docker sandbox, runs a real experiment against it, packages it into something runnable, and ships two artifacts — a writeup (gist + scsiwyg blog post) and a deployable bundle (Dockerfile + compose + RUN.md, plus an image on GHCR). Build failures are kept and published as findings, not discarded.

Sibling to `desk-state`, `work-state`, and `notella`.

**📊 Slide deck:** [`site/index.html`](site/index.html) — 14-slide walkthrough of the architecture, lifecycle, sandbox, and install. Deploys to Netlify as a static site (see `netlify.toml`).

## Quickstart

```bash
# 1. Create the facility on disk (idempotent)
bash scripts/init-facility.sh

# 2. Smoke-test the orchestrator in dry-run mode
bash scripts/test-run.sh

# 3. From inside a Claude Code session, walk the queue once:
#    /forge-orchestrator --once
```

## Facility location

```
~/forge/
  manifest.yaml
  experiments/EXP-NNNN-<slug>/...
  state/
    state.json
    activity.ndjson
    cursor.yaml
    forge.lock
    logs/run-YYYY-MM-DD.txt
```

Machinery lives in `state/` (visible), not `.state/` — forge-state intentionally avoids hidden directories so the facility is browsable. **The one exception** is `plugin/.claude-plugin/plugin.json` inside this repo: the Claude Code plugin loader requires that exact dotted path, so it cannot be moved. Everywhere else, no dotfiles.

## Locked configuration decisions

| Spec §18 item | Locked value |
|---|---|
| Packaging push | YES — push to `ghcr.io/davidolsson` (token via `$GHCR_TOKEN`) |
| Blog publishing | Auto-publish to scsiwyg |
| Intake channel + marker | `#general` with `🧪`, self-only |
| Durability mirror | GitHub private repo — **you must set `durability.mirror.remote` in `~/forge/manifest.yaml`** before relying on the mirror; it is left `null` after init |
| Facility location | `~/forge/` visible, `state/` (not `.state/`) for machinery |

## Required setup

1. **Docker Desktop** running on macOS or Windows (the data plane).
2. **`$GHCR_TOKEN`** env var with `write:packages` scope, exported in the launchd/shell environment that runs the orchestrator.
3. **Secrets** registered in your sops-age store under the refs listed in `manifest.secrets.refs` (`anthropic`, `slack`, `github`, `scsiwyg`, `ghcr`).
4. **GitHub mirror repo** (private) created, then set `durability.mirror.remote` in the manifest.

## The skills

- `/forge-state` — substrate spine; only writer to disk.
- `/forge-harvester-slack` — drains 🧪 reactions in `#general` into candidate records.
- `/forge-researcher` — fills what / who / why / comparables / license.
- `/forge-builder` — clones, pins, classifies, builds in Docker. Outcome: built or build-failed (both advance).
- `/forge-experimenter` — picks a §10 template, runs a bounded experiment in the sandbox.
- `/forge-packager` — emits `deploy/` bundle, pushes image to GHCR.
- `/forge-reporter` — composes `report.md` (success and failure senses).
- `/forge-publisher` — gist + scsiwyg blog (auto-publish) + work-state event; scrubs secrets first.
- `/forge-orchestrator` — nightly walk, thin router, `--once` and `--dry-run` supported.

## Install

This repo is a one-plugin Claude Code marketplace — the `.claude-plugin/marketplace.json` at the root makes it directly installable.

**From a git remote** (recommended for sharing):

```
/plugin marketplace add <owner>/forge-state
/plugin install forge-state@forge-state
```

**From a local clone:**

```
git clone <repo-url> ~/src/forge-state
# In a Claude Code session:
/plugin marketplace add ~/src/forge-state
/plugin install forge-state@forge-state
```

**From the release tarball** (`dist/forge-state-0.1.0.tgz`):

```
mkdir -p ~/src && tar -xzf forge-state-0.1.0.tgz -C ~/src
/plugin marketplace add ~/src/forge-state
/plugin install forge-state@forge-state
```

After install, restart Claude Code so the 9 `/forge-*` skills load, then run `bash scripts/init-facility.sh` once to create `~/forge/`.

> Author's local setup additionally symlinks the plugin into `~/.claude/plugins/marketplaces/local-desktop-app-uploads/forge-state` alongside `learn-state`, `project-state`, and `notella`. End users do not need to do this.

## Spec

The source of truth is `forge-state-spec.md` in this repo. Read it before changing the architecture; it locks the invariants (local-first, single-writer, two-plane isolation, build-failed-is-terminal-with-findings, secrets never reach the data plane).
