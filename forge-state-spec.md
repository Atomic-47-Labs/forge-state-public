# forge-state — Specification

**Version:** 0.1 (draft for lock)
**Status:** Architecture converged; five open decisions flagged in §18.
**Pattern family:** local-first state facility (sibling to desk-state, work-state, notella).

---

## 1. Purpose

forge-state is a lab bench for open-source projects. You mark a project announcement in Slack; nightly, the facility researches it, clones it, builds it inside a sealed box, runs a real experiment against it, packages it into something runnable, and ships two artifacts — a writeup and deployable code. Build failures are kept, not discarded; "this does not build on a clean machine" is a finding worth publishing.

The unit of work is an **experiment**: one marked repo carried through a fixed lifecycle. Each experiment is independent and idempotent.

---

## 2. Invariants

These hold across every skill and every run. Violating one is a defect.

1. **Local-first.** The facility lives on your machine. Nothing requires a server. "Deploy" means outputs leave the host for surfaces (gist, blog, registry) — the facility itself never moves.
2. **File-per-entity YAML, append-only NDJSON.** One record per file. Logs only append. YAML on disk is canonical; any index is derived and disposable.
3. **Single-writer.** The nightly run is the only writer. A lockfile prevents an overrunning night from colliding with the next trigger.
4. **Two-plane isolation.** The host is the control plane (holds secrets, runs reasoning and publishing). The Docker container is the data plane (untrusted, no secrets, builds and runs the repo). The build never executes in the host shell.
5. **Build-failed is terminal-with-findings.** A failed build advances to a report, not a halt.
6. **Deterministic gist.** Every published build record carries the exact environment and commands that produced it — reproducible, not anecdotal.
7. **Secrets never reach the data plane or the outputs.** No token enters the container; outputs are scrubbed before they ship.

---

## 3. Topology

```
┌─────────────────────────── HOST (control plane) ───────────────────────────┐
│  secrets: Anthropic key, Slack token, GitHub token, scsiwyg key            │
│  egress: anthropic.com, slack, github, scsiwyg, package registries         │
│                                                                            │
│  forge-orchestrator ── forge-harvester-slack ── forge-researcher           │
│        │               forge-experimenter (design) ── forge-reporter       │
│        │               forge-publisher                                     │
│        │                                                                   │
│        └── hands repo + commands ──►  ┌──── DOCKER (data plane) ────┐       │
│                                       │  no secrets                 │       │
│            ◄── logs, exit, artifacts ─│  egress: registries only    │       │
│                                       │  forge-builder (build)      │       │
│                                       │  forge-experimenter (run)   │       │
│                                       │  forge-packager (package)   │       │
│                                       └── disposable, per-repo ─────┘       │
└────────────────────────────────────────────────────────────────────────────┘
```

The boundary is crossed one way: repo and commands in, results out. Nothing trusted enters the container; nothing untrusted runs on the host.

---

## 4. Facility layout

```
~/forge/                          # visible — "your stuff" is browsable
  manifest.yaml                   # facility config (channels, images, surfaces, caps)
  experiments/
    EXP-0007-ripgrep-turbo/
      experiment.yaml             # the record — file-per-entity, canonical
      research.md
      build/
        log.txt
        env.json                  # reproducible environment manifest
      deploy/                     # the deployable artifact
        Dockerfile
        compose.yaml
        RUN.md
      artifacts/                  # screenshots, sample outputs
      report.md
  .state/                         # machinery
    state.json                    # derived snapshot — counts, cursor, last run
    activity.ndjson               # append-only log
    cursor.yaml                   # per-channel last-processed reaction
    forge.lock                    # single-writer guard
    logs/
      run-2026-06-21.txt
```

`experiments/` is the durable record. `.state/` is rebuildable from it.

---

## 5. Entities & schema

### 5.1 Experiment record — `experiments/EXP-NNNN-slug/experiment.yaml`

