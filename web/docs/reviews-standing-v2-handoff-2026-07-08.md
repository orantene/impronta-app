# STANDING reviews — continuation handoff (2026-07-08)

Copy the block below into a new chat to continue. Everything already shipped is live; this finishes the deferred work, tests it, and merges it.

---

## MISSION
Finish, test, and merge the remaining work on **STANDING**, the Impronta/Tulala review-and-reputation system (a deliberately-not-Airbnb design: "would book again" + recency tier + verified-paid integrity). The core (v1 + v2 P1–P6) is SHIPPED LIVE. Your job: execute every REMAINING item below, gate + QA each, and merge to `main` — leave nothing behind.

## ALREADY SHIPPED LIVE (do not rebuild)
- PRs **#718** (STANDING v1), **#722** (fast-follow gating), **#724** (P0 private_note leak fix + v2 plan doc), **#728** (v2 P1–P6) — all squash-merged to `main`, deployed, `deploy:smoke` GREEN.
- Live on `improntamodels.com`: public profile standing (tier + "would book again" + distribution + testimonials + replies), collection form capturing the full signal, `/review/[token]` landing, faceone emails, Bayesian "Top rated" sort, inquiry trust chip, reason-coded moderation + audit, talent analytics.
- Plan doc: `web/docs/reviews-standing-v2-execution-plan-2026-07-08.md`. Full state in auto-memory `project_reviews_standing_build.md`.

