# Onboarding module · Phase 4 (save, build, arrive) · evidence

Branch `feat/onboarding-p4-account` · isolated QA stack (marketing proxy :3105, app :3008/:3106, Supabase branch `fxlankepwnvelxjrahwk`) · 2026-09-16.

## What was run

| Command | Exit |
|---|---|
| `npm run gates` (`TSC PASS (exit 0)`, lint, size ratchet incl. the unchecked-Supabase-read guard, i18n parity) | 0 |
| `playwright test e2e/onboarding/build-arrival.spec.ts --project=chromium` (2) · `account.spec.ts` (2) · `understood.spec.ts` (4) · `shell-open-and-resume.spec.ts` chromium + mobile (12), each run on its own | 0 |
| `playwright test e2e/onboarding --project=chromium --project=mobile-onboarding` (28, one run) | 1: 16 passed, 12 timed out (`onb-ready` / `onb-arrival` / resume never visible within 90 s) on a Mac at load 11–14 shared with another session's five `tsx` workers; every one of the 12 passes on its own on the same stack. Re-run at low load before Phase 6 is the gate, not this line. |

## Proven by the specs

- **Save it** (`account.spec.ts`): a guest reaches the account step after the short form with "3 · Save" and "Not signed in"; **Continue with Google** opens the popup on `/auth/google?popup=1&next=…` (never completed here; closing it shows the honest "closed before finishing" state); Back returns to Ready with the answers kept. **Email → code**: on this stack the branch's auth email hook is unconfigured (`Hook requires authorization token`), so the module shows the send error and keeps the address; with `ONB_OTP_MINT=1` on a stack whose hook works the spec mints the 8-digit code through `generateLink` and finishes the sign-in (not run here; owner's day-1 item).
- **Build and arrival** (`build-arrival.spec.ts`): **El Paisa** (seeded import facts, fresh user): Ready shows the link available → Build shows "4 · Build" with the ticking steps → `POST /api/onboarding/build` provisions the workspace (`agencies` row with the chosen slug), the composer runs inside provisioning (real model copy on this stack: `copySource: model`, Look per family, six pages) and writes the stamp; the arrival claims exactly the stamp (hours and WhatsApp present, photos only for a type-level hero, which this stack has none of → `fallback` with the "photos still generic" line); a second POST returns the same record and the tenant count stays 1; the fresh profile is `active`; `/w/<slug>?edit=1&panel=sections` opens the builder on the composed home. **Rosa** (talent): Build creates the `talent_profiles` row (draft, display name and city from the brief), arrives on "You're in, Rosa QA · 2 services" with "Finish my page".

## Reviewed in the browser by me

Mariana (both) through the whole spine: card → two quick things → Ready → Build → arrival; the composed Editorial-Look site rendered on the app host; the `?edit=1` deep link auto-entered edit mode (after `PREVIEW_JWT_SECRET` was added to the isolated env). Screenshots 30–33 from the spec.

## Found and fixed on the way (all in this PR)

1. Provisioning's capability checks read a per-process 30 s membership cache: a workspace created seconds after the marketing shell listed the owner's tenants failed its own `homepage.compose` check (`no_membership`). `forgetUserTenantMemberships` (new, `lib/saas/tenant.ts`) is called after the owner membership insert in `provisionWorkspaceFromLead`.
2. A code-only or OAuth signup arrives as `client`; `ensure_profile_for_current_user` recomputes `account_status` from the role on every request and put the new owner back to `onboarding`, so every app page bounced between `/onboarding/role` and `/admin`. Business-path builds now promote the fresh profile to `agency_staff` (`promoteFreshProfileToWorkspaceOwner`), and the build route busts the middleware's 60 s access-profile memo + sets the refresh cookie.
3. Isolated branch only (not code): the tenant-scoped RLS bodies from `20260602100100` had never run there (old `*_staff_all` policies) → re-applied with `journeys:repair`; production has the right policies (checked read-only). The branch has no platform hub tenant (`ensurePlatformHubRoster` logs and continues).

## Not clicked

Real Google sign-in (owner's Phase 6 check); email code delivery (branch hook); the mic.
