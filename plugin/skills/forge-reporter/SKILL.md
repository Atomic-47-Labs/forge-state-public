---
name: forge-reporter
description: Use when a forge experiment is at phase `packaged` (success path) or `build-failed` (failure path) and needs a publishable writeup composed. Build failures get reports too — "this does not build on a clean machine" is a finding worth publishing (spec §2.5). Trigger via "/forge-reporter EXP-NNNN", or invoked by forge-orchestrator. Writes report.md and advances phase to `reported`.
---

# forge-reporter — compose report.md (success and failure senses)

## When to use

- Phase `packaged` → compose success report.
- Phase `build-failed` → compose failure report (still goes to publish).

## Inputs

- `experiment.yaml` — all populated blocks.
- `research.md`, `build/log.txt`, `build/env.json`, `artifacts/*`, `deploy/RUN.md` (if present).

## Outputs

- `experiments/EXP-NNNN-<slug>/report.md`.
- `experiment.report.ref: report.md`.
- Phase advanced to `reported`.

## Report structure — success path

```
# <project> — forge experiment EXP-NNNN

**TL;DR.** One sentence: what we tried and what we learned.

## What it is
(from research.md — what / who / why notable)

## How we built it
- Base image: <digest>
- Commands: <list from env.json>
- Result: built in <duration_s>s

## The experiment
- Type: <cli/library/...>
- Template: <name>
- Steps: <bullet list>
- Observations: <prose>
- Result: <success/partial/failed>

## How to run it yourself
(embed deploy/RUN.md verbatim; link to image if pushed)

## Reproducibility
- Commit: <sha>
- Env manifest: build/env.json
- Gist: <link inserted by publisher>

## License & sources
- License: <SPDX>
- Sources: <links>
```

## Report structure — build-failed path

```
# <project> — forge experiment EXP-NNNN (build-failed)

**TL;DR.** This does not build on a clean machine. Here is what we tried and where it broke.

## What it is
(from research.md)

## What we tried
- Base image: <digest>
- Commands attempted: <list>
- Failed at: <last_command>, exit <code>
- Tail of build log:
```
<30-line tail>
```

## Why this matters
- Reproducibility gap in the upstream project.
- Concrete recommendation for the maintainers (1–3 bullets).

## Reproducibility of this failure
- Commit: <sha>
- Env manifest: build/env.json (exact base image, runtime versions)

## License & sources
```

## Procedure

1. `forge-state read` the EXP.
2. Detect path (success vs build-failed) from `build.status`.
3. Render template above with values from the record.
4. `forge-state write report.md`.
5. `forge-state advance-phase EXP-NNNN reported`.

## Error handling

- Missing required block → render the section as "(not available — <reason>)" rather than fail. The report is itself the artifact; partial is better than absent.

## Out of scope

This skill only writes `report.md` and the `report` block via `forge-state`.
It never touches git/gh in any way — not even the gist (that's
`forge-publisher`'s job, one phase later).

## References

- Spec §2.5, §6 (lifecycle — both phases converge on reported), §12.
