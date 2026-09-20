---
name: forge-harvester-slack
description: Use when the orchestrator's nightly walk begins, or when the user says "/forge-harvester-slack", "check for new forge candidates", "any new lab-bench marks", or asks to drain Slack reactions into experiments. Reads David's own 🧪 reactions in #development (per locked manifest), creates new candidate experiment records via forge-state, and advances the per-channel cursor in state/cursor.yaml.
---

# forge-harvester-slack — intake from Slack reactions

The trigger is the reaction, not the post (spec §8). David marks a project post with 🧪 in #development; this skill enqueues it as a candidate.

## When to use

- Step 1 of every nightly walk (called by `forge-orchestrator`).
- On-demand when the user wants to flush the intake queue.

## Inputs

- `manifest.yaml` → `intake.channels` (locked: `["#development"]`), `intake.marker` (locked: `🧪`), `intake.markers_self_only: true`.
- `state/cursor.yaml` → per-channel last-processed reaction timestamp.
- Slack tokens from the host secret store (never enter the data plane).

## Outputs

- Zero or more new `experiments/EXP-NNNN-<slug>/experiment.yaml` records at phase `candidate`.
- Updated `state/cursor.yaml`.
- Activity events appended via forge-state.

## Procedure

1. Read manifest + cursor through `forge-state read`.
2. Resolve the user's Slack id (David) — only their reactions count.
3. For each configured channel:
   - List messages newer than the cursor; for each message inspect reactions.
   - Keep messages where the marker emoji was added by the configured user.
   - Extract candidate repo URL: prefer GitHub/GitLab/Codeberg URLs in the message text or unfurls; fallback to first URL.
4. For each new candidate (idempotent on `(channel, message_ts)`):
   - `forge-state allocate-id` → `EXP-NNNN`.
   - Derive slug from repo name (kebab-case, max 40 chars).
   - Build experiment record per `schemas/experiment.schema.yaml` with `phase: candidate`, `source.surface: slack`, `source.message_ts`, `source.marked_by`, `source.marked_with: 🧪`, `source.url`.
   - `forge-state write experiments/EXP-NNNN-<slug>/experiment.yaml`.
5. Advance cursor per channel to the latest processed `message_ts`.
6. Emit activity events `{op: harvest, id: EXP-NNNN}`.

## Tools

- Slack MCP: whichever Slack MCP server is configured in the current
  environment — tool names are namespaced by that server's install id and
  **will differ across machines and reinstalls** (e.g.
  `mcp__claude_ai_Slack__slack_read_channel` on one setup,
  `mcp__<uuid>__slack_read_channel` on another). Do not hardcode a specific
  server id in this file or in code that calls it — discover the actual
  tool names available in the current session (e.g. via `ToolSearch` or the
  tool listing) and use whichever ones expose channel reads, reactions, and
  user profile lookups. A hardcoded id here was found broken/dead during
  the 2026-09-20 audit — it belonged to a Slack MCP install that no longer
  matches this environment's tool names, meaning the harvester step would
  have hard-failed on every real nightly run.

## Fallback when no Slack MCP is reachable

If no Slack tool resolves in the current environment: skip the harvest step,
leave the cursor untouched, and emit a single activity event
`{op: harvest, status: skipped, reason: no-slack-mcp}` rather than failing
the whole nightly walk. Existing `candidate`-phase records still process
normally — the only thing skipped is new intake from Slack.

## Error handling

- Missing Slack token → skip with structured error to orchestrator; do not advance cursor.
- Reaction by another user → ignore (markers_self_only).
- Already-harvested message_ts → skip silently.

## References

- Spec §8 (intake contract), §5.2 (manifest), §5.3 (cursor).
