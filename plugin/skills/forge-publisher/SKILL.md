---
name: forge-publisher
description: Use when a forge experiment is at phase `reported` and needs its outputs shipped — gist (auto), scsiwyg blog post (auto-publish, locked-on per project decision), and a work-state event emission. Scrubs secrets before every send. Trigger via "/forge-publisher EXP-NNNN" or invoked by forge-orchestrator. Advances phase to `published`.
---

# forge-publisher — fan out outputs (gist + blog + work-state)

Two senses of "deploy" are both covered (spec §12): the writeup (gist + blog + report) and the code (deploy bundle, image if pushed). The signal is the work-state event.

## When to use

- Phase `reported`.

## Inputs

- `experiment.yaml`, `report.md`, `build/env.json`, `deploy/*`.
- Secret store refs from manifest.secrets (anthropic, slack, github, scsiwyg).

## Outputs

- `experiment.outputs.gist_url`.
- `experiment.outputs.blog_post_id`, `blog_status: published`, `blog_site: forge`, `blog_url: https://scsiwyg.com/forge/<slug>` (locked auto-publish on the `forge` blog).
- work-state event emitted (`build` + `publish`).
- `experiment.events_emitted: [build, publish]`.
- Phase advanced to `published`.

## Locked targets

- **scsiwyg blog: `/forge`** — every forge experiment publishes here, never to a personal or default blog. Always pass `username: "forge"` to `mcp__scsiwyg__publish_post`. Rationale: forge work is its own corpus and should not pollute the author's personal feed. If the `forge` site doesn't exist, create it via `mcp__scsiwyg__create_site` with `username: forge` and the standard forge bio (see `~/forge/templates/site-bio.md`) before publishing.
- **gist:** public, owner = the active `gh` account.

## Layman intro (required)

Every published post **must** open with a `## For the layman` section followed by a `---` divider, then the technical report body. The intro is **not** in `report.md` — `report.md` stays technical so it doubles as the gist `README.md`. The publisher composes the layman intro on the fly from the experiment record.

Layman intro requirements:

- 2–5 short paragraphs, ~150–350 words total.
- No jargon. No acronyms without expansion. No code blocks. No tables.
- Cover, in this order: (a) what the underlying domain/problem is in everyday terms, (b) what the project being evaluated does, (c) what forge verified or built, (d) what the reader will get out of the rest of the post.
- End with a `---` divider on its own line, then the unchanged `report.md` body.
- Keep cross-references to other forge posts as site-relative paths (`/forge/<slug>`), not absolute URLs.

If the experiment's `report.md` already contains a `## For the layman` heading, treat it as authoritative and do not generate a second intro.

## Procedure

1. `forge-state read` the EXP.
2. **Scrub.** Read all artifacts to be shipped (report.md, env.json snippets, log tails); call `forge-state scrub-secrets` on every payload before any network send.
3. **Gist.**
   - Compose gist files: `README.md` (the report, technical only — no layman intro), `experiment.yaml` (sanitized copy without internal paths), `env.json` (verbatim — the reproducibility anchor), `RUN.md` if present.
   - Create gist via GitHub API (public, description = "forge EXP-NNNN: <slug>").
   - Record `outputs.gist_url`.
4. **Blog.**
   - Confirm the `forge` scsiwyg site exists; create it if missing (one-time).
   - **Compose layman intro** per the requirements above.
   - Compose post body = layman intro + `---` + `report.md` body. Substitute the gist URL into placeholder anchors. Rewrite any `/david/...` or absolute cross-references to other forge posts as site-relative `/forge/<slug>`.
   - Call `mcp__scsiwyg__publish_post` with `username: "forge"`, the slug = `exp-NNNN-<slug>`, the title from `experiment.yaml`, and tags including at minimum `["forge", <experiment-specific tags>]`. Locked to auto-publish (manifest.surfaces.blog.auto: true).
   - Record `outputs.blog_post_id`, `outputs.blog_status: published`, `outputs.blog_site: forge`, `outputs.blog_url`.
5. **work-state event.** Emit `build` and `publish` events via the work-state facility (one-shot file drop into work-state's intake, or direct API if available). Mirror this activity so work-state can harvest forge's own output.
6. **Run summary line** for the nightly summary (handed back to orchestrator): "EXP-NNNN <slug>: <result> → gist + /forge".
7. `forge-state advance-phase EXP-NNNN published`.

## Error handling

- Gist 4xx/5xx → retry once; on second failure, record error, leave phase at `reported`, surface in orchestrator summary.
- Blog publish failure → fall back to draft; record `blog_status: draft` and surface the failure.
- Scrub turns up a secret in the payload → log a high-severity activity event and abort send; this is a defect, not a routine condition.
- `forge` blog already has a post at the target slug → republish via `mcp__scsiwyg__update_post` instead of failing; record `republished: true` in outputs.
- Wrong-blog publish detected (post landed somewhere other than `/forge`) → call `delete_post` on the wrong site, re-publish to `/forge`, record the original `post_id` under `outputs.prior_publishes[]` with `status: deleted` for auditability.

## References

- Spec §12 (publishing), §15 (secrets — scrub is mandatory), §17 (observability — events are the longitudinal view), §18.1/.2 (locked: push + auto-publish).
