# Cross-tenant Tulala network — execution plan to make the flow perfect

**Date:** 2026-06-27
**Status:** BINDING plan, awaiting owner go on the one open sub-decision (§9, the referral source). Audit it implements: [`cross-tenant-network-inquiry-audit-2026-06-27.md`](./cross-tenant-network-inquiry-audit-2026-06-27.md).
**Sensitivity:** touches the money + coordination spine. Every commission change is gated behind characterization tests + a feature flag + live-QA. `inquiry-permissions.ts` is **not** touched.

---

## 1. Decision log (owner, 2026-06-27)

| # | Decision | Chosen | Consequence for this plan |
|---|---|---|---|
| D1 | Record home for a hub-sourced exclusive lead | **My call + a hard rule: never funnel a lead/booking without knowing its channel.** | **Re-home the inquiry/booking to the managing agency at submit**, with the originating channel preserved on every record (see D-invariant). |
| D2 | Does the originating hub earn? | **Add a hub referral lane** | New 4th commission lane (channel/referral), configured per originating workspace, **defaults to 0** so first-party Tulala behavior is unchanged until switched on. Becomes core Phase C, not optional. |
| D4 | Client Discover "Pro" tier | **Make it real (enforce + Stripe)** | Phase D: server-side Pro enforcement + Stripe client-subscription checkout/webhook. |

**The D-invariant (your non-negotiable, now load-bearing):**
> No inquiry and no booking may exist without a recorded **channel** = `(source_channel, source_workspace_id, origin_domain)`. The originating workspace (`source_workspace_id`) is captured **distinctly** from the managing tenant (`tenant_id`) and carried immutably onto the booking and the commission snapshot. A channel-less record is a hard error, monitored and alerted.

This invariant is what makes the referral lane payable and the funnel reportable. It is enforced in code (guard), in schema (NOT NULL after backfill), and in monitoring.

---

## 2. Target architecture (what "perfect" looks like)

```
   CLIENT on tulala.digital  ──▶  talent "More" (exclusive to improntamodels)
                                        │
                    submitInquiry resolves owning party = ('agency', improntamodels)   [already correct]
                                        │
        ┌───────────────────────────────┴────────────────────────────────┐
        │  RE-HOME at submit (single owner):                              │
        │    inquiries.tenant_id      = improntamodels   ◀── managing      │
        │    source_workspace_id      = tulala (hub)     ◀── channel       │
        │    origin_domain            = tulala.digital                     │
        │    source_channel           = public_talent_profile             │
        └───────────────────────────────┬────────────────────────────────┘
                                        ▼
   ✓ Agency Messages + Work inbox show it (loaders key off tenant_id = agency)
   ✓ RLS is_staff_of_tenant(agency) grants it — no spine surgery
   ✓ Coordinator of record = agency's coordinator
   ✓ Booking homes on the agency; checkout charge + payout on the agency's Connect
   ✓ Commission = platform 5% + HUB REFERRAL x% (→ tulala) + agency margin + talent net
   ✓ Hub sees its sourced leads in a CHANNEL report (not its inbox) + earns the referral
```

Two tenants, cleanly separated and both always known: **managing** (`tenant_id`) and **channel** (`source_workspace_id`). Mixed-agency single inquiries (rare; only outside the Discover fan-out, which already splits per agency) fall back to a lightweight owning-party inbox overlay — deferred to Phase F, not on the critical path.

---

## 3. Phases & critical path

```
Phase 0  Safety net + drift fix      ──┐ (gates all commission work)
Phase A  Channel attribution invariant ─┼──▶ Phase B  Re-home + delivery ──▶ Phase C  Referral lane + charge routing
                                        │                                   
Phase D  Client Pro tier (parallel after A) ───────────────────────────────┘
Phase F  Hardening + mixed-agency overlay + cleanup  (last)
```

Critical path: **0 → A → B → C**. D runs in parallel once A lands. F is cleanup.

Each phase is independently shippable to `main`, behind a flag where it changes money or routing behavior. One migration timestamp per agent (`date -u +%Y%m%d%H%M%S`); `npm run db:push` before every merge; `tsc --noEmit && npm run lint` gate; `deploy:smoke` after each deploy.

