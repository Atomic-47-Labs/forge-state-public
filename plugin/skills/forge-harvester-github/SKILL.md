---
name: forge-harvester-github
description: Wild-source intake. Use GitHub Code Search (gh api) to find public repos containing one of forge's tracked agent-instruction files — SKILL.md, AGENTS.md, program.md, .claude/, .cursor/, .codex/ — and enqueue the freshest, highest-signal ones as forge candidates. Targets the strongest cross-experiment finding (the SKILL.md / AGENTS.md convergence; see EXP-0005, 0009, 0012, 0015, 0017, 0018). Trigger via "/forge-harvester-github [--query <q>] [--max <n>]" or invoked by forge-orchestrator. Tracks per-query cursor in state/wild-cursor.yaml so it never re-emits the same repo twice.
experiment_origin: themes-synthesis-2026-06-25
---

# forge-harvester-github — find SKILL.md repos in the wild

The forge `#development` 🧪 harvester is **inbound** — it waits for David to surface candidates. This skill is **outbound** — it actively scans GitHub for new repos using the agent-instruction conventions forge has now benched in ten+ projects, and enqueues the ones forge hasn't seen yet.

## Why this exists

By the close of EXP-0018, the SKILL.md / AGENTS.md / program.md / `.claude/` / `.cursor/` convention was visible in:

- forge itself (the 10+ skills under `plugin/skills/forge-*`)
- spec-kit (25-agent integration matrix)
- openmontage (115 SKILL.md files — the densest)
- vibe-trading (`agent/SKILL.md`)
- autoresearch (`program.md`, Karpathy's variant)
- graphify (CLI installs into 17 different agents' config dirs)
- mentraos (protocol convention)
- the vibe-studio suite (10 SKILL.md sibling skills)
- cult-ui (registry — convention-adjacent)
- Anthropic's own skills marketplace

That's enough independent occurrences to call it an industry convention. Every new repo adopting it is automatically a forge-bench-able candidate. This skill finds them.

## When to use

- On-demand: `/forge-harvester-github` (default sweep across the tracked queries).
- `/forge-harvester-github --query <q> --max <n>` for a targeted sweep.
- Nightly from `forge-orchestrator` (after the Slack harvester), with `--max 10` to bound queue growth.

## Tracked queries

Each is a GitHub Code Search expression. Run via `gh api search/code -F q="<expr>" -F per_page=N`.

| query | what it finds |
|---|---|
| `path:/SKILL.md` | Repos with a SKILL.md at the root — the strongest single signal. |
| `path:/AGENTS.md` | Repos using the GitHub Spec Kit / OpenMontage style AGENTS.md convention. |
| `path:/CLAUDE.md NOT path:/AGENTS.md` | Repos that target Claude Code specifically (CLAUDE.md is Anthropic's convention; many projects ship both). The exclusion avoids double-counting. |
| `path:/program.md "fixed time budget"` | Karpathy-style autoresearch.md skill files — narrow, high-signal. |
| `filename:SKILL.md "experiment_origin"` | Skills emitted by forge experiments (see EXP-0006). |

For each result, gate inclusion on:

- **stars ≥ 10** (filters out demo / placeholder repos).
- **last commit ≤ 90 days** (filters out abandoned).
- **license is OSI-approved** (MIT, Apache, BSD, MPL, AGPL — anything not "no license" / "all rights reserved").

Optional filters (configurable via flag, off by default):
- `--language python` / `--language typescript` to scope toolchain.
- `--min-stars 100` for higher-signal sweeps.

## Inputs

- `manifest.yaml` → `intake.wild_targets[]` (list of queries; defaults to the table above).
- `state/wild-cursor.yaml` → per-query last-seen repo set (so the same repo isn't enqueued twice across runs).
- `gh` CLI authenticated as the worksona account (read-only `repo:public` scope is enough).

## Outputs

- Zero or more new `experiments/EXP-NNNN-<slug>/experiment.yaml` records at phase `candidate`.
- Updated `state/wild-cursor.yaml`.
- Activity event `{op: wild-harvest, source: github-code-search, id: EXP-NNNN, query: "<q>"}`.

## Procedure

1. `forge-state read` manifest + `state/wild-cursor.yaml`.
2. For each query in `intake.wild_targets[]`:
   a. `gh api search/code -F q="<expr>" -F per_page=30`
   b. Skip results already in `wild-cursor[query].seen_repos[]`.
   c. For each new repo:
      - Fetch `gh api repos/<owner>/<repo>` for stars, license, last commit, language.
      - Apply gates (stars / age / license). Drop if fails.
      - `forge-state allocate-id` → EXP-NNNN.
      - Derive slug from repo name (kebab-case, max 40 chars).
      - Write `experiment.yaml` at phase `candidate` with `source.surface: github-code-search`, `source.query: "<expr>"`, `source.url: <repo URL>`, `source.marker_form: wild-harvest`, `source.discovered_at: <ISO>`.
   d. Append the seen repos to `wild-cursor[query].seen_repos[]` (dedup, keep the last 500 per query — rotate older).
3. Emit activity events.
4. Hand off control to `forge-orchestrator` (or exit if invoked solo).

## Gates that matter

These prevent the wild-harvester from polluting the queue:

- **Stars ≥ 10**: skips demos, placeholders, ChatGPT-generated empty repos.
- **License OSI-approved**: forge can build, redistribute, and write up freely. Unlicensed repos go on a follow-up list, not into the bench queue.
- **Recent commit (≤ 90 days)**: abandoned projects rarely produce interesting bench evidence; the upstream is dead.
- **Dedup vs forge's own benched set**: never enqueue a repo that already has an EXP-NNNN record (check `experiments/*/experiment.yaml` `repo.url`).
- **Owner allowlist enforcement** (when `intake.wild_owners_only: true`): only enqueue if the owner is in `intake.wild_owners[]` — useful for a "Karpathy + dottxt-ai + safishamsi only" tight sweep.

## Budget

GitHub code-search API rate limit is generous for authenticated requests (5000/h) but each query returns up to 100 results. The default sweep (5 queries × 30 results × repo metadata fetch) is ~150 API calls — safe to run hourly.

## Error handling

- `gh api` returns 403 / rate-limit → sleep until reset, retry once, abort otherwise.
- Network unreachable → skip with structured error to orchestrator; do not advance cursor.
- Repo with no detectable license → record `repo.license: unknown`, downgrade to a watch entry, do not enqueue.

## References

- Spec §8 (intake contract — extended to wild sources).
- EXP-0012 (Spec Kit — 25 AI-coding-agent integration matrix as the canonical signal of convention adoption).
- EXP-0017 (OpenMontage — 115 SKILL.md as the high-water-mark proof point).
- EXP-0018 (Graphify — `--platform <agent>` flag pattern as a convention-detection signal).
