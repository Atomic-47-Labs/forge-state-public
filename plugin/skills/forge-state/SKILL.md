---
name: forge-state
description: Use when any forge-* skill or user request needs to read, write, or validate the forge facility at ~/forge/ — including init, allocating an EXP-NNNN id, advancing an experiment's phase, scrubbing secrets from outputs, or appending to state/activity.ndjson. The only skill permitted to write the substrate to disk. Trigger phrases include "/forge-state", "init forge", "validate the forge facility", "advance EXP-0007 to packaged", "scrub this report", or any forge-* skill that needs persistence.
---

# forge-state — substrate spine

The shared memory of the forge facility. Every other forge-* skill routes its reads and writes through this one — no skill writes the substrate directly (spec §7 invariant).

## When to use

- A forge skill needs to read or update an `experiments/EXP-NNNN-slug/experiment.yaml` record.
- The orchestrator needs to allocate a new experiment id, advance a phase, append to the activity log, or refresh `state/state.json`.
- The user asks to init the facility, validate it, or audit drift.
- A publisher needs to scrub secrets before shipping.

## Facility layout (canonical — spec §4, adjusted: machinery in `state/` not `.state/`)

```
~/forge/
  manifest.yaml
  experiments/
    EXP-NNNN-slug/
      experiment.yaml         # canonical record
      research.md
      build/{log.txt,env.json}
      deploy/{Dockerfile,compose.yaml,RUN.md}
      artifacts/
      report.md
  state/
    state.json                # derived snapshot
    activity.ndjson           # append-only log
    cursor.yaml               # per-channel last-processed reaction
    forge.lock                # single-writer flock
    logs/run-YYYY-MM-DD.txt
```

`experiments/` is durable. `state/` is rebuildable from it.

## Operations

| op | inputs | effect |
|---|---|---|
| `init` | (none) | run `scripts/init-facility.sh`; idempotent |
| `read` | path | return YAML/JSON contents |
| `write` | path, content | validate against schema, write |
| `validate` | (none) | walk experiments, validate each against `plugin/schemas/experiment.schema.yaml` (prefer `scripts/validate.sh` when a dev checkout is available) |
| `allocate-id` | (none) | scan experiments/, return next `EXP-NNNN` |
| `advance-phase` | id, new_phase | update experiment.yaml; append activity event; refresh state.json counts |
| `scrub-secrets` | text | redact known secret values (loaded from secret store refs) → return scrubbed |
| `append-activity` | event | append one NDJSON line to `state/activity.ndjson` |

## Procedure

1. Resolve facility root from `$FORGE_ROOT` or `~/forge`.
2. Acquire `state/forge.lock` (advisory flock) for any write op; fail-fast if held.
3. For `write`: validate payload against the relevant schema, resolved as
   `<this skill's base directory>/../../schemas/` (i.e. `plugin/schemas/`
   relative to the repo root — the Skill tool reports "Base directory for
   this skill" on every invocation; compute the schema path from that
   rather than a hardcoded absolute path, which will not exist on any
   machine but the original author's). If a dev checkout of the
   `forge-state` repo is available, prefer running its real
   `scripts/validate.sh` (actual jsonschema validation, not just reasoning
   about the file) over eyeballing the schema by hand. The schema is
   intentionally permissive (`additionalProperties: true` almost
   everywhere) — it documents the invariant contract (id/slug/phase/
   source/repo), not a rigid shape. Do not reject a write just because it
   has a field the schema doesn't list; only reject on the few things that
   are actually required or enum-constrained (e.g. an invalid `phase`
   value, a malformed `id`).
4. For `advance-phase`: only allow transitions matching the §6 lifecycle DAG. `build-failed → reported → published` is legal; any other backward move is rejected.
5. For `scrub-secrets`: load secret values from the configured store (sops-age refs in manifest.secrets), build a redaction map, replace every occurrence with `<REDACTED:name>`.
6. Append every state-changing op to `state/activity.ndjson` as `{ts, op, id, before, after}`.
7. After any phase advance, recompute `state/state.json` `counts_by_phase` and update `last_run`.

## Error handling

- Schema validation failure → reject the write, return validation errors, do not touch disk.
- Lock contention → return `LOCK_HELD`, do not retry.
- Illegal phase transition → return `PHASE_DAG_VIOLATION`.

## Out of scope

This skill owns the facility's own files (`experiments/`, `state/`) — nothing
else. It never touches the durability mirror's git state (that's
`forge-orchestrator`'s job, run once per walk, after every worker skill has
finished) and never creates or pushes to any GitHub repo (that's
`forge-packager`'s narrowly-scoped promote-to-repo step, and only for the
artifact's own new repo, never the facility's mirror).

## References

- Spec §4 (facility layout), §5 (entities & schema), §6 (phase lifecycle), §7 (skill suite), §15 (secrets), §16 (durability).
- Schemas: `plugin/schemas/experiment.schema.yaml`, `plugin/schemas/manifest.schema.yaml` (path relative to this skill's base directory — see step 3 above).