```yaml
id: EXP-0007
slug: ripgrep-turbo
phase: published                  # see §6
created: 2026-06-21T03:14:00Z
updated: 2026-06-21T03:41:12Z

source:
  surface: slack
  channel: "#forge-intake"
  message_ts: "1718900000.001200" # idempotency key
  marked_by: david
  marked_with: "🧪"
  url: https://github.com/owner/ripgrep-turbo

repo:
  url: https://github.com/owner/ripgrep-turbo
  host: github
  ref: main
  commit: 9f3c1a2                 # pinned at clone — reproducibility anchor
  license: MIT                    # captured; surfaced in report

research:
  what: "Rewrite of ripgrep with SIMD line scanning."
  who: "Independent; 3 contributors."
  why_notable: "Claims 2x on large trees."
  comparables: [ripgrep, ugrep]
  source_refs:
    - https://...

build:
  image_base: rust:1.79
  commands:
    - cargo build --release
  exit_code: 0
  duration_s: 142
  env_manifest_ref: build/env.json
  status: built                   # built | build-failed
  failure: null                   # populated on build-failed

experiment:
  type: cli                       # cli | library | webapp | mcp | service | model
  template: cli-sample-input
  steps:
    - "Ran against a 1.2M-line tree; compared wall-clock to ripgrep."
  observations: "1.6x on cold cache, parity warm."
  result: partial                 # success | partial | failed

package:
  dockerfile_ref: deploy/Dockerfile
  compose_ref: deploy/compose.yaml
  run: "docker run --rm forge/ripgrep-turbo:exp-0007 'pattern' ./src"
  image: null                     # ghcr ref if pushed (open decision §18.1)

report:
  ref: report.md

outputs:
  gist_url: https://gist.github.com/...
  blog_post_id: scsiwyg:draft:1421
  blog_status: draft              # draft | published (open decision §18.2)

events_emitted: [build, publish]  # mirrored to work-state
```

### 5.2 manifest.yaml

```yaml
facility: forge-state
version: 0.1
root: ~/forge

intake:
  surface: slack
  channels: ["#forge-intake"]     # open §18.3
  marker: "🧪"                     # open §18.3
  markers_self_only: true         # only your reactions count

sandbox:
  runtime: docker
  base_images:                    # selected by classifier
    node: node:20
    python: python:3.12
    go: golang:1.22
    rust: rust:1.79
    generic: ubuntu:24.04
  egress: registries-only         # deny-by-default
  cpu: 4
  memory: 8g
  per_repo_timeout_s: 1800
  night_budget_s: 14400           # carry-forward beyond this

experiment:
  mode: hybrid                    # classify → template → improvise within bounds

packaging:
  emit_bundle: true               # deploy/ always
  push_image: false               # GHCR — open §18.1
  registry: null

surfaces:
  gist: { enabled: true, auto: true }
  blog: { target: scsiwyg, auto: false }   # open §18.2
  work_state: { enabled: true }

durability:
  mirror: null                    # open §18.4 — git remote or none

secrets:
  store: sops-age                 # host-only
  refs: [anthropic, slack, github, scsiwyg]
```

### 5.3 state.json (derived)

```yaml
counts_by_phase: { candidate: 2, built: 1, published: 41, build-failed: 6 }
last_run: 2026-06-21T03:41:12Z
last_cursor: { "#forge-intake": "1718900000.001200" }
carry_forward: [EXP-0050, EXP-0051]
```

---

## 6. Phase lifecycle

```
candidate ──► researched ──► cloned ──► built ─────────► experimented
                                          │                    │
                                          └► build-failed ──┐   ▼
                                                            │ packaged
                                                            ▼   │
                                                         reported ◄┘
                                                            │
                                                            ▼
                                                        published
```

- **candidate** — harvested from a marked Slack post; not yet touched.
- **researched** — what/who/why/comparables/license captured.
- **cloned** — repo on disk, commit pinned.
- **built** | **build-failed** — sandboxed build attempted; either outcome continues.
- **experimented** — bounded experiment run (skipped on build-failed).
- **packaged** — deployable artifact emitted (skipped on build-failed).
- **reported** — report composed (both senses; build-failed reports the failure).
- **published** — outputs shipped to surfaces.

A build-failed experiment routes `build-failed → reported → published` directly.

---

## 7. Skill suite

Nine skills. Eight are pure single-purpose workers; the orchestrator routes and holds no state.

| Skill | Plane | Reads | Writes / does |
|---|---|---|---|
| **forge-state** | host | facility | read/write/validate substrate; the only writer to disk |
| **forge-harvester-slack** | host | Slack | marked posts → candidate records; advances cursor |
| **forge-researcher** | host | web | research block + license; `research.md` |
| **forge-builder** | data | repo | clone, pin commit, classify, build in sandbox; `build/env.json`, exit, logs |
| **forge-experimenter** | host+data | repo | classify type → template → run in sandbox; experiment block, artifacts |
| **forge-packager** | data | built repo | Dockerfile + compose + RUN.md; optional image push |
| **forge-reporter** | host | record | `report.md` (handles success and failure) |
| **forge-publisher** | host | record | gist + blog draft + work-state events; scrub secrets |
| **forge-orchestrator** | host | state | nightly queue walk; thin router; `--once` |

Every skill routes its reads and writes through **forge-state**. No skill writes the substrate directly.

---

## 8. Intake contract

