---
name: forge-harvester-rss
description: Wild-source intake. Watch RSS / Atom feeds of high-recipe-density sources — MarkTechPost, Hugging Face blog, Anthropic blog, Cameron Wolfe substack, the dottxt blog, opensourceprojects.dev — for posts that look like *system specs* rather than news. Filter for recipe-style headlines ("Using X and Y to do Z", "Build a Z with X", "X.0 announcement", "Open-source launch of Y") and enqueue qualifying ones as article-as-spec candidates. Trigger via "/forge-harvester-rss [--feed <url>] [--since <iso>]" or invoked by forge-orchestrator. Tracks per-feed cursor by post GUID.
experiment_origin: themes-synthesis-2026-06-25
---

# forge-harvester-rss — find article-as-spec candidates in the wild

Forge's `article-as-spec` template has shipped three winners — `agentic-rl-runner` (EXP-0006 from a Cameron Wolfe substack), `ard-tools` (EXP-0013 from a HuggingFace launch post), and the [Graphify writeup](/forge/exp-0018-graphify-networkx) (EXP-0018 from MarkTechPost). All three sources publish on a regular cadence and have RSS feeds. This skill watches those feeds and enqueues posts that look like system specs forge can operationalize.

## Why this exists

The `article-as-spec` template is forge's highest-leverage finding so far — it turned three blog posts into two working Python packages and one substantive bench. But the source for each was a human noticing a post in `#development` and 🧪-ing it. That's slow and incidental. This skill makes the discovery active.

Three sources have produced *all three* article-as-spec wins to date:

- **MarkTechPost** — 1 win (Graphify, EXP-0018), and 2 other articles forge has reviewed (the Mistral OCR 4 and "Claude Code telemetry" posts). Reliable cadence (~5/week).
- **HuggingFace blog** — 1 win (ARD, EXP-0013). Lower cadence (~3/week) but every post is a launch or spec.
- **Cameron R. Wolfe substack** — 1 win (Agentic RL, EXP-0006). Low cadence (~1/month) but every post is a deep technical survey.

Adding two more high-signal sources rounds the watch:

- **Anthropic blog** — cadence ~2/week; mix of company news and engineering posts; the engineering posts are spec-shaped.
- **dottxt.co blog** — small but every post is a structured-generation deep dive (outlines author).
- **opensourceprojects.dev** — already the resolved source for EXP-0005 (mentraos) and EXP-0007 (pinokio). Aggregator-style listing of new OSS projects; high signal-to-noise.

## When to use

- On-demand: `/forge-harvester-rss` (sweeps all configured feeds since the last cursor).
- `/forge-harvester-rss --feed <url> --since <iso>` for a targeted pull.
- Nightly from `forge-orchestrator`, with `--max-per-feed 5` to bound queue growth.

## Recipe-style filter

Not every post is article-as-spec material. The filter looks for headline patterns that signal a *recipe* (something forge can implement) rather than *news* (something forge can only summarize):

| pattern | example | verdict |
|---|---|---|
| `Using X and Y to ...` | "Using Graphify and NetworkX to Map Python Codebase Structure" | **enqueue** (EXP-0018 shape) |
| `How to build X with Y` | "How to build a multi-modal RAG with Llama 3" | **enqueue** |
| `Open-source launch of X` | "Open-source launch of vLLM 1.0" | **enqueue** |
| `X is announcing Y` | "Mistral is announcing OCR 4" | enqueue → pattern note (likely hosted SaaS) |
| `Introducing X` | "Introducing Agentic Resource Discovery" | **enqueue** (EXP-0013 shape) |
| `X benchmark` / `X reaches N% on Y` | "Claude Opus reaches 92.7% on SWE-bench" | skip (benchmark news, not spec) |
| `X raises $N` | "Anthropic raises $5B" | skip (funding news) |
| `Why X matters` | "Why Open Weights Matter in 2026" | skip (opinion, not spec) |

The filter is a simple regex match on the title plus a fallback LLM call (via the orchestrator's host-tier model) for ambiguous cases. False positives are cheap (researcher phase will reject and emit a `commentary-pattern-note`); false negatives are expensive (we miss a spec we could have shipped).

## Inputs

- `manifest.yaml` → `intake.rss_feeds[]`. Default set:
  - `https://www.marktechpost.com/feed/`
  - `https://huggingface.co/blog/feed.xml`
  - `https://www.anthropic.com/news/feed.xml`
  - `https://cameronrwolfe.substack.com/feed`
  - `https://blog.dottxt.co/rss.xml`
  - `https://www.opensourceprojects.dev/rss.xml`
- `state/wild-cursor.yaml` → per-feed last-seen post GUID (and `last_pub_date`).
- Network egress to the feeds (host-tier; never enters the sandbox data plane).

## Outputs

- Zero or more new `experiments/EXP-NNNN-<slug>/experiment.yaml` records at phase `candidate` with `source.surface: rss`, `source.feed_url: <feed>`, `source.url: <post-url>`, `source.title: <title>`, `source.published_at: <iso>`, `source.marker_form: wild-harvest-rss`.
- Updated `state/wild-cursor.yaml`.
- Activity event `{op: wild-harvest, source: rss, feed: "<url>", id: EXP-NNNN}`.

## Procedure

1. `forge-state read` manifest + `state/wild-cursor.yaml`.
2. For each feed in `intake.rss_feeds[]`:
   a. Fetch via `curl -fsSL` with `If-Modified-Since: <cursor.last_pub_date>` (304 → skip).
   b. Parse XML/Atom. For each `<item>` newer than the cursor:
      - Run the recipe-style filter on the title. Skip if no match.
      - Slug from the post URL's path tail (kebab-case, max 40 chars).
      - `forge-state allocate-id` → EXP-NNNN.
      - Write candidate `experiment.yaml`. Set `source.recipe_pattern_matched: <pattern>` for downstream researcher context.
   c. Advance `wild-cursor[feed].last_pub_date` to the newest seen.
3. Emit activity events.
4. Hand off control to `forge-orchestrator` (researcher will resolve each candidate's underlying system, then the operationalization rule applies).

## Budget

RSS is cheap. Default sweep is 6 feeds × 1 GET each = 6 network calls. Even with hourly cadence, it's < 200 calls/day. Cost is downstream — every enqueued candidate triggers a researcher pass, which consumes a small amount of WebFetch + WebSearch budget.

## Error handling

- Feed 4xx/5xx → log warning, skip; do not advance cursor for that feed.
- Feed returns malformed XML → log warning, skip; do not advance cursor.
- Cursor mismatch (clock skew, feed timestamp drift) → keep newest-by-GUID semantics; pub_date is informational.
- Recipe-filter false positives are expected — the researcher catches them and emits `commentary-pattern-note`.

## References

- EXP-0006 (Wolfe substack → agentic-rl-runner).
- EXP-0013 (HF blog → ard-tools).
- EXP-0018 (MarkTechPost → Graphify writeup).
- Spec §8 (intake contract — extended to RSS / web feed sources).
- forge-experimenter SKILL.md — the `article-as-spec` template that consumes the output of this harvester.
