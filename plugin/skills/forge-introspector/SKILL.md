---
name: forge-introspector
description: Read forge's own capability walls and propose how to overcome them. Walks every published experiment's "What I didn't run" section, every entry in state.json.policy_notes[] / follow_up_notes[], and every error-shaped activity event, clusters the limitations by theme, and emits capability work orders — each one a proposed new template / new skill / budget bump / spec change with at least 3 supporting EXP references. Output is a work-order doc at state/introspection/YYYY-MM-DD.md plus an activity event; nothing in the substrate is mutated. Human approves or rejects each work order. Trigger via "/forge-introspector [--since EXP-NNNN] [--min-evidence 3]" or scheduled by forge-orchestrator every 5 published experiments.
experiment_origin: response-to-david-2026-06-26
---

# forge-introspector — close the self-research loop

By the close of EXP-0021, forge had published 21 experiments. Every
report writeup carries a **"What I didn't run"** section: the
capability walls forge hit during that bench but couldn't overcome
alone — Yuxi's 5-store stack exceeded budget, sift-kg's LLM steps
needed a secret forge isn't allowed to pass into the sandbox, Mistral
OCR 4 was hosted-only, Pinokio expected GUI input forge can't drive,
and so on. The walls are *visible in writeups* but **not aggregated**.
This skill is the aggregator.

## Why this exists

Forge already evolves — `article-as-spec` was added when EXP-0006 and
EXP-0013 both wanted to operationalize blog posts; `tpa-pin-and-bench`
was added when EXP-0017 and EXP-0021 wanted to bench too-heavy
stacks; the repos-vs-gists policy note was added when packaging hit
"should we re-host?" twice. **Every one of those upgrades was
triggered by a human noticing the pattern, not by forge itself.**

That's a single point of failure. forge-introspector closes it:
forge's reports already contain the walls — the skill reads them on a
cadence, clusters them, and proposes specific remedies as work
orders. The human stays in the loop for *approval*; the *spotting* is
no longer manual.

## When to use

- On-demand: `/forge-introspector`.
- Scheduled: nightly from `forge-orchestrator` *if* the count of
  published experiments has advanced ≥ 5 since the last introspection
  run (idle otherwise — no noise).
- With `--since EXP-NNNN`: only consider experiments published after
  the given id. Useful for "what did the last sprint expose?"
- With `--min-evidence N`: raise the bar from the default 3 EXP refs
  per work order to N. Default is 3; lower if you want broader
  proposals, higher if you only want the loudest patterns.

## Inputs

- `state.json` → `counts_by_phase.published`, `policy_notes[]`,
  `follow_up_notes[]`, `skills_emitted[]`, `skills_upgraded[]`,
  `last_introspection` (set by this skill, drives the "≥5 since last"
  check).
- `experiments/EXP-NNNN-*/report.md` → grep for headings
  `## What I didn't run`, `## Limitations`, `## Out of scope`, and
  for in-line phrases `couldn't`, `exceeded budget`, `secrets ... not
  passed`, `would require`, `hosted SaaS`.
- `experiments/EXP-NNNN-*/experiment.yaml` → `experiment.notes`,
  `build.notes`, and the `verdict` (pattern-note verdicts are
  themselves capability-wall signals).
- `state/activity.ndjson` → error-shaped events (`walk-aborted`,
  `build-failed`, `docker-unreachable`, `worker-error`, `LOCK_HELD`).

## Outputs

- `state/introspection/YYYY-MM-DD.md` — one work-order doc per run.
- Activity event `{op: introspect, work_orders: N, since: EXP-NNNN}`.
- `state.json.last_introspection` updated to the EXP id of the
  highest-numbered experiment considered.

The skill **does not** mutate experiments, manifests, schemas, or
other skills. It produces proposals; the human (or a follow-up
skill-edit session) implements them.

## Procedure

1. `forge-state read` → state.json + cursor + manifest.
2. Compute eligibility: `published_now - last_introspection ≥ 5`,
   unless `--force` or `--since`.
3. **Extract walls.** For each experiment in scope:
   a. Grep `report.md` for the heading set above; capture the
      following paragraph as a `wall_evidence` record.
   b. Grep `report.md` body for the in-line phrase set; capture
      surrounding sentence.
   c. Read `experiment.yaml.experiment.notes` and
      `experiment.yaml.build.notes` if present.
   d. Cross-reference with verdict — pattern-note verdicts produce
      a synthetic wall: "could not run live, classified as
      pattern-note."
4. **Cluster.** Group `wall_evidence` records by theme. Themes come
   from observable phrases:
   - `secrets-in-sandbox` (LLM API keys, OAuth tokens)
   - `budget-exceeded` (multi-service stacks, large image pulls)
   - `gui-required` (Pinokio-shape, Electron-shape)
   - `hosted-saas-only` (no self-host path)
   - `live-deploy-skipped` (template fell back to tpa-pin-and-bench)
   - `language-toolchain-missing` (Rust, Go, .NET — anything not
     in `manifest.sandbox.base_images`)
   - `data-required` (recommender systems with no public dataset)
   - `network-egress` (registries-only egress blocked the bench)
