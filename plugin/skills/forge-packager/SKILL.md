---
name: forge-packager
description: Use when a forge experiment is at phase `experimented` and needs to be turned into a shareable, runnable artifact — a deploy/ bundle (Dockerfile, compose.yaml, RUN.md). Also pushes the image to GHCR (locked-on per project decision; token at env $GHCR_TOKEN, registry ghcr.io/davidolsson). Skipped on `build-failed` experiments. Trigger via "/forge-packager EXP-NNNN" or invoked by forge-orchestrator. Reuses the build's env manifest so packaged artifact and gist agree on environment.
---

# forge-packager — emit deploy bundle, push image

## When to use

- An experiment is at phase `experimented`.
- Never on `build-failed` (the reporter notes "not packaged" with reason).

## Inputs

- The build image from forge-builder.
- `build/env.json` — base image digest, runtime versions, exact commands.
- `experiment.experiment.type` — for choosing the RUN.md invocation.
- Manifest: `packaging.push_image: true`, `packaging.registry: ghcr.io/davidolsson`.
- Env: `GHCR_TOKEN` (host-only; never enters the data plane).

## Outputs

- `experiments/EXP-NNNN-<slug>/deploy/Dockerfile` — self-contained, uses pinned base image digest.
- `experiments/EXP-NNNN-<slug>/deploy/compose.yaml` — one-service compose with sensible defaults.
- `experiments/EXP-NNNN-<slug>/deploy/RUN.md` — the exact `docker run` / `compose up` invocation + what it does + what to expect.
- Image pushed to `ghcr.io/davidolsson/forge-<slug>:exp-NNNN` (and `:latest`).
- `experiment.package.{dockerfile_ref, compose_ref, run, image}` populated.
- **If the artifact meets the promote-to-repo criteria (see below):** a public GitHub repo at `github.com/worksona/<artifact-name>` containing the source tree, with the gist URL recorded as the frozen reproducibility anchor and the repo URL recorded as the canonical install/fork target.
- Phase advanced to `packaged`.

## Promote-to-repo decision

By default every experiment produces a gist (handled by `forge-publisher`). For a small subset of experiments — those that ship runnable, redistributable code as a forge-original artifact — the gist is not enough. Those get promoted to a real GitHub repo.

**Promote criteria (ALL must hold):**

1. **The artifact is forge-original code**, not a clone of someone else's repo and not a comparison/log/note. Bench evidence for a third-party project does NOT promote — the upstream repo is the canonical home; we just publish the bench results.
2. **The artifact is self-contained and installable** via a standard package manager — `pip install`, `npm install`, `docker pull`, `cargo install`, etc. If a user can plausibly want `pip install <name>`, the gist is the wrong distribution channel.
3. **The artifact is intended for fork-and-extend** — others should be able to file issues, send PRs, and pin specific versions. If the artifact is a one-shot deliverable with no expected evolution, the gist is sufficient.

If all three hold: promote. If any one fails: stay gist-only.

**Examples from the pilot run (June 2026):**

| experiment | artifact | promote? | reason |
|---|---|---|---|
| EXP-0002 cc-gateway | bench evidence on motiful/cc-gateway | NO | upstream is the canonical home |
| EXP-0003 cc-gateway-dashboard | 200-line Node SSE viewer (forge-built) | **YES** | forge-original, npm-installable, fork-friendly |
| EXP-0006 agentic-rl-runner | Python package implementing GRPO + task-norm | **YES** | forge-original, pip-installable, fork-friendly |
| EXP-0009 autoresearch | Karpathy's repo, install verified | NO | upstream is the canonical home |
| EXP-0013 ard-tools | Python package implementing ARD spec | **YES** | forge-original, pip-installable, fork-friendly |
| EXP-0014 marktechpost-org | commentary note | NO | no code shipped |

About 3 of every 16 forge ships clear the bar.

## Procedure

1. `forge-state read` the EXP; abort if phase != `experimented`.
2. Generate `Dockerfile`:
   - `FROM <base-image>@<digest>` from `build/env.json`.
   - `WORKDIR /app`, `COPY . .`, the build commands from `env.json`, the entrypoint matching `experiment.type` (CMD for cli/library, EXPOSE+CMD for webapp/service/mcp).
