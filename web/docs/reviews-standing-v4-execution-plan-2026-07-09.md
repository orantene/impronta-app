# STANDING v4 — audit-fix execution plan (2026-07-09)

Source: the 10-item Chrome click-through audit (this session). Mode: **autonomous, no-stop** —
parallel agent lanes on disjoint files, one orchestrator gate, one PR, deploy, prod smoke.
Branch: `feat/reviews-standing-v4` off `origin/main` in worktree `/Users/oranpersonal/Desktop/impronta-reviews`.

## Lanes (parallel, file-disjoint)

| Lane | Audit item | Scope | Files (owned exclusively) | Model |
|---|---|---|---|---|
| A | 1 Moderation entry | Bell click honors `targetDrawer` (opens `reviews-moderation`); add a durable "Reported reviews" entry in the admin shell | `admin-shell-notification-bell.tsx`, one shell entry-point file | sonnet |
| B | 2 Top-rated sort | Add "Top rated" to the directory sort control + reflect `?sort=top_rated` state; only when tenant reviews-entitled | `directory-results-toolbar.tsx`, `directory-ui-copy.ts`, `messages/*.json` (sort key ONLY, surgical Edit) | sonnet |
| C | 3 Card standing ON | Flip `directory.card.show-standing` default → on; verify/extend grid `<TalentCard>` renders standing (credibility-floor + entitlement stay authoritative) | `site-admin/tokens/registry.ts` (+ resolve/presets), `TalentCard`/list-row render | sonnet |
| D | 4 Hero rating chip | "★ 5.0 · 5 reviews" chip near the name on all 4 profile layouts, anchor-scrolls to reviews; entitled + floor-gated | `_noir/_light/_lumen/_atelier` layouts, `t/[profileCode]/page.tsx` (thread summary) | opus |
| E | 5 Demo reseed | Named reviewers + attr stars + 1 review photo on More | prod SQL via MCP | orchestrator |
| F | 6 Dead counter | Migration: trigger maintains `talent_profiles.total_completed_bookings` on booking completion + backfill (file only; orchestrator applies) | new migration `20261110130000_*.sql`, optional `closeBookingAction` note | sonnet |
| G | 7 Occlusion | Favorites cluster + chat launcher no longer cover profile content at narrow width | `_chat/TalentProfileChatLauncher.tsx` + cluster component (NOT the layouts) | sonnet |
| H | 8+9 i18n + bars | Localize review surfaces (public section, forms, talent page) en/es/fr; tier labels via key map (craft-standing stays pure); hide zero-count distribution rows at n<10 | `TalentReviewsSection.tsx`, `ReviewsShowMore.tsx`, `LeaveReviewCard.tsx`, `ReviewTokenForm.tsx`, `ReviewsPage.tsx`+`ReviewsAskForReviewCard.tsx`, `messages/*.json` (reviews keys, surgical Edit) | opus |
| J | 10 Dev-signin host | `next=` redirect preserves the request host (no more localhost bounce) | `api/dev/signin/route.ts` | haiku |

Agent rules: work ONLY in the worktree; own files exclusively (a needed cross-lane edit → report, don't touch);
NO git / tsc / dev-server / migrations-apply; surgical `Edit` on shared JSON; match repo ratchets
(no new inline styles under admin shell, no em dashes in copy, 800-line file cap).

## Orchestrator phases (after lanes return)
1. Apply lane-F migration via Supabase MCP + reconcile `schema_migrations` version.
2. Gate: `tsc --noEmit` (8GB), `eslint` changed files, `test:reviews`, `test:notifications`; fix fallout.
3. Chrome click-through of all 10 items on `dev:webpack` (bell→drawer, sort dropdown, cards, hero chip, demo richness, occlusion, es locale, signin redirect).
4. Commit → PR → squash-merge → `deploy:smoke` → prod spot-check → memory update.

Definition of done: all 10 verified in a real browser, merged, smoke green.