5. **Score each cluster.** A cluster qualifies as a work order if it
   has ≥ `--min-evidence` distinct EXP references.
6. **Propose a remedy per qualifying cluster.** Remedies fall into a
   small set:
   - **new template** for `forge-experimenter` (e.g. a
     `byok-sandboxed-llm` template that accepts an opt-in secret
     scoped to one EXP).
   - **new skill** (e.g. `forge-harvester-pinokio` if pinokio-style
     repos keep showing up).
   - **manifest change** (e.g. raise `night_budget_s`, add
     `base_images.rust`).
   - **spec change** (e.g. allow `tpa-pin-and-bench-no-spin` as a
     first-class verdict variant instead of a footnote).
   - **gates change** for `forge-harvester-github` (e.g. drop
     hosted-only repos at intake to skip the bench cycle entirely).
   For each, name 2-4 historical EXP refs that would have benefited.
7. **Write the work-order doc.** Format below. Sort work orders by
   evidence count (loudest patterns first).
8. **Append** `{op: introspect, ...}` to activity log.
9. **Refresh** `state.json.last_introspection`.

## Work-order doc format

```markdown
# forge introspection — YYYY-MM-DD

Coverage: EXP-NNNN through EXP-MMMM (K experiments since last run).
Walls extracted: N. Work orders proposed: P.

## WO-1: <one-line title>

**Remedy class:** new-template | new-skill | manifest | spec | gates
**Evidence (M refs):**
- EXP-0021 (yuxi): "couldn't spin up 5-store stack — exceeded budget"
- EXP-0017 (openmontage): "..."
- ...

**Proposal:**
<2-3 paragraph proposal: what specifically to add/change, in which
file, with which default value.>

**Expected impact:**
<which historical experiments would have produced a different
verdict / artifact had this remedy been in place.>

**Risk / cost:**
<what this trades against — sandbox egress, secret exposure surface,
night budget, etc.>

**Confidence:** high | medium | low
```

## Worked example (what a first run today would produce)

After EXP-0001..EXP-0021, the loudest pattern is **budget-exceeded for
multi-service stacks**: EXP-0017 openmontage, EXP-0021 Yuxi, and
arguably EXP-0007 pinokio all fell back to `tpa-pin-and-bench-no-spin`
because their full deploys exceeded the per-experiment budget. The
work order would propose:

> **WO-1: First-class `tpa-pin-and-bench-no-spin` template** —
> elevate the no-spin variant from a footnote in `forge-experimenter`
> to a named template with its own checklist (router inventory,
> dependency surface, agent-instruction convention, storage profile).
> Add `experiment.kind: structural` to `experiment.yaml` and emit a
> "structural verdict" badge in published reports so readers can
> distinguish structural-only benches from live-deploy benches.

The second-loudest pattern is **secrets-in-sandbox**: EXP-0011
outlines, EXP-0013 ARD, EXP-0018 graphify, and EXP-0020 sift-kg all
have LLM-driven core steps that the bench couldn't exercise.
Work order:

> **WO-2: `byok-sandboxed-llm` template** — opt-in, per-experiment,
> single-scope secret injection. The user passes `--llm-key
> $OPENAI_API_KEY` to `forge-experimenter`; the key enters a
> separate ephemeral container with no host mount, only the
> experiment input + the LLM endpoint. Output is read out via stdout
> only. Spec §11 amended to allow this opt-in path with explicit
> per-bench audit log.

Both proposals would be written into today's
`state/introspection/2026-06-26.md` and sit there until David
approves them.

## Boundary

forge-introspector is a *read-and-propose* skill, not a *mutate* skill:

- It writes one doc (`state/introspection/YYYY-MM-DD.md`) and one
  log line. Nothing else.
- It never edits SKILL.md, manifest.yaml, schemas, or experiments.
- The human implements the work order in a separate session — or
  asks Claude to.

This matches the same pattern forge already uses for policy notes
and follow-up notes: capture the finding now, decide later.

## Error handling

- No published experiments in scope → emit empty work-order doc with
  a "no new walls observed since EXP-NNNN" note; do not advance
  `last_introspection` (so the next run reconsiders the same range).
- Clustering produces 0 qualifying work orders → write the doc with
  the cluster table but no WO sections; advance
  `last_introspection`.
- A wall_evidence record can't be classified into any theme → emit
  it under "## Unclassified" in the doc; human triages it.

## References

- Spec §17 (observability) — extends from "log what happened" to
  "synthesize what couldn't happen."
- Spec §10 (experiment templates) — output of this skill feeds back
  into this section.
- `state.json.policy_notes[]` / `follow_up_notes[]` — existing
  proto-introspection surfaces; this skill builds on them.
- forge-publisher SKILL.md — the layman-intro + /forge-lock rules
  were themselves the output of human-driven introspection;
  forge-introspector is meant to automate the spotting half.
