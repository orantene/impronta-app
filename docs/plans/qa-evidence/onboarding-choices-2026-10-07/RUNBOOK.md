# Runbook: onboarding choices journey against the isolated staging stack

Spec: `web/e2e/onboarding/choices-journey.spec.ts`. Prepared, NOT yet run against staging.
A human with explicit permission runs it. It signs up fresh accounts (one per choice per
viewport) on the ISOLATED stack only; never production, never Impronta.

## Environment variables (names only; never commit or paste values)

| Name | Meaning |
|---|---|
| `JOURNEY_MARKETING_ORIGIN` | Marketing host origin (serves `/start`). No default. |
| `JOURNEY_APP_ORIGIN` | App host origin (`/talent/*`, `/api/dev/signin`). No default. |
| `JOURNEY_TALENT_HOST_TEMPLATE` | Talent site host pattern with `{slug}`, e.g. `staging-qa-{slug}.tulala.digital`. Required off-local. |
| `JOURNEY_ALLOWED_HOSTS` | Optional comma list of extra exact hostnames to allow. Cannot override the forbidden set. |
| `JOURNEY_TARGET` | `local` only for the localhost dev stack (gives localhost:3105/3106 defaults). Leave unset for staging. |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Optional. Sent as `x-vercel-protection-bypass` only to allow-listed hosts. Never logged or written. |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (and the rest of the isolated `.env.local`) | Must be the isolated project `fxlankepwnvelxjrahwk` (`scripts/isolated-target-guard.mjs` exits otherwise). |
| `ONB_EVIDENCE_DIR` | Absolute directory for screenshots and `results/*.json`. |
| `PLAYWRIGHT_SKIP_WEBSERVER=1` | Do not start a local server. |
| `PLAYWRIGHT_BASE_URL` | Same value as `JOURNEY_MARKETING_ORIGIN` (also host-checked). |

## Guard rules (refuse to run = the spec throws at load)

- Every configured origin hostname must be `localhost`, `127.0.0.1`, match
  `^staging-qa-[a-z0-9-]+\.tulala\.digital$`, or be listed in `JOURNEY_ALLOWED_HOSTS`.
- Always refused, even if listed: `tulala.digital`, `app.tulala.digital`,
  `improntamodels.com` (and subdomains), any other `*.tulala.digital` host not starting with `staging-qa-`.
- The talent host template is checked with a probe slug, so `{slug}.tulala.digital` is refused.
- The Supabase target must be the isolated project (existing `assertIsolatedJourneysTarget`).
- Precondition on the stack (not checked here): `/api/dev/signin` must be enabled on the staging app host, and the
  staging talent hosts must exist under the template.

## Commands

One role (`myself`, `studio` or `both`, both viewports; `-g` filters by test title):

```
cd web && ONB_EVIDENCE_DIR=<abs dir> PLAYWRIGHT_SKIP_WEBSERVER=1 \
  PLAYWRIGHT_BASE_URL="$JOURNEY_MARKETING_ORIGIN" \
  npx playwright test e2e/onboarding/choices-journey.spec.ts --workers=1 -g "^onboarding choices .* myself"
```

All roles plus the extra rows (C1-03, C1-10, C1-11, DS-49, which reuse the latest `myself` desktop account, so
run after the journeys, same invocation, same `--workers=1`):

```
cd web && ONB_EVIDENCE_DIR=<abs dir> PLAYWRIGHT_SKIP_WEBSERVER=1 \
  PLAYWRIGHT_BASE_URL="$JOURNEY_MARKETING_ORIGIN" \
  npx playwright test e2e/onboarding/choices-journey.spec.ts --workers=1
```

(Env vars above must already be exported in the shell.)

## What step 4 (Finish) asserts per choice

- Para mi (`myself`): CTA "Abrir mi sitio"; profile `workflow_status` approved/published and `visibility` public;
  `talent_sites.site_published_at` set; the hub profile `/t/<profile_code>` and the site open with the name.
- Ambos (`both`): not the failed/draft screen; own talent site (slug, published) distinct from the workspace page;
  both pages open 200 with the name.
- Estudio (`studio`): `data-finish="inquiry_only"`, text says "lista para recibir solicitudes", never "reservable";
  add-first-team-member action links to `/roster/new`; secondary "also book myself" link visible.
- Extra rows: C1-10 time zone control found by its label (60 s wait); C1-11 services list shown equals DB offerings;
  DS-49 `/talent/clients` empty state (no "Nuevo" badge, no "N de N clientes" line, add-client buttons).

## Evidence written (under `ONB_EVIDENCE_DIR`)

- Screenshots per step: `<choice>-<viewport>-NN-<name>.jpg` (and `FAIL-stepN` on failure); extra rows `<ROW>-NN-<name>.jpg`.
- `results/<choice>-<viewport>.json` (per-step PASS/FAIL/SKIP plus facts), `results/extra-rows-<ROW>.json`,
  `results/<ROW>-<label>.txt` page-text dumps.
- The bypass secret is never written to any of these.

## Read-only SQL to dump one account's rows

Run through the Supabase MCP `execute_sql` on project `fxlankepwnvelxjrahwk` ONLY (check the project id first).
Replace `:email`. SELECT only.

```sql
-- ids
select u.id as user_id from auth.users u where u.email = ':email';

-- brief
select id, status, module_state from tulala_briefs
 where profile_id = (select id from auth.users where email = ':email') order by updated_at desc limit 1;

-- talent profile
select id, profile_code, display_name, workflow_status, visibility, preferred_locale, booking_terms
  from talent_profiles where user_id = (select id from auth.users where email = ':email') and deleted_at is null;

-- offerings, hours, site, roster (talent id from the previous query)
select title, amount_cents, duration_minutes from talent_offerings where talent_profile_id = ':talent_id';
select * from talent_booking_hours where talent_profile_id = ':talent_id';
select site_slug, theme_design_slug, site_published_at from talent_sites where talent_profile_id = ':talent_id';
select tenant_id, status, agency_visibility from agency_talent_roster where talent_profile_id = ':talent_id';
```

## Cleanup

Isolated DB only (`fxlankepwnvelxjrahwk`). Test accounts are `qa-onb-choice-<choice>-<viewport>-<stamp>@impronta.test`
and guests `qa-onb-guest-...@impronta.test`. Use the existing journeys cleanup tooling
(`scripts/isolated-target-guard.mjs` guarded) or delete those users and their rows by that email prefix. Never run
cleanup against any other project.
