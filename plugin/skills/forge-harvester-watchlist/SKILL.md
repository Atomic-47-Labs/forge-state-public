---
name: forge-harvester-watchlist
description: Wild-source intake. Watch a configured list of GitHub authors / orgs that have historically produced forge-quality work — Karpathy, dottxt-ai, motiful, Mentra-Community, HKUDS, safishamsi, calesthio, nolly-studio, github (Spec Kit), pinokiocomputer — and enqueue any new public repos (or major new release tags) they ship as forge candidates. Targets the "productive authors keep being productive" signal. Trigger via "/forge-harvester-watchlist [--owner <name>]" or invoked by forge-orchestrator. Tracks per-owner last-seen repo + last-seen release-tag in state/wild-cursor.yaml.
experiment_origin: themes-synthesis-2026-06-25
---

# forge-harvester-watchlist — productive authors keep being productive

By the close of EXP-0018, forge had benched repos from these owners with high success rates:

| owner | experiments | hit rate |
|---|---|---|
| Karpathy (`karpathy`) | EXP-0006 (autoresearch via Wolfe), EXP-0009 (autoresearch), EXP-0010 (llm-council) | 3/3 strong-shape |
| dottxt-ai | EXP-0011 (outlines) | 1/1 strong |
| HKUDS | EXP-0005 (mentraos), EXP-0015 (vibe-trading) | 2/2 strong |
| Mentra-Community | EXP-0005 | 1/1 strong |
| nolly-studio | EXP-0008 (cult-ui) | 1/1 strong |
| motiful | EXP-0002 (cc-gateway) | 1/1 partial-strong |
| safishamsi | EXP-0018 (graphify) | 1/1 strong |
| calesthio | EXP-0017 (openmontage) | 1/1 strong |
| github (Spec Kit) | EXP-0012 | 1/1 strong |
| pinokiocomputer | EXP-0007 (pinokio) | 1/1 partial |

Every benched repo from these owners produced substantive content — no abandoned experiments, no trivial pattern-notes (other than the hosted-SaaS gates we expected). When a productive author ships a new repo, the prior on it being worth a forge bench is very high. This skill turns that prior into action.

## Why this exists

The Slack-🧪 harvester is good at incidental discovery. The watchlist harvester is good at **systematic coverage of known good signal**. Together they cover both the unknown-unknown surface (random projects David spots) and the known-known surface (authors we've already validated).

## When to use

- On-demand: `/forge-harvester-watchlist` (sweeps every owner in the manifest).
- `/forge-harvester-watchlist --owner karpathy` for a single-owner check.
- Nightly from `forge-orchestrator`. Sweeps run cheaply; new public repos from any of these owners are immediately enqueued.

## Watchlist

Default `intake.watchlist[]` in `manifest.yaml`:

```yaml
intake:
  watchlist:
    - { owner: karpathy,             reason: "autoresearch, llm-council, nanoGPT lineage" }
    - { owner: dottxt-ai,            reason: "outlines (structured generation); production deps in NVIDIA/vLLM/HF stack" }
    - { owner: HKUDS,                reason: "vibe-trading, mentraos; academic-quality OSS releases" }
    - { owner: Mentra-Community,     reason: "MentraOS — high-discipline monorepo, 33/33 tests" }
    - { owner: nolly-studio,         reason: "cult-ui — registry/shadcn-style component lib" }
    - { owner: motiful,              reason: "cc-gateway, cc-cache-audit; privacy/proxy patterns" }
    - { owner: safishamsi,           reason: "graphify (knowledge graphs); YC S26" }
    - { owner: calesthio,            reason: "OpenMontage — 115 SKILL.md, agentic video" }
    - { owner: github,               reason: "spec-kit — agent integration matrix" }
    - { owner: pinokiocomputer,      reason: "pinokio — local agent launcher" }
    - { owner: Mistral-Community,    reason: "watch for self-host releases (re: EXP-0016 verdict)" }
    - { owner: allenai,              reason: "olmocr — open OCR; flagged as Mistral OCR 4 alternative" }
```

Owners are added by **explicit promotion** after a successful bench, never automatically. Forge's bench results are the gate.

## Signals tracked per owner

For each owner the skill tracks two surfaces:

1. **New public repos.** `gh api users/<owner>/repos?per_page=30&type=public&sort=created` — fetch repos that didn't exist on the previous sweep.
2. **New major release tags.** `gh api repos/<owner>/<repo>/releases?per_page=10` for each *previously-benched* repo — if a new major (X.0 or feature-flagged) release has shipped since forge's last bench, enqueue a re-bench candidate at `phase: candidate` with `re_bench: true`.

The same gates as `forge-harvester-github` apply (stars ≥ 5 for owner-watch — relaxed because these owners are pre-validated; license OSI-approved; recent commit).

## Inputs

- `manifest.yaml` → `intake.watchlist[]` (see schema above).
- `state/wild-cursor.yaml` → per-owner `seen_repos[]` and `seen_release_tags[<repo>]`.
- `gh` CLI authenticated.

## Outputs

- Zero or more new `experiments/EXP-NNNN-<slug>/experiment.yaml` records at phase `candidate`. Set `source.surface: github-watchlist`, `source.owner: <name>`, `source.url: <repo-url>`, `source.discovery_reason: "new-repo" | "new-release"`, `source.watchlist_reason: "<owner's reason from manifest>"`.
- Updated `state/wild-cursor.yaml`.
- Activity event `{op: wild-harvest, source: watchlist, owner: "<name>", id: EXP-NNNN}`.

## Procedure

1. `forge-state read` manifest + cursor.
2. For each owner in `intake.watchlist[]`:
   a. `gh api users/<owner>/repos?per_page=30&type=public&sort=created` — get the most recent 30 public repos.
   b. Diff against `wild-cursor[owner].seen_repos[]`. For each new entry:
      - Apply gates (stars, license, recent activity).
      - Allocate EXP-NNNN, write candidate `experiment.yaml`, append to `seen_repos[]`.
   c. For each previously-benched repo by this owner (look up via `experiments/*/experiment.yaml` filter on `repo.url`):
      - `gh api repos/<owner>/<repo>/releases?per_page=5` — get latest releases.
      - If the latest release tag is newer than `seen_release_tags[<repo>]`, enqueue a re-bench candidate.
3. Emit activity events.
4. Hand off control to `forge-orchestrator`.

## Promotion / demotion

The watchlist is a curated list, not an open registry:

- **Promotion** is manual. After a successful bench, if the owner has shipped *another* repo forge benched well, the skill suggests an entry for `intake.watchlist[]` — but the human approves the addition.
- **Demotion** is also manual. If an owner ships three consecutive forge-failed benches, the skill flags a removal candidacy.

## Budget

Trivial. Each owner = ~2 API calls (repos list + 1-3 release-lookup calls for previously-benched repos). Default 12-owner watchlist = ~30 calls. Safe to run hourly.

## Error handling

- `gh api` 404 on owner (renamed / deleted) → mark owner as inactive in `wild-cursor.yaml`, surface to orchestrator for review.
- Rate limit → sleep + retry once.
- Owner has no repos (empty user account) → log + skip; no error.

## References

- The "productive authors" signal across all 18 forge experiments to date.
- Spec §8 (intake contract — extended to author-watch).
- forge-harvester-github (sibling skill — code-search wild harvest; different signal, complementary).
- forge-harvester-rss (sibling skill — feed-based wild harvest; complementary).
