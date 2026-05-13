# Marathon 2026-05-13 — final close

**Branch:** `phase-1`
**Status:** Every open code-only item from the improvement plan is now closed.

## What just shipped (closing the last two)

| Commit | Item | What |
|--------|------|------|
| `0f440f10` | **A7 — Admin triage queue** | Pinned "Triage" filter chip on the inbox. Scope: coordinator-action-needed inquiries in {inquiry, hold} bucket. Sort: oldest activity first (SLA pressure on top). Inverts the default recency tier so the admin sees backlog, not freshest threads. Reuses existing bulk-action toolbar; only shown when triageCount > 0. |
| `dc1e9b27` | **B2 — Call sheet editor** | End-to-end: migration adds `call_sheet_payload JSONB` on `agency_bookings`; lib helpers for load/save/clear + JSON normalization; full structured form at `/admin/bookings/<id>/call-sheet` with schedule, venue, per-talent rows, contacts, notes, sticky save bar. Applied to cloud. |

## Full improvement-plan scorecard — every item accounted for

### Sprint 0 (live-test P0s — earlier sessions)
- ✅ S0.1, S0.2, S0.4, S0.6, S0.7

### A-series
| | Item | Status |
|---|---|---|
| A1 | Admin manual inquiry emits engine event | ✅ Shipped |
| A2 / A3 / A4 | Client offer surface | ✅ Shipped as Phase A PR 4 |
| A5 | Reassign Coordinator wired | ✅ Shipped |
| A6 | Admin Add/Remove/Swap dead buttons | ✅ Verified false flag |
| A7 | Admin triage queue | ✅ **Just shipped** |
| A8 | revalidatePath on offer mutations | ✅ Shipped |
| A9 | Bell on real `user_notifications` | ✅ Shipped |

### B-series
| | Item | Status |
|---|---|---|
| B1 | Talent holds engine + actions | ✅ Shipped |
| B2 | Call sheet editor | ✅ **Just shipped** |
| B3 | Booking cancel + reschedule | ✅ Shipped |
| B4 | Booking close (wrap) | ✅ Shipped |
| B5 | Stripe automation | ⏸ Needs Stripe Connect ops |
| B6 | duplicateBooking UI | ✅ Already wired (verified) |
| B7 | Talent counter-rate action | ✅ Shipped |
| B8 | Inquiry-received email | ⏸ Needs RESEND_API_KEY |
| B9 | Notification prefs UI | ✅ Already shipped (verified) |
| B10 | Realtime refresh on client thread | ✅ Shipped |

### C-series
| | Item | Status |
|---|---|---|
| C1 | Dead-chrome sweep | ✅ Shipped |
| C2 | "Demo" badges on mock data | ✅ Earlier session |
| C3 | Silent load-failures toast | ✅ Shipped |
| C4 | Accept/Decline double-submit guards | ✅ Shipped |
| C5 | Rate-limit retry-after copy | ✅ Shipped |
| C6 | A11y on ReservationThread | ✅ Shipped |
| C7 | Mobile polish on sheets | ✅ Shipped |
| C8 | Talent thread deep-link | ✅ Shipped |
| C9 | Loading skeletons | ✅ Shipped |

**Open from the audit: 2 items, both ops-blocked (Stripe / email infra).**

## Phase scorecard

| Phase | Status |
|-------|--------|
| **A — Thread** | ✅ Complete |
| **B — Money** | 🟡 Foundation + commission engine done; **Stripe Connect ops still required** |
| **C — Client Surface** | ✅ Complete (shipped as Phase A PR 4) |
| **D — Trust** | ⏸ Blocked on Stripe Identity |
| **E — The Page** | ⏸ Partial — talent surface polish pure-code-doable |
| **F — Hybrid + Network** | ⏸ Mandatory focused Opus-high session |
| **G — Discovery + Embeds** | ✅ Complete |

## What truly requires YOU now

Only three operational items:

1. **Stripe Connect platform application** (unblocks Phase B PR 3+, Phase D)
2. **RESEND_API_KEY in production env vars** (unblocks B8 confirmation emails)
3. **Phase F kickoff** if you want hybrid talent×workspace mode (Opus-high focused session)

## How to QA B2 (the call sheet editor)

1. Sign in as `qa-admin@impronta.test` / `Impronta-QA-Admin-2026!`
2. Find any confirmed booking on `/impronta/admin/bookings`
3. Directly navigate to `/impronta/admin/bookings/<booking-id>/call-sheet`
4. Fill schedule + venue, add a talent row + contact, save
5. Refresh → values persist (and "last saved" timestamp shows)
6. Try "Clear call sheet" → form resets, DB columns nulled

## How to QA A7 (the triage filter)

1. Sign in as admin
2. Open `/impronta/admin/messages`
3. Look for the new "★ Triage (N)" chip among the filter chips
4. Click it → only coordinator-action-needed inquiries in inquiry/hold
   stage shown, sorted by oldest activity first

## The complete marathon trail

Counting all three legs of this session:
- **30+ commits** to `phase-1`
- **5 new docs** (commission model, audit, plan, three pickup notes)
- **6 new migrations** applied to cloud
- **Two new feature surfaces** built from scratch (call sheet editor, embed widget)
- **Three Phase A PRs** of the messages-consolidation audit landed
- **Phase G fully complete** (SEO + embed + pitch plan-gate)
- **Phase B foundation** (commission spec + 5-table schema + resolver + engine wiring)
- **Every code-only audit item** from the inquiry-booking improvement plan closed

The branch is in the cleanest, most-feature-complete shape it has been all marathon. Hand me the Stripe keys and Phase B PR 3 closes the money loop; otherwise, the next natural chunk is Phase F (Hybrid + Network) with a focused Opus-high session.
