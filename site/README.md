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

## The interface demo (`demo/`)

`demo/` is the public interface demo served at `getinhouse.org/demo/`: the
real PWA built with a simulated, in-page assistant (`web/src/demo/`). It is
**committed build output** so Pages still needs no build command — after
changing the web app or the demo brain, regenerate it with `make demo` from
the repo root and commit the result. Replies are spoken with the product's
real Piper voice: one pre-baked MP3 per scripted line, generated from
`web/src/demo/voice-lines.json` by `make demo-voice` (rerun it whenever the
catalog changes; a test fails if the MP3s drift out of sync). The demo
sends nothing anywhere — its only traffic is fetching this site's own
static files — and registers no service worker; the no-trackers footer
claim covers it too.
