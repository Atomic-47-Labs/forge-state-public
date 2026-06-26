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
| Intake channel + marker | `#development` with `🧪`, self-only |
| Durability mirror | GitHub private repo — **you must set `durability.mirror.remote` in `~/forge/manifest.yaml`** before relying on the mirror; it is left `null` after init |
| Facility location | `~/forge/` visible, `state/` (not `.state/`) for machinery |

## Required setup

1. **Docker Desktop** running on macOS or Windows (the data plane).
2. **`$GHCR_TOKEN`** env var with `write:packages` scope, exported in the launchd/shell environment that runs the orchestrator.
3. **Secrets** registered in your sops-age store under the refs listed in `manifest.secrets.refs` (`anthropic`, `slack`, `github`, `scsiwyg`, `ghcr`).
4. **GitHub mirror repo** (private) created, then set `durability.mirror.remote` in the manifest.

## The skills

**Substrate + orchestrator**

- `/forge-state` — substrate spine; only writer to disk.
- `/forge-orchestrator` — nightly walk, thin router, `--once` and `--dry-run` supported. Calls all four harvesters before draining the phase queue.

**Intake (four harvesters: one inbound, three wild)**

- `/forge-harvester-slack` — *inbound*. Drains 🧪 reactions in `#development` into candidate records.
- `/forge-harvester-github` — *wild*. GitHub Code Search for repos with `SKILL.md` / `AGENTS.md` / `program.md` / `CLAUDE.md`. Gates: stars ≥ 10, OSI license, commit ≤ 90d. Configured via `intake.wild_targets[]`.
- `/forge-harvester-rss` — *wild*. Watches RSS feeds (MarkTechPost, HuggingFace blog, Anthropic news, Cameron R. Wolfe substack, dottxt blog, opensourceprojects.dev) for recipe-style posts ("Using X and Y to do Z", "Introducing X", "Open-source launch of X"). Feeds article-as-spec candidates downstream.
- `/forge-harvester-watchlist` — *wild*. Tracks a curated list of authors who've shipped strong forge benches (karpathy, dottxt-ai, HKUDS, Mentra-Community, nolly-studio, motiful, safishamsi, calesthio, github, pinokiocomputer, Mistral-Community, allenai). Enqueues new repos + new major release tags.

The three wild harvesters were emitted from the EXP-0001..0018 themes-at-18 synthesis. The Slack 🧪 path remains primary; the wild harvesters add active discovery between human surfacings.

**Lifecycle**

- `/forge-researcher` — fills what / who / why / comparables / license.
- `/forge-builder` — clones, pins, classifies, builds in Docker. Outcome: built or build-failed (both advance).
- `/forge-experimenter` — picks a §10 template (incl. non-build templates: `article-as-spec`, `paper-claim-reproduce`, `tpa-pin-and-bench`, `commentary-pattern-note`), runs a bounded experiment in the sandbox.
- `/forge-packager` — emits `deploy/` bundle, pushes image to GHCR; promotes forge-original artifacts to standalone GitHub repos when they meet the 3-criterion rule (forge-original, installable via standard package manager, fork-friendly).
- `/forge-reporter` — composes `report.md` (success and failure senses).
- `/forge-publisher` — gist + scsiwyg blog (locked to `/forge`, layman-intro required) + work-state event; scrubs secrets first.

**Self-reflection**

- `/forge-introspector` — reads every published experiment's "What I didn't run" section, every entry in `state.json.policy_notes[]` / `follow_up_notes[]`, and every error-shaped activity event, clusters them, and writes a **capability work-order doc** to `state/introspection/YYYY-MM-DD.md`. Each work order proposes a specific remedy (new template / new skill / manifest change / spec change / harvester-gates change) with ≥3 supporting EXP references. Read-and-propose only — never mutates the substrate. Closes the loop where forge previously needed a human to spot recurring walls.

**Skills emitted by experiments**

- `/forge-agentic-rl` — companion to the `agentic-rl-runner` package promoted out of EXP-0006.

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

After install, restart Claude Code so the 14 `/forge-*` skills load (state spine + orchestrator + 4 harvesters + 6 lifecycle skills + `forge-introspector` + `forge-agentic-rl`), then run `bash scripts/init-facility.sh` once to create `~/forge/`.

> Author's local setup additionally symlinks the plugin into `~/.claude/plugins/marketplaces/local-desktop-app-uploads/forge-state` alongside `learn-state`, `project-state`, and `notella`. End users do not need to do this.

## Spec

The source of truth is `forge-state-spec.md` in this repo. Read it before changing the architecture; it locks the invariants (local-first, single-writer, two-plane isolation, build-failed-is-terminal-with-findings, secrets never reach the data plane).