- You react with the marker (`🧪`) on a project post in a designated channel.
- The reaction — not the post — is the trigger. This decouples "I shared a link" from "I want this built," and lets you curate after posting.
- Idempotency key is `(channel, message_ts)`. The cursor records the last-processed reaction per channel; re-runs skip already-harvested posts.
- Only your own reactions count (`markers_self_only`), so a colleague's emoji doesn't enqueue a build.

---

## 9. Sandbox

- **Runtime:** Docker Desktop (mac and Windows — the cross-platform common denominator).
- **Image:** per-language base selected by the builder's classifier (§10), generic fallback.
- **Egress:** deny-by-default; package registries allowed. No path to host secrets or the open internet beyond fetching dependencies.
- **Resources:** CPU and memory capped (manifest); per-repo wall-clock timeout.
- **Lifecycle:** fresh container per repo, torn down after results are read. No reuse, no persistence.
- **Env manifest (`build/env.json`):** OS, base image digest, runtime versions, exact commands, exit codes, timings. This is the reproducibility anchor the gist depends on.

---

## 10. Experiment taxonomy

Mode is hybrid: classify the repo, pick a template, improvise within the template's bounds. Templates keep the experimenter from flailing; improvisation keeps it useful.

| Type | Detection signal | Experiment template |
|---|---|---|
| **cli** | binary entrypoint, `bin/`, argparse/clap | run against sample input; compare to a named comparable |
| **library** | package manifest, no entrypoint | 20-line harness exercising the headline API |
| **webapp** | dev server, framework manifest | boot, hit health/route, screenshot |
| **mcp** | MCP server manifest / SDK dep | connect, list tools, call one |
| **service** | Dockerfile, daemon, port bind | compose up, probe the port |
| **model** | notebook, weights, ML deps | load, run one inference on a fixture |

Classification is the builder's job (it already inspects the tree to choose a base image); the experimenter consumes the type.

---

## 11. Packaging — the deployable artifact

forge-packager turns a built repo into something runnable and shareable.

- **Always:** emit a `deploy/` bundle — `Dockerfile`, `compose.yaml`, `RUN.md` (the exact `docker run` / `compose up` invocation, plus what it does). Self-contained; shareable without any registry.
- **Optional (open §18.1):** push the image to GHCR so it is `docker pull`-able. Gated behind a configured registry + token.
- The bundle reuses the build's env manifest, so the packaged artifact and the gist agree on environment.
- On build-failed: no package; the report explains why it could not be produced.

---

## 12. Publishing — outputs

forge-publisher fans out. Two senses of deploy, both covered.

1. **Writeup:**
   - **Gist** — the reproducible build record: env manifest, commands, results, and the deploy bundle. Auto.
   - **Blog draft** — scsiwyg, your publishing voice, held for review by default (open §18.2).
   - **Report** — `report.md` filed in the experiment folder.
2. **Code:**
   - The `deploy/` bundle, linked from the gist and the report; image pushed if §18.1 is on.
3. **Signal:**
   - `build` and `publish` events emitted to work-state — this activity is itself harvestable.

All outputs pass a secret scrub before they leave the host.

---

## 13. Orchestration

- **Nightly walk:** harvest new marked posts since cursor → for each candidate, advance through the lifecycle → emit a run summary.
- **Queue:** any non-terminal experiment is in the queue. No separate queue file; phase is the queue.
- **Overlap guard:** `forge.lock` (flock). A run refuses to start if one is active.
- **Budget:** per-repo timeout and a nightly wall-clock budget. Experiments not reached carry forward to the next night.
- **On-demand:** `forge-orchestrator --once` runs the same walk immediately, ignoring the schedule.

---

## 14. Deployment & runtime

- **Trigger:** launchd (mac) / Task Scheduler (Windows), nightly.
- **Vehicle:** headless Claude Code invocation that runs the orchestrator. The schedule is dumb; the orchestrator is the brain.
- **Host requirements:** Docker Desktop running; the secret store unlocked; egress to the surfaces.
- **No server.** Runs entirely on your workstation.

---

## 15. Secrets

- Host-only, in the configured store (sops/age or equivalent). Loaded into the control-plane environment at run start.
- Never written to the facility, the container, the gist, or the report.
- The publisher scrubs outputs against the known secret set before shipping.

---

## 16. Durability

- Local disk is the system of record; NDJSON is canonical history.
- Optional git mirror to a configured remote (open §18.4). A lost gist regenerates from the report record; a lost facility does not — the mirror is the backstop.

---

## 17. Observability

- **Run summary** posted to the intake channel: "tonight: N built, M build-failed, K carried."
- **Dead-man alert** if no run completes in 25h.
- **work-state events** give the longitudinal view for free.

---