## ENVIRONMENT & PROTOCOL (critical — read before touching anything)
- **Worktree**: `/Users/oranpersonal/Desktop/impronta-reviews`. It's a shared multi-agent repo — NEVER `git switch` in the main checkout (`/Users/oranpersonal/Desktop/impronta-app`). Work in this worktree. `feat/reviews-standing-v2` is MERGED; create a FRESH branch off latest `origin/main`: `git fetch origin main && git switch -c feat/reviews-standing-v3 origin/main`.
- **Dev server**: `cd web && PORT=3000 npm run dev:webpack` (webpack, NOT turbopack — node_modules is symlinked). First hit to a route compiles ~20–45s and may flash a transient error page — that's normal; wait for `GET ... 200` in the log. Stale-`.next` wedge ("Cannot read properties of undefined (reading 'call')") → `rm -rf web/.next` + restart.
- **Localhost = PROD Supabase** (project `pluhdapdnuiulvxmyspd`). There is no separate dev DB.
- **View a tenant page**: `http://impronta.lvh.me:3000/t/TAL-00045` (lvh.me → 127.0.0.1, host is in agency_domains) OR `curl -H "Host: improntamodels.com" http://localhost:3000/...`.
- **Dev sign-in** (passwordless, @impronta.test): navigate `http://impronta.lvh.me:3000/api/dev/signin?email=<x>@impronta.test&next=<path>`.
- **Migrations**: repo FUTURE-dates them; latest reviews migs are `20261110xxxxxx` — new ones use `20261110110000`+ (after the last). Apply via **Supabase MCP `apply_migration`** (NOT `db:push` — SASL/history drift). It records a DATE-based version; AFTER applying, reconcile so `deploy:smoke` drift passes: `UPDATE supabase_migrations.schema_migrations SET version='<filename-timestamp>' WHERE name='<migration_name>';`.
- **Gate every change**: stop the dev server first (tsc corrupts `.next/dev` if it's up), then `cd web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` + `npx eslint <changed files>` + `npm run test:reviews` + `npm run test:notifications`.
- **Merge**: push branch → `gh pr create --base main` → `gh pr merge <n> --squash --admin`. `main` auto-deploys (Vercel). Then `cd web && npm run deploy:smoke`. `main` moves fast (many agents) — expect conflicts; `git fetch origin main && git merge origin/main`, resolve keeping the review superset, and RESTORE any dropped imports (a prior conflict dropped `import { COLORS, FONTS, RADIUS, useAdminShell } from "../../state"` in `ReviewsPage.tsx`). Reconcile migration versions again if you added migrations.
- **Multi-agent**: for parallel agent work, partition by DISJOINT files; one migration timestamp per agent; gate between phases.

## KEY IDs
- Supabase project: `pluhdapdnuiulvxmyspd`. Impronta tenant: `00000000-0000-0000-0000-000000000001` (host `improntamodels.com`, `agency_entitlements.reviews_enabled = true`).
- Demo talent "More": `more@impronta.test`, profile_code `TAL-00045`, id `1d6bcec0-874d-427d-90ce-9f9c8f0e8929`. QA booking `2d7e67c6-46c0-4110-82aa-a111c16f6698` (completed+paid). Seeded: 5 anon 5★ reviews + 2 private_notes + 1 testimonial (Valentina R.) — kept as the live demo, deletable via `delete from talent_reviews where talent_profile_id='1d6bcec0-...'`.
- Clients: `qa-client-1@impronta.test` (More's booking client, has a client account), `qa-client-2@impronta.test`.

## REMAINING WORK — execute ALL, gate + QA + merge each (priority order)
1. **Mount the moderation-queue drawer** (built but unreachable). Register `"reviews-moderation"` in `web/src/components/admin/shell/internal/state/drawer-ids.ts` (DrawerId union) + a `case "reviews-moderation": return <ReviewModerationDrawer />;` in `web/src/components/admin/shell/internal/drawers.tsx`, where `ReviewModerationDrawer` is a small body wrapping `ReviewModerationQueue` (from `.../profile-shell/profile-shell-modules/review-moderation-queue.tsx`) in a `DrawerShell`, passing `tenantId` from `useAdminShell().bridgeTenantIdentity?.tenantId`. The report notification (`review-actions.ts` ~L809) already targets this drawer id.
2. **faceone booking-picker**: `ReviewsPage.tsx` `AskForReviewCard` has `// TODO(booking-picker)` — replace the email-only form with a picker over the talent's completed bookings (add a loader for completed bookings + counterparty client).
3. **Reminder cron wiring**: `web/src/lib/notifications/producers/review-request-reminder-notify.ts` exports `runReviewRequestReminders()` but nothing calls it — wire it into an existing Vercel daily cron (`/api/cron/*`, CRON_SECRET-gated).
4. **Guest-shadow review path**: `web/src/lib/reviews/review-token-actions.ts` `submitReviewViaTokenAction` is account-only (`// TODO(guest-shadow)`). Let a true guest (no account) review via token — mint/link a shadow `profiles` row (talent_reviews.client_user_id is NOT NULL FK), keep the verify trigger honest (guest → NOT verified badge).
5. **Media/photo reviews** (whole feature): new `talent_review_media` table + RLS; authenticated-only upload on `LeaveReviewCard` + the token form via the existing media infra; display across profile/card; moderation. (Deliberately deferred in v2.)
6. **Stripe `verified_paid` hardening** (when Stripe is wired): move `supabase/migrations/_pending_stripe/20261110100000_reviews_verified_paid_stripe_hardening.sql.pending` → `supabase/migrations/` with a fresh timestamp (drop `.pending`), apply, grandfather/backfill pre-Stripe verified rows, re-run `talent_reviews_recompute_summary` for all talents.
7. **Cross-tenant / hub rating display decision**: `talent_reviews_recompute_summary` aggregates per `talent_profile_id` across ALL tenants; a profile shown under multiple tenants (hub referral lane) displays a rating partly earned elsewhere. Decide blended-and-labeled vs per-tenant display aggregates; implement.
8. **Entitlement-gate the last surfaces**: the talent Reviews page reads gated already, but the **inquiry-thread trust chip** (`admin-2.tsx`) and the **talent's own Reviews page** read rating directly, ungated (low-stakes — decide + gate for full "reviews entirely premium").
9. **Section-builder + marketing directory cards** carry NO rating (discover matview path) — card standing only shows on the directory grid/list-row today. Add `rating_avg`/`rating_count` to the discover matview (`talent_discover_index`) + those card adapters, gated by the same token + entitlement.
10. **es/fr i18n**: `web/messages/fr.json` has no `dashboard.clientNav` block (falls back to en) — add it + the `reviews` key. Add translation keys for any hardcoded English review strings (tier names, trait chips).
11. **SEO**: `Person` markup can't earn Google star snippets — decide whether to model a bookable **Service/Offer** page (real project) or set expectations to valid-schema-only. Do NOT put AggregateRating on Person/Organization schema.

## TESTING — do these on localhost (dev:webpack) and confirm on prod after merge
- **Collection**: sign in as `qa-client-1@impronta.test` → `/impronta/client/bookings` → leave a review on the More booking using would-book-again + attribute stars + traits + private note + anonymous → confirm the row has all columns + `would_book_again_pct` recomputes.
- **Reply + display**: sign in as More (`more@impronta.test`) → talent **Reviews** page → reply to a review; confirm "Response from More" on the public profile; seed attr data + ≥5 reviews to see distribution + attribute bars.
- **Token**: create a `review_requests` row (faceone) → open `/review/{invite_token}` → account-match submit → row `status='completed'`, second visit = used.
- **Moderation**: hide a review with a reason code → `review_moderation_events` row; open the (newly-mounted) reported-queue → laundering-delta panel reads `rating_all_*`.
- **Ranking**: directory `?sort=top_rated` orders by the Bayesian score; inquiry thread shows the trust chip.
- After merge: `npm run deploy:smoke` GREEN + `/review/<x>` returns 200 on `improntamodels.com`.

## DEFINITION OF DONE
Every item 1–11 built, tsc+eslint+test:reviews+test:notifications GREEN, QA'd on localhost, merged to `main` via squash PR(s), `deploy:smoke` GREEN, and the deferred TODOs list emptied (or any newly-deferred item documented with rationale + file:line). Update `project_reviews_standing_build.md` memory when done.
