# Post-cut reseed + recheck runbook (2026-10-18)

## PM POST FIRST: rows and tables the reseed writes (nothing is written until `--apply`)

Target: staging DB `fxlankepwnvelxjrahwk` only (script refuses any other login). One table.

| Table | Rows | Keys |
|---|---|---|
| `public.cms_posts` | 4 (re-run = 0 new) | `tenant_id` NULL, `talent_profile_id` = the QA talent (TAL-93900, or TAL-96001 only if PM approves, see Blocker). Ids = `stableId("tpost:{es,en,expired,takedown}")` of prefix `qa-fixture-g6`. Slugs `qa-fixture-g6-t-guia-limpieza` (es, published), `-t-cleaning-guide` (en, published, translation_of es), `-t-oferta-vencida` (es, expired), `-t-articulo-oculto` (es, taken down). |

No other table, no auth, no Stripe, no TAL-93938. Undo: same command with `--apply --cleanup` (deletes only those 4 ids with `tenant_id IS NULL`).

Read-only schema check done 2026-10-18 on fxlank: `cms_posts.tenant_id` nullable = YES, `cms_posts_scope_present` present, `cms_posts_talent_locale_slug_key` present, TAL-93900 profile exists (1), 0 talent-scope posts today.

## Blocker (apply is refused until fixed)

TAL-93900 has NO `talent_sites` row on staging, so it has no talent host and `/blog` cannot be reached for it. The seed refuses `--apply` in that state. Options (PM picks): (1) someone creates and publishes a talent site with a `site_slug` for TAL-93900; or (2) run with `--talent-code TAL-96001` (T1, host `qa-fixture-g6-limpieza.staging.tulala.digital`, already published).

## 1. Seed (run the minute staging is cut)

From `web/`, env file with a staging `DATABASE_URL` (do not paste values):

```
npx tsx scripts/seed-talent-scope-posts-staging.mts --env-file <tmp>                 # dry run, read-only
npx tsx scripts/seed-talent-scope-posts-staging.mts --env-file <tmp> --apply         # after PM post
```
Expected dry run: `schema: tenant_id nullable=YES, cms_posts_scope_present=true, cms_posts_talent_locale_slug_key=true`; `talent TAL-93900 -> <uuid>; ... host=<slug>.staging.tulala.digital`; `fixture post rows already present: 0/4`; four `/blog/<slug>` lines. Expected apply: `inserted 4 new row(s), 0 already present`; second run `inserted 0 new row(s), 4 already present`.

## 2. Recheck (after the cut deploys to staging)

```
cd web && node scripts/check-post-cut-talent-blog.mjs --host <host printed by the seed>
node scripts/check-staging-nav-and-talent-host.mjs --env-file <staging env pull>      # existing: TUL-1247 nav + T1 home + workspace posts
```
Gate token is read from `~/.tulala-qa.env` and never printed. Expected (all PASS, exit 0): `/` 200 with nav links and 0 absolute app-host `/w/` links; `/blog` 200 listing the es post and hiding the taken-down one; `/blog/qa-fixture-g6-t-guia-limpieza` 200 + title; `-t-cleaning-guide` 200 + title; `-t-oferta-vencida` 200 (expired notice); `-t-articulo-oculto` 404; `-t-no-such-post` 404. Exit 1 prints `FAIL` lines with status codes.

## 3. Cards retested

| Card | Covered by |
|---|---|
| TUL-1247 | nav absolute `/w/` link assertion (both scripts) |
| TUL-1009 | published / expired / taken-down / missing post status codes |
| TUL-1003, 1006, 1007, 1010, 1012, 1069, 1249 | `/blog` list + `/blog/<slug>` on the talent host and home nav `/blog` link; verify each card's exact acceptance line against these outputs (card text was not available to this run, so no finer mapping is claimed) |
