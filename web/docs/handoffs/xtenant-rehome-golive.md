# Handoff: XTENANT_REHOME cross-tenant re-home go-live

> **First read `web/docs/handoffs/README.md` and memory `project_xtenant_rehome_golive.md` + `project_cross_tenant_network_audit_2026.md`.** This is a MONEY + tenant-isolation feature — be rigorous, verify everything, do not soften risk.

## Goal
Get the flag-gated cross-tenant **re-home** mechanism (`XTENANT_REHOME`, currently OFF) safely flippable in production, then flip it. Re-home solves finding **G7**: when a client contacts an exclusive talent through the platform HUB, the inquiry is filed under the hub tenant and the managing agency never sees it. With the flag on, `resolveInquiryHome` (`web/src/lib/inquiry/inquiry-rehome.ts`) files the inquiry under the managing agency instead (only when every talent resolves to exactly one managing agency ≠ host).

## What already exists (verified, PRs open, NOT merged)
- **#711 `fix/xtenant-rehome-golive`** — the go-live-safety fixes: the **P0 charge/payout coherence** fix (force platform charge for cross-channel re-homes so the platform-funded transfer fan-out isn't stranded — the current prod behavior IS a latent double-pay), the **attribution** fix (guest-chat stamps the true host as `source_workspace_id`), a **tenant-coherence write guard**, and a coordinator guard-var. Adversarially reviewed (0 P0/P1 survived).
- **#714 `fix/rehome-client-list-golive`** — client-side access: inquiry-list union so a client sees their re-homed inquiry in the hub portal, + mutation authz so they can act on it. Strict no-op while the flag is off.

Delivery + isolation + commission/payout DESTINATION were verified correct in the audit (they key off frozen `owning_party_id`, already the agency, not `tenant_id`). `HUB_REFERRAL_LANE` is a SEPARATE flag — keep it OFF for this release.

## The prerequisites to flip (ordered) — this is the job
1. **Merge #711 + #714** (owner-gated). If either includes no migration, no `db:push` needed (they're code-only). Confirm green.
2. **Discover→pay money QA (the load-bearing one).** #711's P0 fix predicate is `source_workspace_id !== tenant_id`, which ALSO fires today for the **live Discover fan-out** checkout (browsing host ≠ owning agency), not just re-home. Reviewers confirmed it's a *correct* fix of the same latent double-pay, but it IS a live-checkout behavior change. Before real traffic: run one real **Discover → request-payment → pay** flow in **Stripe test mode** and confirm the charge lands on the **platform** account (no `stripeAccount` header) and `executeBookingTransfers` funds talent+workspace without overdrawing the platform — OR confirm prod Discover checkout volume is ~0 (pre-launch it is). Files: `web/src/lib/server-actions/client-pipeline.ts` (`startInquiryCheckout`), `web/src/lib/payments/transfers.ts`, `web/src/lib/bookings/transactions.ts` (`markPaid`).
3. **Confirm a Stripe CONNECT webhook endpoint exists.** The handler (`web/src/lib/stripe/webhook-handler.ts`) verifies with the platform `STRIPE_WEBHOOK_SECRET` only and has no `event.account` branch. If any Direct-Charge path stays live, a Connect webhook (separate secret / Connect-scoped events) must be registered in the Stripe dashboard, or Direct-Charge settlements never mark the transaction paid. (Subsumed if step 2's platform-charge path fully covers it.) Not discoverable from code — confirm with the Stripe account owner.
4. **Confirm the target agencies.** Re-home only fires for `is_primary` exclusive talent on a paid plan: `plan_tier ∈ {studio, agency, network, hub-network}` (`EXCLUSIVE_PLAN_TIERS` in `web/src/lib/inquiry/owning-party-resolver.ts`), roster `is_primary=true`, `exclusivity_status` not in {declined, notice_period}. Query prod (Supabase MCP `pluhdapdnuiulvxmyspd`, read-only) to confirm the intended agencies qualify — else the flip closes nothing for them.
5. **Backfill migration (or accept orphans).** Re-home runs only at creation, so existing hub-filed exclusive-talent inquiries stay orphaned on the hub after the flip. Blast radius is tiny (~1 seed + a couple exclusive hub talents — verify with a count query). Write a one-shot migration that re-homes single-owner hub inquiries to their managing agency: rewrite `inquiries.tenant_id` AND every child row (`inquiry_participants`, `inquiry_requirement_groups`, `inquiry_messages`, `agency_client_relationships`) AND each exclusive-talent participant's `owning_party_id`, **preserving `source_workspace_id` as the hub**. Make it idempotent + transactional. **Do NOT auto-generate this from the re-home logic — hand-craft it against the exact orphan rows you identify, and get it reviewed; `db:push` to apply is owner-gated.** Given the tiny blast radius, "identify the ~1-3 rows and re-home them explicitly by id" is safer than a general SQL re-implementation of the resolver.
6. **Dev-test the flip end-to-end** (recipe below).
7. **Flip `XTENANT_REHOME=1` in the prod env** (Vercel env var), keep `HUB_REFERRAL_LANE=0`. Post-flip, run a monitoring query for split inquiries (any child row whose `tenant_id ≠ inquiries.tenant_id`) and for re-homed rows where `source_workspace_id == tenant_id` (should be none). Run `npm run deploy:smoke`.

## Dev-test recipe (flag off → on)
Spin the dev stack (README env): `PORT=3200 npm run dev:webpack` + proxies for `app.lvh.me`/`impronta.lvh.me`/`hub.lvh.me`. Use an exclusive-talent fixture (a talent with an `agency_talent_roster` row: `is_primary=true`, active exclusivity, agency on an EXCLUSIVE_PLAN_TIERS plan). Then:
- **Step 1 (flag off):** submit a hub inquiry about that talent; assert `inquiries.tenant_id == hub` and the managing agency's Work + Messages inboxes do NOT show it (reproduces G7).
- **Step 2 (flag on, `XTENANT_REHOME=1`):** submit the same shape; capture the new id.
- Assert **delivery**: managing agency's Work + Messages inboxes both show it; `tenant_id == agency`.
- Assert **isolation**: a DIFFERENT agency's staff and a non-super-admin hub staffer read 0 rows (query as those users against RLS). This is the load-bearing isolation check — run it against the DB with RLS on, not just static analysis.
- Assert **coordinator**: the managing agency's coordinator (not the hub's) is assigned + notified.
- Assert **attribution**: `source_workspace_id == hub` (distinct from `tenant_id == agency`).
- Assert **client**: the client sees the inquiry in their hub-portal list (#714 union) and can reply (#714 mutation authz); `/c/[inquiryId]` still resolves.
- Assert **money**: a re-homed booking charges on the platform account and pays talent exactly once (no double-pay); commission/payout target the agency (owning_party).
- Assert **coherence**: every child row's `tenant_id == inquiries.tenant_id == agency`.
- Assert **flag-off no-op**: unset the flag, re-run Step 1, confirm byte-identical host-filed behavior; `node --test web/src/lib/inquiry/inquiry-rehome.test.ts` passes.

## Definition of done
Prereqs 1-5 satisfied (or explicitly accepted), dev-test green, flag flipped in prod with `HUB_REFERRAL_LANE=0`, monitoring queries clean, `deploy:smoke` green. Do NOT flip both flags in one release.
