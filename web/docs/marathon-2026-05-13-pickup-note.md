# Marathon 2026-05-13 — what shipped, what's next

**Branch:** `phase-1`
**Commits in this marathon:** `3fb17464` (PR 1 primitive) · `7bb20fc2` (dedup fix) · `aeb006db` (PR 4 client surface)
**Net diff:** +2,290 / −116 LOC across 14 files.

## What shipped

### PR 1 — `<ReservationThread>` primitive
`web/src/components/reservation-thread/` — a 10-file module that's the single layout primitive every POV will eventually render through.

Files:
- `types.ts` — POV / pill / sheet / action-pill contracts
- `tokens.ts` — per-POV palette (admin gold, talent sage, client blue) + shared geometry
- `Pill.tsx` — strip + action variants
- `QuickStrip.tsx` — horizontal pill row with mobile scroll
- `Sheet.tsx` — desktop right-drawer + mobile bottom-sheet, Esc-to-close
- `SheetHost.tsx` — manages open-pill state
- `ActionRow.tsx` — composer-area action pills with pending state
- `Header.tsx` — 40px header with stage strip + optional ⋯ move-to menu
- `ReservationThread.tsx` — top-level shell composing all the above
- `index.ts` — public API barrel

### PR 4 — Client reservation surface (THE business-value unlock)
Three files:
- `adapters/ClientThreadAdapter.tsx` — client POV through the primitive: pills with real status, sheets with real content (lineup, offer with line items + notes, event recap, files), action row with **Approve / Decline / Counter** when offer is awaiting.
- `client/inquiries/[id]/page.tsx` — full RSC load (lineup from `inquiry_participants`, offer from `inquiry_offers`+`inquiry_offer_line_items`, files from `inquiry_attachments` filtered to `visibility='shared'`), passes to the adapter.
- `client/inquiries/[id]/actions.ts` — three new server actions:
  - `clientApproveOfferAction` — wraps `clientAcceptOffer` engine call.
  - `clientDeclineOfferAction` — wraps `clientRejectOffer` with optional reason.
  - `clientCounterOfferAction` — sends a `[Counter request]` tagged message for v1 (structured counter deferred).

### Bonus: restored `loadWorkspaceCoordinatorCandidates` / `reassignCoordinatorAction`
Another agent's rewrite of `_pipeline-actions.ts` had silently dropped my A5 exports from the previous session — the cherry-pick of PR 1 surfaced this. Phase-1's version of the file already had them; the dedup commit (`7bb20fc2`) reconciled.

## What deliberately did NOT ship — and why

### PR 2 — Admin re-skin onto the primitive
**Deferred.** The admin `messages.tsx` is 14,448 LOC with 30+ inline POV branches. Re-skinning it cleanly inside the remaining context window of one marathon would have meant either:
- Shipping a half-finished refactor with stubs (high regression risk on a working surface), or
- Building it as a flagged-off parallel path that nobody can review in one PR (which is what the audit doc proposed).

Both are worse than waiting. Admin works today; the audit + the primitive are sufficient prep for the next marathon to do this in one focused session.

### PR 3 — Talent re-skin onto the primitive
**Deferred for the same reason.** Talent shares a lot of admin's monolith. Once PR 2 lands the admin re-skin pattern, PR 3 is mostly a clone with smaller pills + an `Accept / Hold / Decline` action row.

### Anything in Phases B–G
Per the 2026 execution plan, those need operational work (Stripe Connect KYC, DNS, banking, legal review) outside my reach. Not started.

## What's broken / known issues

