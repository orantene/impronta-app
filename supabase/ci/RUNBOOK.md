# RUNBOOK — clean checkout → running app → passing journey, with no Docker

This is the whole QA loop for an agent working offline in a container: build the
database from the repo's own files, start a Supabase-compatible HTTP surface
without Docker, seed the talent-website fixtures, build and start the app, and
run the smoke journey against it.

**No production credentials are used anywhere in it, and nobody is asked for a
database dump.** Every value it needs is either in this repo or derived from the
Supabase CLI's published local development secret.

What is real and what is a stand-in is stated at every step. Nothing here is
allowed to pass by pretending.

---

## 0. Prerequisites

| Need | Check | If missing |
|---|---|---|
| PostgreSQL 16 server binaries | `ls /usr/lib/postgresql/16/bin/initdb` | `apt-get install -y postgresql-16` |
| pgvector | `ls /usr/share/postgresql/16/extension/vector.control` | `apt-get install -y postgresql-16-pgvector` (`talent_embeddings.embedding` is a `vector` column) |
| Node 22+ | `node -v` | — (type-stripping in `verify-schema.ts` needs ≥ 22.18) |
| `web/` dependencies | `cd web && node -e "require.resolve('next')"` | `cd web && npm ci` |
| A PostgREST binary | `ls supabase/ci/.bin/postgrest` | see below — **the one step that touches the network** |
| Chromium for Playwright | `ls $PLAYWRIGHT_BROWSERS_PATH` | pre-installed in the agent image; never run `playwright install` there |

PostgREST is a single static binary with no runtime dependencies. It is
**git-ignored** (`supabase/ci/.bin/`) — a binary is never committed to this repo:

```bash
mkdir -p supabase/ci/.bin
curl -sSL https://github.com/PostgREST/postgrest/releases/download/v12.2.8/postgrest-v12.2.8-linux-static-x86-64.tar.xz \
  | tar -xJ -C supabase/ci/.bin
supabase/ci/.bin/postgrest --version     # PostgREST 12.2.8
```

That download is the only thing in this runbook that is not offline. Cache the
binary in the image (or set `POSTGREST_BIN=/path/to/postgrest`) and the whole
loop runs with the network off. In GitHub Actions none of this applies: Docker
works there, so `.github/workflows/talent-website-e2e.yml` runs a real
`supabase start` and uses the same seed, env builder and spec on top of it.

---

## 1. The database, from the repo alone

```bash
cd <checkout>
export PGDATA_DIR=/tmp/impronta-qa-pg PGPORT=55700
bash supabase/ci/local-postgres.sh up          # initdb + Supabase scaffolding
eval "$(bash supabase/ci/local-postgres.sh env)"   # exports PGHOST/PGPORT/PGUSER/…
FAILURE_REPORT=/tmp/failures.txt bash supabase/ci/apply-migrations.sh --defer
```

`apply-migrations.sh` reads the standard libpq variables — run the `eval` line,
or the script looks for a unix socket and fails immediately with
`connection to server on socket "/var/run/postgresql/.s.PGSQL.55700" failed`.

Expect, in about 8 minutes:

```
Final: 859 applied, 0 could not apply, 3 replaced, of 859 on disk
```

Non-zero exit means a migration could not apply; `/tmp/failures.txt` then holds
the full error text per file. `supabase/ci/README.md` explains the six shapes of
blocker and the rule for writing a substitute.

Optional but recommended — prove the result *is* production's schema rather than
merely green:

```bash
node supabase/ci/verify-schema.ts     # 0 failures + 1 documented allow-list entry
```

---

## 2. The HTTP surface, without Docker

The app and the seed script speak to Supabase over HTTP, not to PostgreSQL.
`supabase start` would provide that; Docker image pulls are blocked in the agent
containers. This starts the same two prefixes on one port:

```bash
bash supabase/ci/local-services.sh up
eval "$(bash supabase/ci/local-services.sh env)"   # NEXT_PUBLIC_SUPABASE_URL + keys
curl -s http://127.0.0.1:54321/auth/v1/health
```

- `/rest/v1` is **real PostgREST 12.x**, connected as `authenticator` and
  switching to `anon` / `authenticated` / `service_role` from the JWT, exactly
  as on a real project. RLS behaves as in production.
- `/auth/v1` is a **stand-in** (`supabase/ci/local-services.mjs`) that writes
  `auth.users` directly. It implements admin create/list/update, password grant
  and `GET /user` — enough for the seed and for a logged-in journey. It does
  **not** hash passwords with bcrypt, and does not do email, OAuth or MFA. Read
  the file header before trusting it with anything else.
