---
name: forge-researcher
description: Use when a forge experiment is in phase `candidate` and needs its research block filled — what the project is, who built it, why it's notable, comparables, and license. Trigger via "/forge-researcher EXP-NNNN", or invoked by forge-orchestrator on every candidate during a nightly walk. Writes research.md and updates the experiment record through forge-state, advancing phase to `researched`.
---

# forge-researcher — what / who / why / comparables / license

## When to use

- An experiment is at phase `candidate` and the next step in §6 lifecycle is `researched`.
- The user explicitly asks to (re)research a specific EXP-id.

## Inputs

- `experiment.yaml` for the EXP — needs `source.url` (repo URL).
- Web access (WebSearch, WebFetch).
- No secrets enter the data plane (this runs on the host).

## Outputs

- `experiments/EXP-NNNN-<slug>/research.md` (markdown, 200–600 words).
- Updated `experiment.research.{what, who, why_notable, comparables[], source_refs[]}` and `experiment.repo.license`.
- Phase advanced to `researched` via `forge-state advance-phase`.

## Procedure

1. `forge-state read` the experiment record.
2. Fetch the repo's README and LICENSE via WebFetch (raw.githubusercontent if GitHub).
3. WebSearch for: project name + "review", + "vs <obvious comparable>", + author handle.
4. Synthesize:
   - **what**: one-sentence functional description.
   - **who**: maintainers, affiliation, contributor count if observable.
   - **why_notable**: the specific claim that makes this worth a bench experiment.
   - **comparables**: 1–4 named projects (cite by repo name).
   - **license**: SPDX id from LICENSE file or repo metadata.
   - **source_refs**: 3–8 URLs (README, comparable repos, reviews/blogs).
5. Compose `research.md`: TL;DR / What it is / Why it's notable / Comparables / License / Sources.
6. Route writes through `forge-state write` — never touch disk directly.
7. `forge-state advance-phase EXP-NNNN researched`.

## Error handling

- Repo unreachable → record `repo.license: unknown`, write a minimal research.md noting unreachability, still advance to `researched` (the builder will hard-fail next and that is itself a finding).
- License ambiguous → record `repo.license: unclear` and surface in research.md.

## Out of scope

This skill only reads the web and writes `research.md` + the `research`
block via `forge-state`. It never clones the repo (that's `forge-builder`'s
job) and never touches git/gh in any way.

## References

- Spec §5.1 (research block), §6 (lifecycle), §7 (skill table).
