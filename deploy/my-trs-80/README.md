# Deploying www.my-trs-80.com

The site is a Cloudflare Worker that serves static files: my-trs-80 at the
root, plus trs80-cassette-webapp at `/cassette`, trs80-ide at `/ide`, and
trs80-tool's documentation at `/tool`. The trs80-tool binaries aren't part of
it. They're attached to GitHub Releases (see `release-trs80-tool` in
`.github/workflows/build.yml`), and `_redirects` sends the old download URLs
there.

Cloudflare builds and deploys it on every push to master. These are the
Worker's build settings in the Cloudflare dashboard (Workers & Pages →
my-trs-80 → Settings → Builds):

- Production branch: `master`
- Build command: `npm ci && npm run build && npm test && deploy/my-trs-80/assemble`
- Deploy command: `npx wrangler deploy --config deploy/my-trs-80/wrangler.jsonc`
- Root directory: `/`
- Environment variable: `NODE_VERSION` = `24`, to match CI.

To deploy by hand from a checkout instead, run the build, the test, and
`deploy/my-trs-80/assemble`, then the deploy command above.
