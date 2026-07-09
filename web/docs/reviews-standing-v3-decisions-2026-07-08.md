# STANDING v3 — decisions & deferrals (2026-07-08)

Companion to `reviews-standing-v2-execution-plan-2026-07-08.md`. This records the
v3 continuation work: what shipped, and the three "decide + document" items
(Stripe hardening, cross-tenant blending, SEO) plus precisely-scoped follow-ups.
Branch: `feat/reviews-standing-v3` (off `main`).

## Shipped in v3

| Item | What | Where |
|---|---|---|
| 1 | Mounted the reviews-moderation drawer (DrawerId + switch case + wrapper) so the existing report notification (`review-actions.ts` `notifyStaffOfReport` → `targetDrawer:"reviews-moderation"`) opens the queue. | `drawers.tsx`, `state/drawer-ids.ts` |
| 2 | faceone booking-picker — `AskForReviewCard` now picks a past completed booking (client resolved server-side, no PII) via `loadClientReviewablesAction` + `loadReviewRequestsForOwnerAction`; email fallback kept. Extracted to `ReviewsAskForReviewCard.tsx`. | `talent/pages/ReviewsAskForReviewCard.tsx` |
| 3 | Review-request reminder cron wired into the daily `booking-reminders` route (best-effort, idempotent). | `api/cron/booking-reminders/route.ts` |
| 4 | Guest-shadow review path — email-only invites reviewable without an account via the single-use token (provision an unclaimed client account, insert via service-role → honest unverified "Invited review"). | `review-token-actions.ts`, `review/[token]/*` |
| 8 | Entitlement gate on the inquiry-thread trust chip (data-bridge `tenantReviewsEnabled`). Talent Reviews page was already gated. | `_data-bridge/inquiries-messages.ts` |
| 9 | Verified standing on the discover matview (`rating_avg`/`rating_count`/`would_book_again_pct`) + marketing directory row chip. | mig `20261110110000`, `discover.ts`, `DirectoryTalentRow.tsx` |
| 10 | fr `dashboard.clientNav` block added (incl. `reviews`). | `messages/fr.json` |

## Decisions (items 6, 7, 11)

### Item 6 — Stripe `verified_paid` hardening: **DO NOT APPLY YET (correct state)**
The hardening lives at `supabase/migrations/_pending_stripe/20261110100000_reviews_verified_paid_stripe_hardening.sql.pending` and is intentionally **not applied**. Today every payment is `provider='manual'` (Stripe not wired); the current `review_is_arms_length_paid` (`20261110040000:66-74`) accepts a manual paid transaction paid by the reviewing client — correct for real arm's-length manual bookings. Applying the `provider <> 'manual' AND provider_reference IS NOT NULL` tightening now would set `verified_paid=FALSE` for **every** existing review (all manual) and zero out every public `rating_avg`. So it waits for Stripe. The pending file carries the full go-live runbook (move + fresh timestamp, `db:push`, grandfather/backfill, re-run `talent_reviews_recompute_summary` for all talents). **No action taken by design.** Interim risk (a colluding staffer minting a manual paid txn) is covered by the Phase-5 rating-integrity delta panel (now mounted, item 1) + ops policy.

### Item 7 — Cross-tenant / hub rating: **BLENDED-AND-LABELED (implemented)**
`talent_reviews_recompute_summary(p_talent_profile_id)` (`20261110040000:200-242`) aggregates across **all** tenants — a `talent_profiles` row is tenant-agnostic, joined to tenants via the roster. This blending is **intentional**: STANDING is a talent's **portable** reputation that follows them across hubs (memory `project_reviews_standing_build.md`: "reviews … so cross-hub reputation isn't truncated"). A profile shown under two tenants shows their overall verified standing, not a per-tenant slice.

- **Rejected alternative — per-tenant aggregates:** would truncate cross-hub reputation (contra the mandate), needs a new `(talent, tenant)` aggregate table + recompute/trigger rewrite, and fragments a talent's record. Not built.
- **Labeling (the "and-labeled" half):** the public profile caption is provenance-honest — "Verified reviews · from completed bookings" (`TalentReviewsSection.tsx:363`), which reads as the talent's overall verified work, not a tenant claim. The discover matview / marketing card chip title reads "Verified standing from N completed bookings" (`DirectoryTalentRow.tsx`). The blended, cross-tenant nature is documented in the matview migration header (`20261110110000`).

### Item 11 — SEO review stars: **VALID-SCHEMA-ONLY, no AggregateRating on Person (confirmed)**
Google renders review-star snippets only for Product / Recipe / Course / Event / Movie / Book / LocalBusiness / SoftwareApp — **not** `Person`/`Organization`. Our talent page emits `ProfilePage`→`Person` (`web/src/lib/seo/talent-json-ld.ts`) and correctly emits **no** `AggregateRating`/`Review` markup (verified: zero matches in `web/src/lib/seo/`). We keep it that way — putting `AggregateRating` on `Person`/`Organization` is a Google policy violation (self-serving) and would risk manual action.

- **Decision:** set expectations to "valid schema + LLM comprehension, **no** SERP review stars for the profile page." Earning Google review stars requires modeling a bookable **Service/Offer** page (a real, separate project with its own `Offer`/`Service` schema) — out of scope here and tracked as future work. **No schema change made** (making one would be the bug).

## Precisely-scoped follow-ups (documented deferrals)

- **Item 9 render — canonical grid `<TalentCard>` + buyer Discover feed.** The matview + `DiscoverTalentListItem` DTO now carry `ratingAvg`/`ratingCount`/`wouldBookAgainPct`, and the marketing directory **list** row (`DirectoryTalentRow`) renders a credibility-gated chip. Rendering standing on (a) the canonical grid `<TalentCard>` (`toCanonicalCardData` → `CanonicalTalentCardData`, `shared.ts:125`) and (b) the per-tenant buyer Discover feed (`DiscoverShell.tsx`) still needs: extend `CanonicalTalentCardData` + the `<TalentCard>` render, and gate the per-tenant feed on `tenantReviewsEnabled` (the marketing global directory is platform-host, so ungated is correct there; a per-tenant feed is not). Data is already available on the DTO — this is render-only.
- **Item 10 — tier/trait i18n.** The named defect (missing fr `clientNav`) is fixed. Tier labels (`standingTierLabel`) and trait chips (`TRAIT_OPTIONS`) still return English from pure modules (`craft-standing.ts`, `LeaveReviewCard.tsx`, `ReviewTokenForm.tsx`). Fully localizing them means adding `reviews.standing.tier.*` / `reviews.traits.*` keys to en/es/fr and translating at each render site (public profile + directory list-row + talent Reviews page + two forms) — a multi-surface pass on an English-first, pre-launch product with only partial es/fr coverage today. Deferred as low near-term value vs. the pure-module refactor cost; `craft-standing.ts` stays pure (safe for DTO mappers + tests) by design.
