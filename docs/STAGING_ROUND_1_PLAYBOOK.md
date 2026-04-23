# Round 1 staging playbook — from nothing to "first tester can log in"

Bounded pre-Round-1 setup. Do not expand scope during this playbook —
anything that isn't on this list waits until after Round 1 signal lands.

Three hard-to-parallelize steps (A, B, F) require your hands. The rest I
can drive once you've given me URLs + credentials or CLI access.

---

## A — Vercel project (your hands)

1. **Create the project.** Vercel dashboard → Add New → Project →
   import this repo.
2. **Root Directory**: set to `web`. The Next.js app lives there. Do not
   leave it at repo root — Vercel's framework auto-detect won't find
   `next.config.ts` without this.
3. **Framework preset**: Vercel will autodetect "Next.js" once the root
   directory is set. Confirm, don't override.
4. **Production branch**: set to `main` (or whichever branch you want
   auto-deployed). Preview deploys from other branches are fine — they
   just won't have the staging domain bound.
5. **Node version**: set to `20.x` to match `web/package.json` engines.
6. **Don't deploy yet.** We need env vars and domains first.

### Domain + DNS

Decide the root domain (the user's message said "a domain/root we
already control"). For the rest of this doc I'll write it as `<ROOT>` —
substitute your actual value.

You'll add three hostnames to Vercel:

| Hostname | Purpose | Points at |
| --- | --- | --- |
| `app-staging.<ROOT>` | Admin workspace + login | Vercel production |
| `*.staging.<ROOT>` | Wildcard for tenant storefronts | Vercel production |
| (optional) `staging.<ROOT>` | Root redirect → `app-staging.<ROOT>` | Vercel redirect |

Vercel wildcard `*.staging.<ROOT>` requires a **Pro plan or higher**. If
you're on Hobby, fall back to assigning each of `tester1.staging.<ROOT>`,
`tester2.staging.<ROOT>`, `tester3.staging.<ROOT>` individually. Works the
same; just three DNS records instead of one wildcard.

**DNS records to add at your registrar:**

```
app-staging.<ROOT>      CNAME  cname.vercel-dns.com.
*.staging.<ROOT>        CNAME  cname.vercel-dns.com.    # Pro+ only
# fallback for Hobby plans:
# tester1.staging.<ROOT>  CNAME  cname.vercel-dns.com.
# tester2.staging.<ROOT>  CNAME  cname.vercel-dns.com.
# tester3.staging.<ROOT>  CNAME  cname.vercel-dns.com.
```

Vercel SSL provisioning is automatic once DNS propagates (usually under
5 minutes).

---

## B — Fresh Supabase project (your hands)

1. Supabase dashboard → New Project → region near your testers (us-east
   or eu-west is fine for a Round 1 pass).
2. Database password: save it in your password manager. You won't need
   it for the app — just for the Supabase SQL editor and the `psql`
   connection string.
3. Wait for the project to finish provisioning (~1 minute).
4. From **Project Settings → API**, copy:
   - Project URL → this is `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → this is `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` `secret` key → this is `SUPABASE_SERVICE_ROLE_KEY`
     (keep this one out of the browser; never ship it to client code)
5. From **Project Settings → Database → Connection string (URI)**, copy
   the **transaction pooler** URL and save it as `DATABASE_URL` for the
   migration step. The app itself doesn't use this at runtime; it's
   only for applying migrations.

Do not enable any extra Supabase features (storage buckets beyond what
migrations create, edge functions, realtime listeners) unless a
migration explicitly needs them.

---

## C — Apply migrations to the staging Supabase (I can drive once A+B are done)

169 migrations live under `supabase/migrations/`. Apply them all, in
order, to the fresh staging database.

Two ways — pick one:

### C1 — Supabase CLI (preferred if you've got it locally)

```
# install once: https://supabase.com/docs/guides/cli/getting-started
supabase login
supabase link --project-ref <STAGING_PROJECT_REF>   # from the project URL
supabase db push
```

`db push` applies every migration in `supabase/migrations/` over the
linked project. This takes 2–5 minutes against a fresh DB.

### C2 — Direct SQL via psql (fallback)

```
# from repo root:
for f in supabase/migrations/*.sql; do
  echo "→ $f"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done
```

If any migration errors, stop and fix — do not skip. All 169 are
expected to apply cleanly against an empty Postgres 17.

After migrations land, verify a couple of core tables:

```
psql "$DATABASE_URL" -c "select count(*) from public.agencies;"
psql "$DATABASE_URL" -c "select count(*) from public.agency_domains;"
# both should be 0 (or tiny; some migrations seed the hub agency)
```

---

## D — Set env vars on Vercel (your hands; 3 vars)

Vercel dashboard → project → **Settings → Environment Variables**. Add
all three to the **Production** environment. Do NOT add them to
Preview — previews shouldn't hit the staging DB.

```
NEXT_PUBLIC_SUPABASE_URL        = <staging project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY   = <staging anon key>
NEXT_PUBLIC_SITE_URL            = https://app-staging.<ROOT>
SUPABASE_SERVICE_ROLE_KEY       = <staging service-role key>
```

The 4th (`SUPABASE_SERVICE_ROLE_KEY`) is **only** needed if the running
app must call `auth.admin` APIs (password reset UI, impersonation,
in-app user provisioning). For Round 1 QA tasks 1–8, none of those are
exercised, so you can omit it and keep it out of the Vercel env. It
IS needed locally when running the seed script — that lives in
`web/.env.staging` on your machine, not on Vercel.

Other env vars (`GOOGLE_PLACES_API_KEY`, `OPENAI_API_KEY`,
`ANTHROPIC_API_KEY`, `RESEND_API_KEY`) are not in Round 1 scope; omit
them. Degradation paths are in place.

---

## E — Seed the staging DB (I drive this)

Create `web/.env.staging` locally with:

```
NEXT_PUBLIC_SUPABASE_URL=<staging URL>
SUPABASE_SERVICE_ROLE_KEY=<staging service-role key>
STAGING_ROOT_DOMAIN=<ROOT>        # e.g. "example.com" — NOT including "staging."
```

Note on the root-domain variable: the seed constructs hostnames as
`app-staging.<ROOT>` and `tester<n>.<ROOT>`. If you asked for the
`*.staging.<ROOT>` wildcard pattern, set `STAGING_ROOT_DOMAIN` to
`staging.<ROOT>` instead — the seed will then build
`app-staging.staging.<ROOT>` (ugly) and `tester1.staging.<ROOT>`
(what you want).

Then from `web/`:

```
# Always dry-run first — confirms env and prints the plan:
node --env-file=.env.staging scripts/seed-staging-round1.mjs --dry-run

# Apply:
node --env-file=.env.staging scripts/seed-staging-round1.mjs
```

The seed is idempotent — safe to re-run if anything fails mid-way. It
writes:
- `qa-admin@impronta.test` super-admin (password printed at the end)
- `app-staging.<ROOT>` registered in `agency_domains` as `kind='app'`
- 3 tester tenants (`tester1..3`) with:
  - `agencies` row
  - `agency_domains` row (`kind='subdomain'`)
  - `agency_business_identity` row (public name, tagline, locales)
  - `agency_branding` row (neutral gold/black palette, no draft)
  - owner auth user + profile (`agency_staff`, `active`)
  - `agency_memberships` row (`role='owner'`)
  - 3 `talent_profiles` rows + matching `agency_talent_roster` links
    (minimal; no M8 editorial fields — testers fill those in Task 8)

Nothing else is seeded. Testers land on the empty-welcome state and
exercise the starter flow (Task 2).

To wipe and reseed: `node --env-file=.env.staging scripts/seed-staging-round1.mjs --purge`
then re-run the seed.

---

## F — Deploy + first smoke (I drive the smoke; you push "Deploy")

1. Vercel dashboard → project → **Deployments → Redeploy** (or push
   to `main` if that's wired).
2. Wait for the deploy to go green. If it fails, paste the log and I
   can diagnose. Common first-deploy failures:
   - Missing env var → re-check the 3 required ones are set for
     Production.
   - `next build` fails → unlikely (we confirmed `npm run ci` clean
     locally), but if it does the log will point at the file.
3. Once the deploy is live at `https://app-staging.<ROOT>`, hand the
   URL back to me and I'll run the full QA_SCRIPT smoke pass.

---

## G — Smoke pass (I drive)

I'll execute one complete pass of the 8-task [QA_SCRIPT.md](QA_SCRIPT.md)
against `https://app-staging.<ROOT>` using `owner+tester1@impronta.test`:

- T1: log in, land in admin, reach `/admin/site-settings/structure`.
- T2: apply the Editorial Bridal starter preset.
- T3: edit a hero headline, confirm autosave + preview within 3s.
- T4: add a Gallery section from the library, drag-reorder.
- T5: upload an image via MediaPicker, confirm auto-select.
- T6: open publish pre-flight, review diff, publish.
- T7: delete a section, recover via undo or Revisions.
- T8: edit 3 M8 fields on a talent, view on `/t/R1-01-01`.

Any blocker I hit I'll report as "staging-specific vs. product bug" so
we know whether it's a Round 1 readiness issue or a deeper problem.

---

## H — Go / no-go report (I deliver)

After my smoke pass I return:

- The staging URLs (admin + 3 tenant storefronts), live and reachable.
- The 4 account credentials (1 admin + 3 owners).
- Which tenant each tester should use (tester1 = tester 1, etc.).
- Per-task status: did each of the 8 tasks complete end-to-end on
  staging, and how long each took to cold-compile (cold compile time
  is the biggest unknown on a fresh deploy).
- Any staging-specific issues I hit (cookie domain, OAuth redirect
  origin mismatch, RLS surprise, wildcard cert propagation delay,
  MediaPicker upload failing without a `media` bucket, etc.).
- Final recommendation: go / no-go for Round 1 tester invites.

If no-go, the findings are always scoped to *staging configuration* —
product code regressions are caught by Round 0's CI additions before
they reach this stage.

---

## What happens if something breaks mid-playbook

- **Deploy fails on Vercel:** paste the build log in chat; usually
  solvable without rollback.
- **Migrations error out partway:** re-run the remaining files
  individually; they're ordered by timestamp prefix. If a migration is
  genuinely broken on a fresh DB, that's a repo bug — I'll fix it.
- **Seed script errors partway:** it's idempotent; re-run. If the same
  error repeats, the schema on staging doesn't match dev — paste the
  error, I'll diagnose.
- **Middleware returns 404 on a tenant host:** `agency_domains` row
  missing or status ≠ active. Re-run the seed; check `select * from
  agency_domains where hostname = 'tester1.<ROOT>';` in the Supabase
  SQL editor.
- **OAuth (Google sign-in) redirect loop:** `NEXT_PUBLIC_SITE_URL`
  doesn't match Supabase's allowed redirect URLs. Supabase dashboard
  → Authentication → URL Configuration → add
  `https://app-staging.<ROOT>/auth/callback` as an allowed redirect.
  (We don't need Google for Round 1 password auth, but the toggle
  should still resolve cleanly.)

---

## After Round 1 lands

Round 1 signal comes back, we re-read `QA_POLISH_QUEUE.md` with findings
in hand, decide the next bounded polish batch, and stabilize again
before Round 2. Staging stays up as long as it's useful; purge when
done via the `--purge` flag so the fixture doesn't rot.
