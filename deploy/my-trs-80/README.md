# Deploying www.my-trs-80.com

The site is a Cloudflare Worker that serves static files: my-trs-80 at the
root, plus trs80-cassette-webapp at `/cassette`, trs80-ide at `/ide`, and
trs80-tool's documentation at `/tool`. The trs80-tool binaries aren't part of
it. They're attached to GitHub Releases (see `release-trs80-tool` in
`.github/workflows/build.yml`), and `_redirects` sends the old download URLs
there.

## Staging and production

- **Push to `master`** to update the staging site, https://stage.my-trs-80.com/.
  It's a Cloudflare "Preview" of the same Worker.
- **Push to `release`** to make it live at https://www.my-trs-80.com/, usually
  with `git push origin master:release`. This also publishes a GitHub Release
  of trs80-tool if its version is new.

Each push builds and runs the tests first; nothing is deployed if they fail.
Staging has its own browser storage, separate from www, so things like the
IDE's autosaved program and sign-in don't carry over between them.

## Cloudflare settings

Build settings (Workers & Pages → my-trs-80 → Settings → Build):

- Production branch: `release`
- Enable Preview Builds: on. Every non-production branch that's pushed builds
  the same "stage" Preview, so pushing a feature branch to GitHub also
  replaces staging until the next push to `master`.
- Build command: `npm ci && npm run build && npm test && deploy/my-trs-80/assemble`
- Deploy command: `npx wrangler deploy --config deploy/my-trs-80/wrangler.jsonc`
- Preview command: `npx wrangler preview --name stage --config deploy/my-trs-80/wrangler.jsonc`
- Root directory: `/`
- Environment variable: `NODE_VERSION` = `24`, to match CI.

Custom domains (Workers & Pages → my-trs-80 → Domains), managed in the
dashboard rather than in `wrangler.jsonc`:

- `www.my-trs-80.com`, enabled for Production.
- `my-trs-80.com`, enabled for Production and Preview. In production, a
  Cloudflare Redirect Rule sends it to www. For Previews, it makes each Preview
  available at `<preview name>.my-trs-80.com`, so the "stage" Preview is at
  `stage.my-trs-80.com`.

Firebase (console → Authentication → Settings → Authorized domains) must list
`www.my-trs-80.com` and `stage.my-trs-80.com` for sign-in to work on them.

## Deploying by hand

From a checkout, run `npm ci`, `npm run build`, `npm test`, and
`deploy/my-trs-80/assemble`. Then run the deploy command above for production,
or the Preview command for staging.