## 18. Open decisions (lock before build)

1. **Packaged-artifact reach** — `deploy/` bundle only (no registry), or also push to GHCR (`docker pull`-able). Default: bundle only.
2. **Blog auto-publish** — hold as draft (default), or auto-publish like desk.
3. **Intake channel + marker** — the channel name and the reaction emoji.
4. **Durability mirror** — git remote (GitHub private / a Gitea / other) or local-only.
5. **Facility location** — `~/forge/` visible + `.state/` machinery (default), or fully dotted.

---

## 19. Build sequence

1. **forge-state + scaffolder** — substrate, schema, manifest, validate.
2. **forge-harvester-slack** — emoji gate → candidates, cursor.
3. **forge-builder + sandbox** — Docker, classify, build, env manifest. Riskiest; prove first.
4. **forge-experimenter** — taxonomy templates.
5. **forge-packager** — deploy bundle, optional push.
6. **forge-reporter + forge-publisher** — outputs, scrub, fan-out.
7. **forge-orchestrator + trigger** — nightly walk, lockfile, budget, `--once`.

Prove the path with `--once` on three to five repos before enabling the timer. Do not automate an unproven build path.

---

## 20. Addendum — 2026-09-20 real-Docker audit

§18's open decisions are now locked (durability: private GitHub mirror,
`worksona/forge-mirror`; blog auto-publish: disabled via
`surfaces.blog.enabled: false`, not just held-as-draft; facility location:
`~/forge/` visible + `state/` machinery, confirmed). This was also the
first time the facility ran **real** Docker builds — every prior published
experiment (EXP-0001 through EXP-0021, and EXP-0022/0023/0024/0025 before
this audit) had a structural-only build claim, reasoned about rather than
executed. Real execution surfaced several gaps this spec and the skill
suite had carried since v0.1:

- **No skill ever synced the durability mirror.** §16 describes it in prose
  but no procedure implemented it. Fixed: `forge-orchestrator` now commits
  and pushes `~/forge` to `durability.mirror.remote` as its last step,
  every walk. It is the only skill permitted to touch that git state.
- **`schemas/experiment.schema.yaml` rejected every real record the
  facility had ever produced** (`additionalProperties: false`, `repo.host`
  required despite 0/25 real records using it, narrow enums that didn't
  include real terminal states like `not-applicable` or
  `skipped-by-config`). The schema had clearly never actually gated a
  write. Fixed: rewritten as a permissive documentation-of-invariants
  schema (`additionalProperties: true`, only the truly universal fields
  required), moved into `plugin/schemas/` so it actually ships with the
  installed plugin (the old top-level `schemas/` never did).
- **`forge-state/SKILL.md` pointed at a broken, machine-specific absolute
  path** for the schema files (missing a path segment, and not portable to
  any other install). Fixed to resolve relative to the skill's own base
  directory instead.
- **`forge-harvester-slack` hardcoded a dead Slack MCP server id.** Fixed
  to discover whatever Slack MCP tools are actually available in the
  running environment, with a documented no-op fallback if none are.
- **`forge-packager/SKILL.md` had a duplicated, drifted-apart `## Procedure`
  section** (a merge artifact) and hardcoded `ghcr.io/davidolsson` /
  `worksona` account names that didn't match each other. Fixed: one
  procedure, registry/account read from manifest + `gh auth status` at
  runtime.
- **`forge-builder`'s classifier had two real false-negative gaps**: no
  detection for conda-only Python repos (environment.yml, no
  requirements.txt — produces a meaningless generic pip failure instead of
  the real finding "not pip-installable"), and no per-repo engine-version
  pinning (a repo requiring Node ≥22 built against the manifest's default
  node:20 and failed for a reason that had nothing to do with the repo's
  actual health). Both fixed.
- **No skill stated an out-of-scope boundary.** During this same audit, an
  agent tasked narrowly with running real Docker builds instead did
  unrelated git/mirror work — twice, once even after being told to stop —
  because nothing in any skill's text said that wasn't its job. Every
  worker skill now states explicitly that `forge-orchestrator`'s mirror
  sync and `forge-packager`'s promote-to-repo step are the *only* git/gh
  activity anywhere in the suite.
- **Phase/artifact bookkeeping can drift silently.** Four real experiments
  had complete `research.md`/`report.md` but `phase` stuck at `candidate`
  for months — not a real backlog, just bookkeeping that never got
  updated. `forge-orchestrator`'s queue-build step now reconciles `phase`
  against artifact presence before trusting it.

None of this was visible from reading the spec or the skills in isolation —
it only surfaced by actually running the pipeline for real. Re-validate any
future "structural-only" claim in this facility's history the same way
before treating it as settled.