1. **`messages.tsx` lint warnings** — 4 pre-existing `react-compiler/preserve-manual-memoization` errors at lines 7892, 10649, 10851, 12491. Not introduced by this marathon. CLAUDE.md says TS is the gate; lint is informational.
2. **Realtime on client offer status** — when the agency sends a new offer or the client approves, the page only updates on next navigation. No `inquiry_offers` realtime channel yet. Tighten in a follow-up.
3. **Counter dialog UX** — currently a `confirm()` + `prompt()` for decline reason and a small in-adapter dialog for counter. The audit envisaged the action row pills opening proper sheets; the dialogs are a v1 shortcut. Worth upgrading to in-adapter sheets in PR 2/3 of the next marathon when the pattern is unified.
4. **Active offer = sent/accepted only** — the client page query filters `inquiry_offers` to `status IN (sent, accepted)`. Drafts (admin-internal) and rejected/expired/superseded are invisible to the client, which is correct. But if an offer was approved and then needs to be re-issued (counter loop), the new draft won't surface until it's sent. That's the engine behavior, not a bug — flagging for awareness.
5. **`public_role` field** — initially the adapter asked for `talent_profiles.public_role`, which doesn't exist. Left as `null` for now; future PR can derive a "what they do" from the `talent_profile_taxonomy` join (model / dancer / mc / etc.) for the client lineup card.

## Next marathon — recommended order

### Top of stack: PR 2 — admin re-skin
- Add `?rt=1` feature flag check in admin messages
- Build `AdminThreadAdapter` modeled after `ClientThreadAdapter`:
  - Lineup sheet wraps existing `LiveLineupPanel` (already DB-backed)
  - Offer sheet wraps existing offer-tab content (or rewrites it cleanly)
  - Event sheet wraps the existing `DetailSection` cards
  - Files sheet wraps existing files-tab list
  - Team sheet — admin-only — wraps `ReassignCoordinatorSheet` + coordinator card
- Default the flag ON for new sessions after a week of internal QA. Delete the old code after another week.
- Expected diff: −2,000 to −3,000 LOC from `messages.tsx`.

### Then: PR 3 — talent re-skin
- `TalentThreadAdapter` — drop the `Team` pill, add `Accept / Hold / Decline` action row when stage is inquiry and the talent hasn't answered.
- Add system-event chips in the stream (talent's missing-timeline problem from the audit).

### Then: Phase B — Money v1
This is the next business-value chunk. Stripe Connect onboarding for workspaces (Standard accounts) + talent (Express). Approve-an-offer = pay = booked. Hold deposit configurable per workspace. Payout dashboards for workspace + talent. Per the execution plan §5 Phase B.

Heads-up: phase B needs YOU to do the real-world ops:
- Create the Stripe Connect platform application
- Set the live publishable + secret keys in Vercel env vars
- Configure webhooks to `https://app.tulala.digital/api/stripe/webhook`
- KYC the platform legal entity
- Set up the Stripe Tax integration

Without those, the code can ship but cannot transact.

## Cross-references

- `web/docs/tulala-2026-execution-plan.md` — overall plan (THIS marathon delivered Phase A PR 1 + PR 4 / Phase C)
- `web/docs/messages-consolidation-audit-2026-05-13.md` — the design audit that PR 1 + PR 4 implement
- `web/docs/inquiry-booking-improvement-plan-2026-05-12.md` — A2/A3/A4 now superseded by PR 4
- `~/.claude/projects/.../memory/project_tulala_2026_execution_plan.md` — memory pointer to the plan

## How to QA what shipped

1. `cd web && rm -rf .next && npm run dev` (Turbopack cache must be cleared — the prior cache panic'd this session).
2. Sign in as `qa-client-1@impronta.test` / `Impronta-QA-Client-2026!`.
3. Navigate to any inquiry from the Today page.
4. Expected: thread shows header with stage strip, four pills (Lineup, Offer, Event, Files), real content in each sheet on tap.
5. For an inquiry with a `sent` offer: action row appears above the composer with **Approve offer** (primary) / **Counter** / **Decline** (soft red).
6. Approve → server action runs → page re-renders with stage moved to "Booked" or the appropriate next state. (Engine may also require the talent-side approval depending on `inquiry_approvals` rules.)
7. Decline → confirm + reason prompt → server action runs → stage moves to closed.
8. Counter → opens dialog → message goes into the thread tagged `[Counter request]`.

If anything 404s or 500s, check the dev-server log for migration/RLS errors first — phase-1 has migrations applied to cloud; localhost middleware also routes via `host-context.ts` dev-fallback to `kind: "app"`.

---

That's the marathon. Next session picks up at "PR 2 admin re-skin" with a clean phase-1 baseline.
