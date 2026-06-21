# Deployment Receipt

> **Project:** forge-state | **Deployed:** 2026-06-21T08:50:00Z

| Field | Value |
|-------|-------|
| Platform | Netlify |
| URL (production) | https://forge-state.netlify.app |
| Unique deploy URL | https://6a380c83442f7d3c876426db--forge-state.netlify.app |
| Project ID | 0c1676b1-d205-4036-8f5d-b1eb83570c60 |
| Deploy ID | 6a380c83442f7d3c876426db |
| Admin URL | https://app.netlify.com/projects/forge-state |
| Project type | Static site (HTML + vanilla JS deck) |
| Source path | site/ |
| Account | worksona (slug: worksona-kqvl2gu) |
| Custom domain | none — using default *.netlify.app |

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
