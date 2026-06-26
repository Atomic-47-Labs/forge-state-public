# Deployment Receipt

> **Project:** forge-state | **Deployed:** 2026-06-24T10:00:00Z

| Field | Value |
|-------|-------|
| Platform | Netlify |
| URL (production) | https://forge-state.netlify.app |
| Unique deploy URL | https://6a3c5d7037f8333cd85ccdaa--forge-state.netlify.app |
| Project ID | 0c1676b1-d205-4036-8f5d-b1eb83570c60 |
| Deploy ID | 6a3c5d7037f8333cd85ccdaa |
| Admin URL | https://app.netlify.com/projects/forge-state |
| Build logs | https://app.netlify.com/projects/forge-state/deploys/6a3c5d7037f8333cd85ccdaa |
| Project type | Static site (HTML + vanilla JS deck) |
| Source path | site/ |
| Account | worksona (slug: worksona-kqvl2gu) |
| Custom domain | none — using default *.netlify.app |
| Change | Fix GitHub org from `atomic47/` to `atomic-47-labs/` in install slide (4× CLI command + 1× footer link) and in `plugin/.claude-plugin/plugin.json` `repository` field. |

## Configuration Used

`netlify.toml` at repo root:

```toml
[build]
  publish = "site"
  command = ""

[[redirects]]
  from = "/"
  to = "/index.html"
  status = 200
```

## Environment Variables Set

None — the deck is fully static.

## Verification

- HTTP 200 from https://forge-state.netlify.app/
- All 5 occurrences of the intake channel read `#development` (no stale `#general`)
- 14 slides served from `site/index.html` (84 KB) + `site/deck.js` (7.4 KB)
