# STANDING v2 — Execution Plan

**Date:** 2026-07-08 · **Status:** v1 shipped live (PRs #718 + #722, deploy:smoke green) · **Goal:** take the review system from "shipped v1" to *beats Airbnb + Google + Yotpo, fully integrated with the product*.

This plan is the product of an adversarial audit (every claim re-verified against the merged worktree at `feat/reviews-followup` == prod main). The raw synthesis had three strategic errors that the critique caught and are corrected here — read §0 first.

---

## 0. Corrections the audit forced (read before planning)

1. **schema.org review stars are NOT achievable via `Person` markup.** Google supports review snippets only for Product, Recipe, Course, Event, Movie, Book, LocalBusiness, SoftwareApp — **not `Person`/`Organization`**. Our profile emits `ProfilePage`→`Person` (`web/src/lib/seo/talent-json-ld.ts`). So "stars in Google SERPs" is **not** a small win; it requires modeling a bookable **Service/Offer** page (a real project) and is policy-gray for person-services. → SEO is demoted from "★★★★★ easy" to a scoped, expectation-honest item.
2. **Email infrastructure already exists — do not build it.** Resend + a full notification engine are in the repo (`web/src/lib/notifications/{catalog,dispatcher,emit,digest}.ts`, `email_suppressions`, unsubscribe tokens; the shipped nudge already calls `emitNotification`). The collection engine is *catalog entries + producers*, not greenfield email. This makes the highest-conversion phase cheap and removes the false "critical dependency."
3. **`private_note` was world-readable (P0) — FIXED in this session.** RLS gated rows, but default table grants let the anon key SELECT every column, so `private_note` (talent-only coaching) + raw `client_user_id` were readable via PostgREST (confirmed live, then closed). Migration `20261110070000_reviews_private_note_privilege.sql` revokes blanket SELECT and re-grants all columns except `private_note`; `loadOwnerPrivateNoteThemes` moved to a service-role read behind an explicit ownership check. **This ships as its own hotfix ahead of everything below.**

---

## 1. Honest audit scorecard

| Lane | Score | One-line evidence |
|---|---|---|
| DB integrity | **7/10** | arms-length verify + 48h edit-guard + column-guard + split aggregates + immutable audit (`20261110040000`). Docked: pre-Stripe `provider='manual'` farming path; `client_reviews` got **none** of the hardening. |
| Entitlement | **6/10** | public profile / directory fetch / client page+nav gated; talent `ReviewsPage`, `profile-reviews` drawer, faceone actions **ungated**. |
| Display | **4/10** | tier + stars + WBA% + anon-mask render; **no** distribution, attribute aggregates, replies, pagination (hardcoded 12), per-skill chips; directory token off everywhere. |
| i18n | **4/10** | es "Reseñas" only; fr clientNav absent. |
| Collection UX | **3/10** | form captures **only rating+body**; all 8 STANDING columns unreachable from any UI; no guest path; silent 48h-edit failure. |
| Moderation/analytics | **3/10** | hide/report/audit table exist; no reason codes in UI, `review_moderation_events` + `rating_all_*` **never read**, no queue, no analytics. |
| Engagement/notifications | **2/10** | one nudge (authed clients only); no review-received / reply / reminder emails; faceone sends nothing (`TODO(email)`). |
| SEO | **1/10** | zero AggregateRating/Review markup; and Person markup can't earn stars anyway (§0.1). |
| Ranking/discovery | **1/10** | `applySort` = featured/recent/updated only; rating never sorts, never feeds search/matview; `skill_scope` stamped then **never read**. |

**Overall: ~3.5/10.** The DB is genuinely strong; the application layer wired to it is ~20% built. The flagship STANDING schema receives no data from any form. This is an excellent foundation wearing a v0.5 product.

---

## 2. Corrected phased plan

Order (per critique A4): **privacy hotfix → collection → engine → replies+slim display → ranking → moderation/analytics → hardening.** Each phase independently shippable; gate = `tsc + lint + db:push` clean + a stated QA proof.

### Phase 0 — Privacy + parity hotfix (DONE / in-flight this session)
- `private_note` column-privilege fix (§0.3) — **applied to prod + code rewritten**; ship the PR.
- Add the same integrity spine to **`client_reviews`** (currently infinite edits, no audit, no verified check): `published_at` + `trg_client_reviews_edit_guard` (48h + column guard, cloned from `20261110040000:120-173`) + moderation logging.
- Gate the ungated review surfaces: `ReviewsPage.tsx`, `profile-reviews.tsx`, faceone actions → add `tenantReviewsEnabled` (pattern from `client/reviews/page.tsx:41`).
- Decide + document **staff visibility of `private_note`** (the shared admin-shell `ReviewsPage` currently lets agency staff read it; either that's intended and the "only you see this" copy is wrong, or add a staff exclusion).

### Phase 1 — Capture the signal (Collection v2)
The #1 gap: the STANDING schema receives no data. Rebuild the submit UX to capture what the DB already models.
- `client/_components/LeaveReviewCard.tsx`: add would-book-again (yes/no), 4 attribute star-rows, trait chips, `private_note` textarea, `anon` checkbox; **editable-until countdown + read-only past 48h** (compute from `published_at`; surface hidden state too, per critique B3).
- `review-actions.ts:92-195` — extend `submitTalentReviewAction` payload + `loadReviewableBookingsAction` select (:236) to round-trip all fields + `published_at`/`locked_at`/`status`.
- fr clientNav catalog entry.
- **QA:** submit via UI → all columns non-null in `talent_reviews`; `would_book_again_pct` recomputes; 49h edit shows disabled UI, not a DB error.
- **Beats:** Airbnb's exact post-stay model (category ratings + WBA + anonymity + private feedback); Google/Yotpo have no private-coaching channel.

### Phase 2 — Collection engine (built ON the existing notification stack, per §0.2)
80% of B2B reviews come from follow-up; today we send nothing.
- Add **catalog entries + producers** in `lib/notifications/` for: review-request (faceone), review-received (talent), reminder (day 7, `reminded_at` exists; cap 2). Wire the `TODO(email)` at `review-request-actions.ts:113` through the dispatcher (respects `email_suppressions` + locale copy) — **not** a parallel send path.
- **New route `app/review/[token]/page.tsx`** — public single-use token landing → full STANDING form. Guest reality (critique A5): `talent_reviews.client_user_id` is `NOT NULL FK` → a true guest **cannot** be inserted; either a shadow/claim-profile flow or scope this to account-clients first. Guests that clear it show as **"Invited review"** (no verified badge) — honest by construction. Add `(booking_id, lower(invited_email))` anti-spam guard + token expiry (the `expired` status is set by nothing today).
- **QA:** close booking → email → token page → submit → review + talent notification; second visit = "already used".
- **Beats:** Yotpo's core loop; every invited review is booking-bound (Yotpo's are coupon-pollutable). Email-only by choice (§3).

### Phase 3 — Replies + slim display
Replies are needed *before* talent are notified of reviews they can't answer.
- **Reply write-path (critique A6):** new `submitReviewReplyAction` (service-role; enforces owner-of-profile, reply-once, whitelists `reply_body/reply_at/locked_at`, sets `locked_at` atomically — *nothing sets it today*). Decide the fairness rule: an instant reply currently cancels the client's 48h edit window.
- Render replies under each review ("Response from {talent}") in `TalentReviewsSection.tsx`.
- **Volume-gated display** (critique A4/B1): distribution bars + attribute mini-bars only render at ≥5 reviews; pagination/offset in `load-reviews.ts` (add `offset`) only matters past 12 — build but keep behind the floor.
- **QA:** talent replies once → renders publicly + review locks in client edit UI; histogram hidden at n<5.

### Phase 4 — Discovery & ranking
Make standing move bookings.
- `fetch-directory-page.ts:215-247` — "Top rated" sort using **Bayesian-smoothed** score (compute at fetch; ~hundreds of rows) — never raw avg at low n.
- Trust strip in `messages/admin-2.tsx:326` — thread `rating_avg/rating_count` onto the lineup row type; tier chip at the decision moment.
- Rollout (critique A7): **do not** flip the `show-standing` registry default; per-tenant token override once a tenant crosses a review-count floor.
- Split out "feed rating into hybrid/AI search" as its own eval-bearing project.
- **Beats:** skill-scoped honesty (once `skill_scope` display lands at ≥3-per-scope) — none of Airbnb/Google/Yotpo scope ratings to the skill actually bought.

### Phase 5 — Moderation ops + light analytics
- Reason codes on `adminHideReviewAction` → `review_moderation_events`; **first read** of that table + a reported-review queue.
- **Cheapest real signal (critique B2):** one platform-admin surface showing the public-vs-`rating_all_*` delta per talent (laundering detector) — the truth aggregate is currently written but never read.
- Replace the "dashboard" with 3 inline numbers (lifetime avg, WBA%, response rate). Skip outlier auto-flag until volume exists.

### Phase 6 — Hardening + beyond-benchmark
- **Stripe verified_paid** (blocked on Stripe): one-line change at `20261110040000:73` (`provider <> 'manual' AND provider_reference IS NOT NULL`) + backfill + recompute.
- Media/photo reviews — **authenticated reviewers only**, through existing media moderation (no anonymous upload on the token page).
- Optional: helpfulness votes, AI topic extraction feeding Growth notes.

---

## 3. Deliberately skipped (with rationale)

| Skip | Why |
|---|---|
| Coupon/incentivized reviews | FTC exposure + inflation; "real bookings, no incentives" is the differentiator. |
| LocalBusiness/Organization self-rating schema | Google policy violation (self-serving). |
| Review syndication | Not e-commerce; discovery is on our surfaces. |
| SMS channel | No phone consent, B2B lives in email, adds compliance surface. Revisit if email response <5%. |
| Importing external reviews (Google/LinkedIn) | Unverifiable provenance poisons the verified split. Testimonials table already covers legacy social proof. |
| AI-drafted client review text | Authenticity + Google spam risk. AI only on the talent's private Growth-notes side. |

---

## 4. Risks, dependencies & open decisions

1. **SEO reality (corrected):** no path to Google review stars via Person markup. Either invest in a Service/Offer page model (real project) or set the expectation to "valid schema + LLM comprehension, no SERP stars." Keep AggregateRating **off** tenant/org schema.
2. **Stripe** gates true `verified_paid`; until then a colluding staffer can mint `provider='manual'` paid txns. Interim: ops policy + Phase-5 delta surface.
3. **Guest identity** collides with `client_user_id NOT NULL FK` — Phase 2's token flow needs a shadow/claim-profile decision, not a bullet point.
4. **Cross-tenant / hub blending (unowned):** `recompute_summary` aggregates per `talent_profile_id` across all tenants; a profile shown under two tenants (hub referral lane) displays a rating partly earned elsewhere with no provenance. **Decide:** blended-and-labeled vs per-tenant display aggregates. (The user's "hubs/cross-tenant" mandate is otherwise unaddressed.)
5. **GDPR/erasure:** `ON DELETE CASCADE` handles profile-deletion aggregates, but no review data in exports, `review_requests.invited_email` has no retention policy, and the anonymize-vs-delete decision (Airbnb anonymizes) is unmade.
6. **Low-volume B2B:** distribution/attr bars are anti-trust at n<5; ranking must be Bayesian; `would_book_again_pct` NULL semantics (over non-null answers only) need UI copy.

---

## 5. Benchmark map (what each phase matches / beats)

- **Airbnb:** matched by Phase 1 (category ratings + WBA + anon + private feedback) and Phase 3 (distribution + owner response). Beaten by the verified-paid split (laundering-proof baseline) and skill-scoped honesty.
- **Yotpo:** matched by Phase 2 (automated post-transaction requests + reminders + in-context form) and Phase 5 (moderation + light analytics). Beaten on provenance (every invited review booking-bound, no coupon pollution).
- **Google:** matched by Phase 3 owner responses and Phase 4 rating-as-ranking-signal; the immutable moderation audit beats Google's opacity. **Not** matched on SERP review stars (§0.1 — structurally ineligible for this page type).
