# getinhouse.org landing page

Static, dependency-free, no build step. No analytics, no trackers, no
third-party fonts — the footer says so, so keep it true.

Preview locally:

```bash
cd site && python3 -m http.server 8090
```

Deploy (GitHub Pages): repo Settings → Pages → deploy from branch, folder
`/site` (or a `gh-pages` action publishing this directory), then point
`getinhouse.org` at it with a `CNAME` file containing `getinhouse.org` and
an apex ALIAS/A record per GitHub Pages docs. Cloudflare Pages works the
same way with `site` as the output directory.

`getinhouse.org` is the canonical domain. `getinhouse.ai` should be a
plain 301 redirect to it (registrar redirect or a Cloudflare bulk redirect
rule) — one site, two doors, never separately hosted content on the `.ai`.

Regenerate the README/app screenshots separately — this page intentionally
ships none; the orb and the conversation are CSS/HTML so the page weighs
almost nothing and loads instantly.