3. Generate `compose.yaml`: one service, port mapping if applicable, restart policy, resource limits matching `manifest.sandbox`.
4. Generate `RUN.md`: title, one-paragraph what-it-does, the exact `docker run --rm <image> <args>` line (or `docker compose up`), expected output, link to gist.
5. Build and tag the image locally: `docker build -t ghcr.io/davidolsson/forge-<slug>:exp-NNNN .`
6. If `$GHCR_TOKEN` is set and `packaging.push_image: true`:
   - `echo $GHCR_TOKEN | docker login ghcr.io -u davidolsson --password-stdin`
   - `docker push ghcr.io/davidolsson/forge-<slug>:exp-NNNN`
   - Tag and push `:latest`.
   - Record image ref in `package.image`.
7. If push fails or token missing → log warning, leave `package.image: null` (bundle alone is still valid).
8. **Apply the promote-to-repo decision (above).** If promote:
   - Stage a clean tree under `/tmp/forge/repos/<artifact-name>/`. Exclude `node_modules`, `dist/`, `__pycache__`, `.venv`, build outputs, secrets.
   - Add a `.gitignore` appropriate to the language.
   - Confirm `LICENSE` is present; default to MIT if forge-original and the experiment doesn't specify.
   - `gh repo create worksona/<artifact-name> --public --description "<one-line summary>. Shipped by forge (EXP-NNNN)."`
   - `git init && git add . && git commit -m "Initial commit — shipped by forge"`
   - `git push -u origin main`
   - `gh repo edit worksona/<artifact-name> --add-topic forge --add-topic <experiment-specific topics>`
   - Record `package.repo_url`, `package.repo_topics[]` in the experiment record.
9. `forge-state advance-phase EXP-NNNN packaged`.

## Procedure

1. `forge-state read` the EXP; abort if phase != `experimented`.
2. Generate `Dockerfile`:
   - `FROM <base-image>@<digest>` from `build/env.json`.
   - `WORKDIR /app`, `COPY . .`, the build commands from `env.json`, the entrypoint matching `experiment.type` (CMD for cli/library, EXPOSE+CMD for webapp/service/mcp).
3. Generate `compose.yaml`: one service, port mapping if applicable, restart policy, resource limits matching `manifest.sandbox`.
4. Generate `RUN.md`: title, one-paragraph what-it-does, the exact `docker run --rm <image> <args>` line (or `docker compose up`), expected output, link to gist.
5. Build and tag the image locally: `docker build -t ghcr.io/davidolsson/forge-<slug>:exp-NNNN .`
6. If `$GHCR_TOKEN` is set and `packaging.push_image: true`:
   - `echo $GHCR_TOKEN | docker login ghcr.io -u davidolsson --password-stdin`
   - `docker push ghcr.io/davidolsson/forge-<slug>:exp-NNNN`
   - Tag and push `:latest`.
   - Record image ref in `package.image`.
7. If push fails or token missing → log warning, leave `package.image: null` (bundle alone is still valid).
8. `forge-state advance-phase EXP-NNNN packaged`.

## Error handling

- Push failure → continue with bundle-only; warn in activity log.
- Missing env.json → cannot pin digest; abort with structured error (builder is the prereq).
- `gh repo create` fails (e.g., name collision in the worksona namespace) → log warning, fall back to `worksona/<artifact-name>-exp-NNNN` with the EXP id suffixed; never overwrite an existing repo.
- Repo creation succeeds but push fails → leave the repo empty + record `package.repo_status: "created-but-empty"`; never delete the repo from forge.

## Forge-publisher contract

When this skill records a `package.repo_url`, the downstream `forge-publisher` is expected to surface BOTH the gist (frozen reproducibility anchor) AND the repo (canonical install URL) in the blog post and in the experiment.yaml. The gist URL is immutable; the repo URL is the living target.

## References

- Spec §11 (packaging), §2.7 (no secrets in outputs — token used host-side only), §18.1 (locked: push enabled).
