---
name: forge-builder
description: Use when a forge experiment is at phase `researched` and needs to be cloned, pinned, classified, and built inside the Docker sandbox. Invoked by forge-orchestrator. The riskiest skill — proves the path before downstream skills run. Trigger phrases include "/forge-builder EXP-NNNN", "build EXP-0007 in the sandbox", or "try to compile that repo". Outcomes: built or build-failed — both advance the lifecycle per spec §2.5.
---

# forge-builder — clone, pin, classify, build in sandbox

The host hands a repo + commands to a fresh Docker container. The container builds. The host reads the result. No secrets cross the boundary (spec §2.4, §9, §15).

## When to use

- An experiment is at phase `researched`.
- The orchestrator's nightly walk reaches it.

## Inputs

- `experiment.yaml` for the EXP — needs `repo.url`.
- `manifest.sandbox` — base images, cpu/memory caps, `per_repo_timeout_s`.

## Outputs

- Working copy on host at a tmp path (not under `experiments/` — only the build log and env manifest persist).
- `experiments/EXP-NNNN-<slug>/build/log.txt` — stdout+stderr of build.
- `experiments/EXP-NNNN-<slug>/build/env.json` — reproducibility anchor (OS, base image digest, runtime versions, exact commands, exit codes, timings).
- Updated `experiment.repo.commit`, `experiment.repo.ref`.
- Updated `experiment.build.{image_base, commands[], exit_code, duration_s, env_manifest_ref, status, failure}`.
- Updated `experiment.experiment.type` (classification result for the experimenter).
- Phase advanced to `built` or `build-failed`.

## Procedure

1. `forge-state read` the EXP record.
2. Clone `repo.url` shallow to `/tmp/forge/<EXP-id>/`; record `git rev-parse HEAD` as `repo.commit`.
3. **Classify language and type** (used by sandbox image picker and §10 experiment taxonomy):
   - Files: `package.json` → node; `pyproject.toml`/`requirements.txt` → python; `environment.yml`/`environment*.yml` with **no** `requirements.txt`/`pyproject.toml`/`setup.py` → **python-conda-only** (2026-09-20 finding, EXP-0022: attempting `pip install` here is not a real test — it fails for a reason unrelated to the repo's actual health, since the repo was never meant to be pip-installed. Record `build.reason: conda-only-not-pip-installable` and don't spend more than the one confirming attempt on it); `go.mod` → go; `Cargo.toml` → rust; else generic.
   - Type: `bin/` + argparse/clap → cli; package manifest only → library; dev-server script → webapp; MCP SDK dep → mcp; `Dockerfile` + port bind → service; notebook/weights → model.
   - **Version pinning** (2026-09-20 finding, EXP-0024: chatbox needs Node ≥22.12, manifest default was node:20 — a real, avoidable false-negative). Before picking a base image tag, check the repo's own version constraint: `package.json engines.node` for node, `python_requires` in `pyproject.toml`/`setup.py` for python, `go.mod`'s `go` directive for go, `rust-version` in `Cargo.toml` for rust. If the repo declares a constraint the manifest's default tag doesn't satisfy, use a tag that does (same major image family, e.g. `node:22` instead of `node:20`) and record which tag was actually used and why in `build.sandbox`. Only fall back to the manifest default if the repo declares no constraint.
4. Pick base image from `manifest.sandbox.base_images[lang]`, adjusted per the version-pinning check above; record digest via `docker pull` + `docker inspect`.
5. Compose build commands per language:
   - node: `npm ci || npm install && npm run build || true` (or the repo's declared package manager + lockfile — e.g. `pnpm install --frozen-lockfile` when `pnpm-lock.yaml`/`packageManager` is present; don't force npm on a pnpm/yarn project)
   - python: `pip install -r requirements.txt || pip install -e .` — skip entirely for `python-conda-only` classification above and go straight to recording the finding
   - go: `go build ./...`
   - rust: `cargo build --release`
   - generic: `make || ./configure && make || true`
6. Run in fresh container with `--network` set to egress policy `registries-only` (resolve via host firewall/proxy; deny-by-default), cpu/memory caps from manifest, working dir mounted read-write, no host env, no secrets, `--rm`.
7. Capture stdout+stderr → `build/log.txt`. Capture timing, exit, env → `build/env.json` (OS, image digest, runtime `--version` output, commands run, per-command exits, total duration).
8. Determine status:
   - exit 0 → `status: built`, `failure: null`.
   - non-zero → `status: build-failed`, `failure: { last_command, exit_code, tail: <last 30 log lines> }`.
9. `forge-state write` updated record; `forge-state advance-phase` to `built` or `build-failed`.
10. Tear down container.

## Error handling

- Docker daemon unreachable → orchestrator-level error; do not advance phase.
- Per-repo timeout exceeded → terminate container, set `status: build-failed` with `failure.reason: timeout`.
- Image pull failure → record as `build-failed` (`failure.reason: image_pull`) — this is itself a finding.

## Out of scope

This skill's only writes are to `experiments/EXP-NNNN-<slug>/build/` and the
`experiment.yaml` record via `forge-state`. It never runs `git init`,
`git commit`, `git push`, or `gh repo create` against anything — not the
cloned repo (which lives in an ephemeral `/tmp` path and is discarded), not
`~/forge`, not the durability mirror. If the acting agent finds itself
reaching for a git/gh command while doing builder work, that's a sign the
task has drifted out of this skill's scope — stop and hand back to the
orchestrator rather than improvising.

## References

- Spec §2.4 (two-plane isolation), §2.5 (build-failed terminal-with-findings), §9 (sandbox), §10 (taxonomy classification belongs to builder).
- 2026-09-20 real-Docker proof run: added conda-only detection (EXP-0022) and engine-version pinning (EXP-0024) after both caused avoidable false-negative build-failed results.
