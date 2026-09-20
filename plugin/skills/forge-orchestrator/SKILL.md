---
name: forge-orchestrator
description: Use when starting a nightly forge walk or when the user runs "/forge-orchestrator" (optionally with --once or --dry-run). The conductor of the forge facility — thin router that walks the experiment queue, dispatches each non-terminal experiment through the §6 lifecycle, respects state/forge.lock (flock single-writer), honors per_repo_timeout_s and night_budget_s, carries unfinished experiments forward, syncs the durability mirror at the end of the walk, and emits a run summary. Holds no state of its own; all reads/writes route through forge-state. This is the only skill permitted to touch the facility's own git/mirror state.
---

# forge-orchestrator — nightly walk, thin router

Spec §13. No separate queue file: **phase is the queue.** Any non-terminal experiment is in the queue.

## When to use

- Nightly trigger (launchd / Task Scheduler).
- On-demand: `/forge-orchestrator --once`.
- Dry-run preview: `/forge-orchestrator --once --dry-run`.

## Flags

- `--once`: run the walk immediately, ignore schedule.
- `--dry-run`: plan only, do not invoke worker skills or write substrate.

## Procedure

1. **Lock.** Acquire `~/forge/state/forge.lock` (flock advisory). Refuse to start if held; exit with `LOCK_HELD`. Release on exit.
2. **Harvest.** Invoke `forge-harvester-slack` (skip on `--dry-run`).
3. **Queue.** `forge-state read` all experiment records; build the queue:
   - candidate, researched, cloned, built, build-failed, experimented, packaged, reported — all non-terminal.
   - Order: oldest `updated` first; carry_forward from `state/state.json` takes priority.
   - **Reconcile before trusting `phase` blindly** (2026-09-20 finding: 4 of 25
     real experiments had complete `research.md`/`report.md` on disk but
     `phase` was still `candidate` — a bookkeeping gap, not a real backlog,
     that went undetected for months). For each record at a non-terminal
     phase, check whether `report.md` already exists: if it does, the
     record is further along than its `phase` field claims — advance
     `phase` to match reality (at minimum `reported`) before queuing it,
     and note the correction in the activity log, rather than silently
     redoing already-done work or leaving stale bookkeeping in place.
4. **Walk.** For each experiment, dispatch by phase:
   - candidate → `forge-researcher` → researched
   - researched → `forge-builder` → built | build-failed
   - built → `forge-experimenter` → experimented
   - experimented → `forge-packager` → packaged
   - packaged | build-failed → `forge-reporter` → reported
   - reported → `forge-publisher` → published (terminal)
5. **Budgets.**
   - Per-experiment wall clock = `manifest.sandbox.per_repo_timeout_s`; on overrun, signal the worker, record partial state, move on.
   - Night budget = `manifest.sandbox.night_budget_s`; on overrun, stop dispatching new work, carry remaining queue forward via `state.json.carry_forward`.
6. **Run log.** Append a line per experiment to `state/logs/run-YYYY-MM-DD.txt` via `forge-state`.
7. **Summary.** Compose one-line summary: "tonight: N built, M build-failed, K carried, P published". Hand to `forge-publisher` to post into the intake channel (`#development`).
8. **Refresh** `state/state.json` (counts, last_run, last_cursor, carry_forward).
9. **Durability mirror sync** (2026-09-20: added — previously no skill did
   this, ever, so the mirror silently went stale from the moment it was
   configured). If `manifest.durability.mirror.remote` is set and non-null:
   - `git -C ~/forge add -A`
   - If there are staged changes: `git -C ~/forge commit -m "forge nightly run YYYY-MM-DD"`
   - `git -C ~/forge push <mirror.remote> <mirror.branch, default main>`
   - This is the **only** point in the entire nightly walk that touches git
     history for the facility itself. No other skill (`forge-builder`,
     `forge-researcher`, `forge-experimenter`, `forge-reporter`,
     `forge-publisher`) may run `git init`/`commit`/`push`/`gh repo create`
     against `~/forge` or its mirror under any circumstance — the only
     other legitimate git/gh activity in the whole facility is
     `forge-packager`'s narrowly-scoped promote-to-repo step, which creates
     a *new, separate* repo for a shipped artifact and never touches the
     facility's own mirror.
   - Push failure (auth, network, non-fast-forward) → log a high-severity
     activity event, leave the walk's results intact (they're already on
     disk), do not fail the whole run over a mirror push.
10. Release lock.

## Dry-run mode

- Print the planned queue (id, slug, current phase → next phase) and the budgeted wall-clock.
- No worker skill invoked, no substrate writes, no Slack/Docker calls.
- Exit 0.

## Error handling

- Worker skill returns error → record in activity log, leave experiment at current phase, continue with next.
- Docker daemon unreachable → abort walk early, summary reports "docker unavailable", lock released cleanly.
- Dead-man: if last successful walk was > 25h ago, emit a high-severity activity event (orchestrator notices on next run).

## References

- Spec §13 (orchestration), §6 (lifecycle DAG), §5.3 (state.json), §17 (observability), §16 (durability — mirror sync step 9).
- 2026-09-20 real-Docker proof run: first time this facility ran actual (not structural) Docker builds; exposed the phase/artifact bookkeeping gap (step 3) and the missing mirror sync (step 9) fixed in this revision.