- `/storage/v1` is **not implemented**. Fixture media rows carry placeholder
  storage paths that nothing fetches. A journey that needs a real object
  download needs `supabase start`.

`local-services.sh up` also gives `authenticator` LOGIN and `service_role`
BYPASSRLS — attributes a real Supabase project's roles already have. It adds no
application object.

---

## 3. Seed the fixtures

```bash
eval "$(bash supabase/ci/local-services.sh env)"
cd web && npx tsx e2e/talent-website/seed.ts
```

The script refuses any non-local `NEXT_PUBLIC_SUPABASE_URL` by design. It is
idempotent — run it twice, the row counts do not move. `web/e2e/talent-website/README.md`
describes every fixture; `fixtures.ts` is the identity list the specs import.

---

## 4. Build and start the app

```bash
SUPABASE_PORT=54321 APP_PORT=3400 bash supabase/ci/app-env.sh   # writes web/.env.local
cd web && npm run build
PORT=3400 npx next start -p 3400 &
```

`app-env.sh` writes only local values and **dummy** third-party keys, and turns
on `TALENT_THEME_GALLERY_ENABLED`, `TALENT_FREE_WEBSITE_ENABLED` and
`TALENT_SITE_SUBDOMAINS_ENABLED`. It reuses `NEXT_PUBLIC_SUPABASE_URL` /
`…_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` when they are already exported, which
is how the CI lane feeds it the real `supabase start` keys.

Two traps an agent container walks into here, both measured on 2026-09-23:

- **`web/node_modules` is often a SYMLINK to another worktree.** Turbopack then
  refuses to start at all: `Symlink [project]/node_modules is invalid, it points
  out of the filesystem root`. The other bundler (`next build --webpack`) is not
  a way out — it dies on `UnhandledSchemeError: Reading from "node:console"`
  through `undici`. Give this worktree its own copy (~1.8 GB, two minutes) and
  Turbopack is happy:

  ```bash
  cp -a /path/to/other-worktree/web/node_modules/. web/.deps-copy/
  rm web/node_modules && mv web/.deps-copy web/node_modules
  ```

- **`next build` wants ~10 GB of heap for this app.** On a shared 15 GB box with
  other agents running it OOMs (`Reached heap limit Allocation failed`) after
  45 minutes. When the box is busy, run the journey against `next dev` instead —
  it compiles only the routes the journey requests:

  ```bash
  cd web && NODE_OPTIONS=--max-old-space-size=5120 npx next dev -p 3400 &
  ```

  A dev server is what the evidence in this runbook was produced against. CI
  builds properly (`npm run build` + `next start`) on a runner that is not
  contended.

  One dev-server quirk worth knowing, or you will chase ghosts: the FIRST
  request after you edit `proxy.ts` (or any middleware-adjacent file) can be
  served by the stale bundle. Repeat the request before believing a 404.

---

## 5. Hosts

`web/src/proxy.ts` resolves the tenant from the `Host` header, and a browser
will not let a test forge that header — so the fixture's custom domain has to
resolve to the local server:

```bash
echo "127.0.0.1 max-site.test free-site.test acme.lvh.me" >> /etc/hosts
```

`localhost` and `127.0.0.1` need nothing: migration
`20260922100000_agency_domains_localhost_app_dev.sql` already registers both in
`agency_domains` as `kind='app'`. A host that is in neither place gets
**404 "Host not registered"** before route matching (CLAUDE.md, "QA caveat").

---

## 6. The journey

```bash
cd web
PLAYWRIGHT_BASE_URL=http://localhost:3400 PLAYWRIGHT_SKIP_WEBSERVER=1 \
  npx playwright test e2e/talent-website/smoke.spec.ts --project=chromium --reporter=line
```

`PLAYWRIGHT_SKIP_WEBSERVER=1` stops the config from starting a second `next dev`
on top of the server you just started. `PLAYWRIGHT_BROWSERS_PATH` is already set
in the agent image and `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` keeps it that way —
**never run `playwright install` there**.

If the installed `@playwright/test` asks for a browser build the image does not
have (`Executable doesn't exist at …/chromium_headless_shell-1217/…` while the
image ships 1194), point the spec at the build that IS there instead of
downloading:

```bash
QA_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
```

The spec reads that variable and does nothing when it is unset, so CI and dev
machines are unaffected.

Two assertions: `t_max`'s published site answers 200 on `max-site.test` and
shows the display name, and `/t/TAL-QA-MAX` answers 200 on the app host.
Screenshots land in `qa-evidence/talent-website/local/`.

---

## 7. Tear down