---

## 4. Phase 0 — Safety net + drift fix (do this first, low risk, high value)

*Closes G15. De-risks every later commission edit.*

| Task | What | Files / artifacts |
|---|---|---|
| 0.1 | **Re-commit the live per-participant commission RPC as a versioned migration** so a `db reset` reproduces prod (today it would reinstall the broken single-tenant body). Body = current live `engine_load_commission_context` (verified per-participant). | new migration `> 20260926000000`, e.g. `2026MMDD…_recommit_per_participant_commission_context.sql`; apply via `db:push` |
| 0.2 | **Realign the integration test to the live shape** (it currently asserts the reverted singleton shape, masking drift). | `web/src/lib/billing/commission-pipeline.integration.test.ts:400-420` |
| 0.3 | **Characterization tests** that pin today's commission outputs for the 4 canonical cases (independent talent / workspace-owned / exclusive same-tenant / exclusive cross-tenant). These are the regression net for Phases A & C. | new `web/src/lib/billing/commission-characterization.test.ts` |
| 0.4 | **Snapshot/channel orphan monitor**: a query + log alert for any booking with no commission snapshot, or any inquiry/booking with a null channel. | `web/src/lib/billing/` observability + a `deploy:smoke` probe |

**Exit gate:** `tsc`+`lint` green; characterization tests green against current prod behavior; a fresh `supabase db reset` locally produces a per-participant RPC.

---

## 5. Phase A — Channel attribution as a hard invariant (the foundation)

*Closes G9. Prerequisite for B (preserve channel through re-home) and C (referral needs the channel).*

| Task | What | Files |
|---|---|---|
| A.1 | **Resolve the channel at the edge.** When the host is a hub, set `source_workspace_id = <hub tenant_id>` (distinct from the managing `tenant_id`) and `origin_domain = <host>`. For storefronts, `source_workspace_id = <that storefront tenant>`. | `web/src/lib/saas/scope.ts:440-468` (`getPublicHostContext`), intent adapter `web/src/lib/inquiry/inquiry-intent.ts` |
| A.2 | **Write channel on every submit path** — guest chat, directory, /t/ profile launcher, Discover, instant-book, pitch, admin-created. Each names its `source_channel` + `source_workspace_id` + `origin_domain`. | `inquiry-engine-submit.ts:352-394` and each caller (`guest-chat-actions.ts`, `api/discover/inquiry/route.ts`, `instant-book-engine.ts`, `pitch-engine.ts`, `admin-inquiries.ts`) |
| A.3 | **Guard: reject channel-less inserts.** `submitInquiry`/`createInquiryFromIntent` throw if `source_channel` or `source_workspace_id` is missing. Backfill existing 48 rows, then add `NOT NULL` on `source_channel` + `source_workspace_id`. | `inquiry-engine-submit.ts`, new migration (backfill + NOT NULL) |
| A.4 | **Carry channel onto the booking.** `engine_convert_to_booking` copies `source_channel`, `source_workspace_id`, `origin_domain` onto `agency_bookings`. | new migration (RPC edit + columns on `agency_bookings`) |
| A.5 | **Carry channel onto the commission snapshot** (so the referral lane and revenue reports read it from one immutable row). | `booking_commission_snapshot` columns + `persistBookingCommissionSnapshot` |
| A.6 | **Channel report** — revenue + leads + bookings sliced by `source_workspace_id` / `source_channel`. This is how the hub "sees" the leads it funnels (replacing inbox visibility for the channel). | `web/src/lib/billing/` aggregations; a `/admin` channel-performance view (extend `discover-performance`) |

**Exit gate:** every new inquiry carries a distinct channel; a hub-sourced inquiry has `source_workspace_id != tenant_id`; the channel survives onto booking + snapshot; the report shows leads/revenue by channel; characterization tests still green.

---

## 6. Phase B — Re-home + delivery (fixes the headline P0)

*Closes G7, G8 (record home), G10. Behind flag `XTENANT_REHOME`.*

