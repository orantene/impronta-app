# QA host pool (proof section for new themes)

`qa-1` … `qa-6.tulala.digital` are reserved platform hosts. Each can be leased to one branch preview, so a theme can be proven on a real host without a local server.

```
cd web
npm run qa:host -- claim factory/my-theme   # prints https://qa-N.tulala.digital/?_vercel_share=<token>
npm run qa:host -- list                     # host -> branch, sha, age, share link + expiry
npm run qa:host -- release factory/my-theme # or a host
```

- `claim` also creates (or reuses, while at least 1h is left) a 23-hour Vercel share link for the deployment and prints it, so the QA Tester opens one URL with no manual bypass. If the share-link call fails, `claim` still succeeds, prints a one-line warning on stderr and falls back to the bare host URL. `list` shows each host's link and expiry; run `claim` again for a fresh link once it expires. The link is a credential for that preview: share it with QA only.
- Needs `VERCEL_TOKEN` in the environment. Never print it.
- The Vercel alias is the lease. A host is reusable when its branch is deleted or its alias is older than 24h. `factory/*` previews are claimed automatically by `.github/workflows/qa-host-pool.yml`, which posts the host as a `qa-host` commit status.
- **These hosts use the PRODUCTION database.** Stay read-only: no writes, no checkout, no sign-up.
- Deployment protection is on. Send `x-vercel-protection-bypass` with the value of `VERCEL_AUTOMATION_BYPASS_SECRET` (never log or commit it).

## Parity tool

The mockup-parity tool (`web/scripts/qa/mockup-parity/run.mjs`) refuses non-local `--base-url`. When that tool lands on the branch you are on, replace its local-only check with `isAllowedParityBaseUrl` from `web/scripts/lib/qa-hosts.mjs` (local hosts or exactly qa-1..6), and spread `bypassHeaders(baseUrl)` into the Playwright context `extraHTTPHeaders`. Then:

```
node scripts/qa/mockup-parity/run.mjs --base-url https://qa-1.tulala.digital
```