```bash
bash supabase/ci/local-services.sh down
PGDATA_DIR=/tmp/impronta-qa-pg PGPORT=55700 bash supabase/ci/local-postgres.sh down
```

---

## The whole thing, in one block

```bash
cd <checkout>
export PGDATA_DIR=/tmp/impronta-qa-pg PGPORT=55700 SUPABASE_PORT=54321 APP_PORT=3400
bash supabase/ci/local-postgres.sh up
eval "$(bash supabase/ci/local-postgres.sh env)"
bash supabase/ci/apply-migrations.sh --defer
bash supabase/ci/local-services.sh up
eval "$(bash supabase/ci/local-services.sh env)"
(cd web && npx tsx e2e/talent-website/seed.ts)
bash supabase/ci/app-env.sh
(cd web && NODE_OPTIONS=--max-old-space-size=5120 npx next dev -p 3400 &)   # or: npm run build && npx next start -p 3400
grep -q max-site.test /etc/hosts || echo "127.0.0.1 max-site.test free-site.test acme.lvh.me" >> /etc/hosts
(cd web && PLAYWRIGHT_BASE_URL=http://localhost:3400 PLAYWRIGHT_SKIP_WEBSERVER=1 \
   QA_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
   npx playwright test e2e/talent-website/smoke.spec.ts --project=chromium)
```

---

## What running it found

The loop is not decoration: the first time these steps ran end to end (Phase Q,
2026-09-23) they found four defects that no unit test had. All four are fixed on
this branch, each at the layer that was actually wrong.

| # | Defect | Where | Fix |
|---|---|---|---|
| 1 | **Every talent custom domain 404s.** `app/_talent-site/` is an underscore-prefixed folder, which Next treats as a PRIVATE folder and excludes from routing (Next's own `route-discovery.js`: *"Turbopack encodes '_' as '%5F' in app paths"*). The proxy rewrites a `kind: "talent_site"` host to `/_talent-site`, a path with no route, so Next served its own not-found. The same applied to `/_host-unregistered` and `/_page-not-found`, so the branded 404 pages never rendered either. | `web/src/app/` | Renamed the three folders to `%5F…`, the encoded form that keeps the SAME public path. No code, no path string, no test changed. |
| 2 | **A freshly provisioned Max site renders an empty page.** `buildStarterHomePageTree` — the tree `provisionTalentMaxSite` writes for a new site — wraps its content in a root `section` with `sectionTypeKey: "freeform"`. `renderFreeformPageRootTree` paints a root section only when it is an unbound gallery (`sectionTypeKey: "custom"`); everything else goes through `renderBuilderNodes`, which skips `section` nodes in freeform mode. The page therefore renders nothing, and `renderTalentMaxSite` correctly 404s a page that renders nothing. | `web/src/lib/talent-site/default-max-site-trees.ts` + `…/builder-node/freeform-page-blocks.tsx` | **NOT fixed here** — reported. It is a product decision which side gives (the starter tree, or the freeform root renderer), and guessing would trade a loud 404 for a silent blank page. The seed builds a flat, renderable tree instead and says so at the site. |
| 3 | **next/image refuses every storage image on a local Supabase.** `next.config.ts` derives `images.remotePatterns` from `NEXT_PUBLIC_SUPABASE_URL` but pinned `protocol: "https"`. A local stack is `http://127.0.0.1:54321`, so every storage URL was "not configured" and next/image THREW — which the talent-site render path catches and degrades to a 404. | `web/next.config.ts` | Follow the URL's own scheme. |
| 4 | Two bugs in the seed itself, which had never been executed | `web/e2e/talent-website/seed.ts`, `fixtures.ts` | See `web/e2e/talent-website/README.md`, "First execution". |

## What this loop does NOT prove

State these when reporting a green run; a runbook that hides its edges is worse
than none.

- **Storage.** No object is ever uploaded or fetched. Anything pixel-level on a
  real image is out of reach without `supabase start`.
- **Real auth.** Passwords are not bcrypt here and no GoTrue runs. A journey
  that exercises signup, email confirmation, password reset or OAuth needs the
  real service. Logged-in journeys work by minting a session through
  `/auth/v1/token` — which is the stand-in, not GoTrue.
- **Realtime / edge functions / imgproxy.** Not started, not stubbed.
- **PostgreSQL 16, not 17.** `supabase/config.toml` pins `major_version = 17`.
  Nothing in the history is 17-only so far; if that changes, the cluster script
  has to move.
- **The CI lane's own plumbing.** The steps in
  `.github/workflows/talent-website-e2e.yml` run against a real `supabase start`
  on a GitHub runner. What is proven here is the scripts, the seed and the spec.