| Task | What | Files |
|---|---|---|
| B.1 | **Re-home single-owner inquiries at submit.** After owning-party resolution, if all talents resolve to ONE managing tenant and it differs from the host, set `inquiries.tenant_id = <managing tenant>`. Channel stays on `source_workspace_id` (Phase A). Flag-gated. | `inquiry-engine-submit.ts` (post `resolveOwningPartiesForTalents`, before insert at :355) |
| B.2 | **Coordinator of record = agency.** Make `seedOwningAgencyCoordinators` promote the agency coordinator to `inquiries.coordinator_id` for a re-homed exclusive lead even if a hub pre-seed exists. | `coordinator-assignment.ts:169-220` (the `.is("coordinator_id", null)` guard at :212) |
| B.3 | **Booking homes on the agency** automatically (booking inherits `inquiries.tenant_id`, now the agency). Verify `engine_convert_to_booking` needs no extra change once B.1 lands. | `engine_convert_to_booking` |
| B.4 | **Verify inbox + RLS** now deliver: agency Messages + Work show the lead; `is_staff_of_tenant(agency)` grants it; the hub no longer carries it in its inbox (by design — hub uses the channel report). | `inquiries-messages.ts`, `inquiries-workspace.ts` (no change expected — that's the point) |
| B.5 | **Cross-role live-QA** on a real host: hub guest inquiry → exclusive talent → appears in the agency's inbox with the agency coordinator, channel pill "via tulala.digital", client sees one thread. | manual QA on `tulala.digital` / `improntamodels.com` |

**Exit gate:** the seed cross-tenant inquiry (and a fresh test one) appears in the managing agency's inbox, coordinated by the agency, channel attributed. Flag flip is the only behavior change; off = today's behavior.

---

## 7. Phase C — Hub referral lane + cross-tenant charge routing

*Closes G8 (charge), G11. Behind flag `HUB_REFERRAL_LANE`. Gated by Phase 0 characterization tests + owner sign-off on §9.*

| Task | What | Files |
|---|---|---|
| C.1 | **Schema: referral config + lane.** Per-originating-workspace referral rate (`hub_referral_bps`, default 0), e.g. `workspace_channel_referral_config` keyed by `source_workspace_id`; add `channel_referral_cents` + `channel_referral_party_id` to `booking_commission_snapshot`. | new migration (one timestamp) |
| C.2 | **Resolver: 4th lane.** Extend `resolveBookingCommissions` to compute the referral slice from the configured rate on `source_workspace_id`, deducted from the chosen source (see §9), with the same lanes-sum-to-gross invariant. Pure, test-first. | `web/src/lib/billing/commission.ts` |
| C.3 | **Load context** passes the referral config + `source_workspace_id` to the resolver. | `engine_load_commission_context` (the recommitted RPC from 0.1) |
| C.4 | **Payout: referral transfer.** Fan out a transfer of `channel_referral_cents` to the originating hub's Connect account, alongside talent + agency legs. | `web/src/lib/payments/transfers.ts:194-319` |
| C.5 | **Checkout destination → managing agency.** Resolve the Direct Charge destination + `application_fee_amount` from the **managing** tenant (now the booking's `tenant_id` after re-home), not the host/hub. Verify the hub is never a charge destination. | `web/src/lib/server-actions/client-pipeline.ts:245-253`, `stripe-connect.ts` |
| C.6 | **Offer drafter + transparency.** Show the referral slice in the offer breakdown (agency + talent + client surfaces per the commission-model UI contract). | offer composer + offer sheets |
| C.7 | **Reporting.** Referral earned per hub, in the Phase A channel report. | billing aggregations |

**Exit gate:** with `hub_referral_bps = 0` (default) there is **zero** economic change vs today (safe to ship dark). With a test rate set, a hub-sourced exclusive booking splits platform 5% / hub referral x% / agency margin / talent net, lanes sum to gross, and the referral pays the hub's Connect account on the test rail. Characterization tests for the 0-rate case stay green.

---

## 8. Phase D — Client Pro tier (parallel after A)

*Closes G12, G13, G14. Independent of B/C except shared touch on the Discover route — coordinate the merge.*

| Task | What | Files |
|---|---|---|
| D.1 | **Server-enforce Pro.** Multi-talent send + compare require `canUsePro(client)` in the API; return 402 otherwise. Remove the client-side `alert()` pretense. | `web/src/app/api/discover/inquiry/route.ts`, `ShortlistsShell.tsx:270`, `DiscoverShell` props |
| D.2 | **Stripe client-subscription checkout + webhook** that writes `client_subscriptions` (today: `mailto:` + a table nothing writes). | new `web/src/app/api/discover/subscriptions/*`, webhook handler, `client/subscription/page.tsx` |
| D.3 | **Trust-access gate** (your call to confirm): pass the client's real `client_trust_state` into the submit gate instead of `null`; decide whether unverified clients can inquire. | `api/discover/inquiry/route.ts:195`, `inquiry-engine-submit.ts:266-292` |
| D.4 | **No-roster talent path**: stop skipping independent talents in the fan-out; route to the talent-direct inbox. | `api/discover/inquiry/route.ts:130-131` |

**Exit gate:** a free client cannot multi-send via direct POST; a Pro upgrade flows through Stripe and unlocks it; trust gate behaves per the confirmed rule.

---

## 9. The one open sub-decision (confirm before Phase C build)

The referral lane needs to know **where the hub's cut comes from**. Three options:

| Option | Who pays the hub referral | When it fits |
|---|---|---|
| **A — out of the agency margin (recommended default)** | The managing agency pays the channel a lead-gen fee from its own margin. Talent net + platform fee + client price unchanged. | Classic referral/lead-gen economics; the agency benefits from the managed booking and pays for the lead. |
| B — out of the platform fee | Tulala shares its 5% with the originating hub. | When hubs are first-party and you just want to attribute, not add cost. (For the first-party Tulala hub this is circular — net zero.) |
| C — on top of gross | The client pays more. | Rare; risks pricing transparency. Not recommended. |

**Recommendation: A**, configurable per hub, default rate 0. Confirm A/B/C and I'll lock the resolver math in C.2. (Everything else in the plan is decided.)

---

## 10. What we are explicitly NOT doing (scope guard)

- Not touching `inquiry-permissions.ts` (per the message-impronta plan + the audit caution).
- Not building the owning-party **inbox overlay** for mixed-agency single inquiries now — re-home covers the real cases; the overlay is Phase F, only if a genuine multi-agency single inquiry appears.
- Not changing the exclusivity invariant (it's DB-enforced and correct).
- Not migrating historical bookings' economics — referral applies forward, flag-gated.

---

## 11. Rollout & safety

1. **Phase 0 first** — drift fix + characterization net before any behavior change.
2. **Flags:** `XTENANT_REHOME` (Phase B), `HUB_REFERRAL_LANE` (Phase C). Both default OFF; dark-launch, live-QA on a seeded host, then flip.
3. **Migrations:** one timestamp per agent; `npm run db:push` before merge; `deploy:smoke` (incl. migration-drift) after each deploy.
4. **Money changes** ship with the referral rate at **0** so there is no economic change until you explicitly set a rate per hub.
5. **Live-QA on a real host** at each phase exit (preview URLs 404 on tenant hosts — promote or alias to a seeded host).

---

## 12. Honest sizing & sequencing

| Phase | Relative size | Risk | Ships behind flag? |
|---|---|---|---|
| 0 — safety net + drift | S | Low | n/a |
| A — channel invariant | M | Low-Med (additive) | partial (guard last) |
| B — re-home + delivery | M | **Med** (routing change) | yes (`XTENANT_REHOME`) |
| C — referral lane + charge | L | **Med-High** (money) | yes (`HUB_REFERRAL_LANE`, 0-default) |
| D — client Pro tier | M | Low-Med | yes (Stripe live keys) |
| F — hardening/overlay/cleanup | S-M | Low | n/a |

Roughly 2–3 focused weeks end-to-end; the headline P0 (the agency actually seeing its leads) is fixed at the end of **Phase B**, i.e. early. Channel tracking — your non-negotiable — is real at the end of **Phase A**.

---

*This plan is binding once §9 is confirmed. Recommended start: Phase 0 (drift fix + characterization tests) — it's low-risk, closes a latent landmine, and is the safety net for everything after. Say go and I'll start there.*
