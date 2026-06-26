# Jon's Inquiry 360 — CRO + Trust + Craft Plan

Status: PLAN (binding once owner signs off). Not started.
Date: 2026-06-26
Builds directly on the shipped unified Message Impronta feature (`web/docs/message-impronta-inquiry-sync-plan-2026-06-24.md`). Extends it; does not fork it.

---

## 1. The vision — Jon always has a frictionless next step, feels in control, and loves the site

Jon is a client (never a "buyer"). He lands, browses talent, and at every single moment there is one obvious, low-commitment next step. He never wonders "did that save?", "is the agency already reading my half-finished mess?", "did it send?", "who has it now?", or "whose move is it?". The product answers each of those silent questions before he has to ask.

The feeling we are building, in one line: **a private workspace where Jon assembles a strong inquiry at his own pace, a deliberate handoff where he crosses a clear line and presses Send, and an immediate, human "we've got it, Maria is on it" beat that turns his peak anxiety into peak trust.**

Three things make Jon love it: it never loses his work, it never exposes his work before he's ready, and after he sends he always knows who has it and what happens next.

### The governing principle

**Before SEND, nothing is ever lost and nothing is ever exposed. At SEND, the clock starts and a human appears. After SEND, Jon always knows who has it and what comes next.** Every decision in this plan resolves back to that sentence.

Sub-rules, non-negotiable:
- **Never block the happy path.** One-tap add, never a modal in the way.
- **Never destroy.** Starting a separate inquiry parks the current one; it never overwrites. Removal is reversible (undo), never a silent drop.
- **Honest only.** Real reply-time data, real coordinator names/faces, real imagery. No fake "online now", no fake scarcity, no placeholder boxes.

### The agreed mental model (four nouns)

| Noun | What it is | Store today (unchanged) | Persistence |
|---|---|---|---|
| **Lineup** | the talent Jon is assembling for one inquiry | `saved_talent` / `savedIds` (`useInquiryCart`) | transient; freezes at SEND |
| **Inquiry** | one conversation about a lineup, moving through the lifecycle | `inquiries` row | lives in the lifecycle |
| **Projects** | Jon's multiple inquiries (e.g. "Brooklyn editorial" + "Q3 campaign") | many `inquiries` rows | persists |
| **Favorites** | the no-commitment heart/wishlist | `client_favorites` / `favoriteIds` | persists across sessions |

The data model for all four already exists and is correctly separated (`web/src/components/directory/public-discovery-state.tsx:14-30`). The work is overwhelmingly about **narrating state** Jon can't currently see, plus collapsing three competing front doors into one.

---

## 2. The DRAFT -> SENT -> RECEIVED -> CONVERSATION lifecycle

The single most important line in the product is the boundary between **draft** (private, Jon's) and **sent** (shared, on the agency's clock). Today that boundary is computable but invisible. This lifecycle makes it felt.

### The honest baseline (what already exists)

- The lifecycle enum already has a `draft` status and a `draft -> submitted` edge (`web/src/lib/inquiry/inquiry-lifecycle.ts:5-14, 38`). `resolveNextActionBy` already returns the coordinator the instant status hits `submitted`. The clock-starts-at-send model is encoded in the state machine and just not surfaced.
- A real draft row autosaves today (`use-unified-inquiry.ts`), lazily created on first structured commit, debounced ~350ms, seeded with a synthetic placeholder contact (`pending-...@guest.impronta`) until SEND promotes it. `contactPromoted` is the exact boundary signal.
- BUT the early row is inserted as `status: "new"` (`guest-chat-actions.ts:1639`), skipping `draft` entirely. So a half-assembled private lineup already appears as a live thread in the agency inbox, and Jon never gets a real send moment.

### Net-new vs polish at a glance

- **Net-new:** draft status on the early row + send-time promotion; the draft-privacy banner; the SENT airlock; the RECEIVED receipt card; the humanized coordinator header; the per-phase status strip; admin "drafts" filtering.
- **Polish of existing:** `SendToAgencyBar` sub-line; folding `SyncStatusBar` into the draft banner; lifecycle-aware launcher pill label; status copy map.

### The four states, with microcopy

All user-facing copy: no em dashes, never "cart"/"buyer", accent via the `color.accent` token (`registry.ts:101`), never hardcoded gold.

#### DRAFT — "only you can see this"

Detection: `inquiryId != null && phase === "draft" && !contactPromoted`.

Net-new **DraftPrivacyBanner** above the thread/composer, subsuming `SyncStatusBar`:
- Lock glyph + bold line: **"Draft. Only you can see this."**
- Muted sub-line: **"Saved automatically. Send when you're ready and {agency} will get it."**
- The three sync states fold in here (this is where the "private draft" promise lives, so save-state belongs here too):
  - saving -> tiny spinner, "Saving..."
  - saved -> momentary check, settles back to "Saved automatically."
  - error -> danger treatment, **"Couldn't save your last change. Tap to retry."** (wire to existing `handleRetrySync`). The error now reads as "your private draft is at risk", far more motivating than a 28px footer.

A quiet, never-blocking readiness reflection sits under the lineup: talent (filled), dates (open), brief (open). Tapping a row opens that rail editor. It shows Jon the shape of a strong inquiry; it never gates Send.

#### SENT — the deliberate handoff (the airlock)

Detection: the `draft -> submitted` transition fires at the real Send (`SendToAgencyBar` / `startGuestChatInquiry`). This is where status is promoted off `draft`, notification fanout fires, and the lineup **freezes** (`lineupFrozen = phase !== "draft"`).

Three frames:
1. **Send button** (polish of `SendToAgencyBar.tsx`): primary, full-width, accent-token. **"Send to {agency}"** with a trust pre-frame sub-line: **"They typically reply {typicalReply}."** (reuse `typicalReply`, `MiniChatPanel.tsx:162`). Setting the expectation before the click lowers post-send anxiety. Add one quiet reassurance line near Send: **"No payment now. Sending starts a conversation, not a booking."**
2. **The airlock** (net-new, ~1.2s, non-blocking in-panel transition on `onSent`): the draft lock glyph "opens", lineup avatars settle into a row, centered copy **"Sent to {agency}."** then resolves to **"{Maria} has your inquiry."** This is the emotional payoff of crossing the wall. Use optimistic flip with rollback on failure so it feels instant.

#### RECEIVED — "a human is on it"

Detection: `submitted -> coordination` with `coordinator_id` set (already assigned at submit via `resolveInquiryCoordination`).

Net-new **InquiryReceiptCard**, pinned as the first message of the now-shared thread (upgrades the thin `guest-auto-ack.ts` bubble). Four trust primitives in one card:

> **Inquiry received** · {date, time}
> {agency} has your inquiry about **{Talent A, Talent B, +1}** (face-stack).
> **{Maria}** is your coordinator. She typically replies **{within ~2 hours}**.
> We'll email you at **{jon@email}** the moment she does.
> No payment now. Talent are coordinated by {agency}, never contacted directly.

Timestamp (clock started here, not at draft) + name + expected reply + fallback channel + privacy/no-commitment framing. Every data point already flows in the system. The header subtitle (`MiniChatPanelColumn.tsx:333-339`) switches from the flat status word to **"{Maria} · {agency}"** with the coordinator's face. If unassigned: **"{agency} · assigning a coordinator"** and a status of **"Received {2m ago}. Someone will pick this up shortly."** Never a fake "online", never a flat "Open".

#### CONVERSATION -> Offer -> Booked

Net-new slim status strip above the composer, keyed to `threadStatus`, always naming the next step:
- `open` -> "In conversation with {Maria}"
- `offer_pending` -> "{agency} sent you an offer. Review it" + jump-to-offer (this is Jon's turn -> bright accent CTA)
- `approved` -> "Approved. Confirming your booking"
- `booked` -> "Booked. You're all set"

When it's the coordinator's turn, the strip reassures ("{Maria} is working on it") rather than going silent. Never leave Jon staring at a dead thread wondering whose move it is.

---

## 3. The lineup-aware CRO system

### 3.1 InquiryContext resolver (net-new, pure function)

New file `web/src/lib/inquiry/inquiry-context-resolver.ts`. Pure, unit-tested (mirror `inquiry-lifecycle.test.ts`). Every CTA on every surface renders from its output. It does not fetch; it takes resolved inputs the code already supplies.

Inputs: `talentProfileId | null`, `isInLineup`, `lineupCount`, `lineupTalentIds`, `hasActiveDraft`, `draftInquiryId`, `contactPromoted`, `draftPhase`, `otherOpenInquiries[]`, `identity` (guest|client), `lastActivityAt`.

Output (discriminated): `add_first | add_to_lineup | in_lineup | review_lineup | pick_inquiry | resume_draft | sent_awaiting | live_conversation`.

Resolution precedence (precedence is the product):
1. phase in {submitted, coordination} -> `live_conversation` or `sent_awaiting`
2. has other open inquiries AND on a talent -> `pick_inquiry`
3. talent in lineup -> `in_lineup`
4. draft exists, talent not in it -> `add_to_lineup`
5. talent, no draft -> `add_first`
6. no talent, lineup non-empty -> `review_lineup`
7. stale draft -> `resume_draft`
8. else -> `add_first`

Only one input needs a backend touch: `otherOpenInquiries` (see 3.3).

### 3.2 Cross-surface CTA matrix

Every cell = `resolveInquiryCta(...).kind -> rendered control`. "Quiet" = secondary text link, not a button.

**Directory card** (`talent-card-actions.tsx`) — one tap, never a modal:
| State | Primary | Quiet secondary |
|---|---|---|
| add_first | "Inquire" (adds to lineup) | - |
| add_to_lineup | "Add to lineup" | - |
| in_lineup | "In lineup ✓" (tap removes, with undo) | "Review lineup ({n})" |
| sent_awaiting / live_conversation | "In your inquiry" (locked, no remove) | - |

**Talent profile main CTA** (collapses the three competing buttons into the resolver):
| State | Primary | Quiet link |
|---|---|---|
| add_first | "Add {firstName} to an inquiry" | "Start a separate inquiry" (only if other projects) |
| add_to_lineup | "Add to your lineup ({n})" | "Inquire about {firstName} separately" |
| in_lineup | "In your lineup. Review ({n})" | "Remove from lineup" |
| pick_inquiry | "Add to..." -> project picker | "New inquiry with just {firstName}" |
| sent_awaiting | "Inquiry sent. View status" | - |
| live_conversation | "Open your conversation" (+ unread dot) | - |

**Profile sticky/mobile bar** — one line, mirrors the primary: add_* -> "Add to lineup ({n})"; in_lineup -> "In lineup ({n}) · Review"; sent_awaiting -> "Sent · reply {eta}".

**Home / directory header** (no specific talent): empty -> nothing (don't advertise an empty lineup); review_lineup -> compact "Lineup ({n})"; pick_inquiry -> projects dropdown; sent/live -> "Inquiry · {phase}" + unread dot (the returning-visitor re-entry point).

**Launcher pill itself** (lifecycle-aware label): empty -> "Message {agency}"; draft non-empty -> "Your lineup ({n})"; sent_awaiting -> "Inquiry sent" + status dot; live + unread -> "{agency} replied" + accent dot (reuse `NewMessagePulse`).

### 3.3 Multi-inquiry projects

Today `GuestThreadSwitcher` + `GuestInquirySummary` are per-*talent* (`Chat with {talentName}`, single portrait) — directly at odds with a lineup being one inquiry about several talents.

Reshape `GuestInquirySummary` (`guest-chat-contract.ts:423`): add `projectLabel` (job_name or derived "Lineup of 3 · Jun 28"), `lineup[]` (was single name/portrait), `lineupCount`, keep `threadStatus`/`typicalReplyLabel`. Switcher row renders a face-stack (reuse `LauncherAvatarStack`) and `projectLabel`. The left pane visually distinguishes draft vs "sent · awaiting reply" pills.

Project picker (the `pick_inquiry` state) — anchored popover (reuse `useAnchoredPopover`/`PortaledOverlay`), never a blocking modal:
```
Add {firstName} to:
  ◉ Hyatt Summer Opening · 3 talents · coordinator replying   [+ add]
  ○ Untitled · 2 talents · draft                              [+ add]
  ─────────────
  + Start a new inquiry with just {firstName}
```
Default-highlight the most recent draft (preserve > ask). Smart default: add-to-existing if same event_type/city, else new.

### 3.4 Never-block / never-destroy rules

- One-tap add is the default everywhere; with a single active draft it adds silently, no picker.
- "Separate" is always a quiet secondary link, never the primary.
- **Auto-park, never overwrite:** starting a separate inquiry persists the current lineup to the current draft row, then `clearSavedIds()` and seeds the new lineup. Parked talents live on the inquiry row, so nothing is lost; the switcher re-enters it.
- **Removal reversible while DRAFT only:** card/rail X shows a 5s Undo toast restoring both the cart id and the record patch. After SEND, lineup edits go through the conversation ("ask the coordinator to add someone"), never a silent `saved_talent` toggle.
- **Fix the silent-failure bug:** rail `handleRemoveTalent` (`TalentProfileChatLauncher.tsx:103-128`) currently fires `void onCaptureChip(...)` with no catch / no sync surfacing. Route it through the same `patch()` path so removal has the same visible save/retry guarantee as every other field.

### 3.5 Backend: the one new touch

Extend `listGuestInquiries` (and the client Messages shell) to return the reshaped `GuestInquirySummary[]`, aggregating lineup talents per inquiry from `interpreted_query.talent.selected_ids` + a `saved_talent` portrait join (reuse `useResolveCartPortraits`). No migration.

---

## 4. Look and feel upgrade

Current craft is high on engineering (a11y, reduced-motion, single-source-of-truth) but reads SaaS-generic, and the headline lifecycle beat has no visual home. Honest score as-is: ~7.0/10. Target ~9.

- **Typography (cheapest path from SaaS to premium):** introduce a display/serif accent for the agency name in the header, the greeting, and the receipt card; build a real type scale. Borrow the directory's editorial-noir vocabulary. Body stays system-sans.
- **Motion** (extend the existing vocabulary, all reduced-motion-safe): the fly-to-lineup arc and landing spring are excellent. Add: panel open (scale/translate from the launcher, transform-origin bottom-right), expand morph (width/layout, not a hard swap), greeting stagger-in paired with the agency avatar, the SENT airlock (single-stroke check draw + soft accent ring, confetti-free), error-line slide-in with an alert icon.
- **Expanded panel:** swap text glyphs (`×`, `⤢`, `✕`) for lucide (`X`, `Maximize2`, `Minimize2`); the left pane gets draft vs sent pills (3.3).
- **Launcher polish:** real pill hover (the transform transition is currently dead code), a count chip on the pill, a frosted/translucent +N chip (currently near-black ink on the accent pill).
- **Empty/success states:** first-add toast "{Name} is in your lineup. Add more, or open your lineup to send to {agency}." (teaches the model at the moment of first action); the receipt card is the success state, not a gray footer line; greeting bubble gets an avatar + entrance.
- **Rail:** a gentle completeness signal ("3 of 8 added") tied to send-readiness (enough filled -> Send brightens); open the rail on first detail capture.
- **Mobile:** true full-screen safe-area sheet for the panel (today it's a 380px floating card — a real conversion risk on phones).
- **Theming:** support a dark surface variant so a noir tenant's launcher doesn't pop a bright white box. All accents via `color.accent`, AA-clamped (the rail's `accentText` clamp pattern).

---

## 5. Control and trust

| Moment | Jon's silent fear | The answer |
|---|---|---|
| First add | "did I commit?" | toast "in your lineup... send when ready"; heart stays as no-commit |
| Drafting | "is the agency reading this mess?" | "Draft. Only you can see this. Saved automatically." |
| A field fails to save | "did I lose my work?" | banner danger state + tap-to-retry (not a 28px footer) |
| Pressing Send | "is this it? what now?" | pre-frame "they reply {time}" -> airlock "Sent -> {Maria} has it" + "No payment now" |
| Right after send | "did it arrive? anyone there?" | receipt card: timestamp + {Maria} + "replies in ~2h" + "we'll email you" |
| Dead-air gap | "have they forgotten me?" | "Received 2m ago. Someone will pick this up shortly" |
| Mid-conversation | "whose move is it?" | status strip narrates phase; Jon's turn = bright CTA, agency's turn = reassurance |
| Removing a talent | "did that drop?" | 5s Undo; rail removal routed through visible save/retry |
| Starting a 2nd inquiry | "will this wipe my first?" | auto-park, never overwrite; switcher to return |

Trust framing to add (currently absent in the send flow): "No payment now. Sending starts a conversation, not a booking." and "Talent are coordinated by {agency}, never contacted directly." Reversible i-know-who <-> agency-recommends mode in the rail must keep the named lineup, never wipe it. Returning-guest restore shows "Welcome back. Your draft is saved."

---

## 6. Funnel friction, ranked by conversion impact

1. **(P0, highest) No draft vs sent boundary in the data.** Early row inserts `status:"new"` (`guest-chat-actions.ts:1639`), so private drafts flood the agency inbox as ghost "live" threads and Jon never gets a send/received moment. Fix: insert as `draft`, promote at real send, filter `draft` out of the live admin queue. Unlocks the entire trust arc and stops the ghost-inbox leak the prior plan already flagged (`message-impronta-inquiry-sync-plan-2026-06-24.md:614`, the admin-labeling half never shipped). Status change + one filter, no migration.
2. **(P0) The "received" beat is a one-line gray note.** Peak anxiety underserved. Fix: the InquiryReceiptCard (section 2).
3. **(P0) Three competing inquire systems on one profile** (`TalentProfileInquireButton`/`InquiryDrawer`, `ProfileDiscoveryCta`, `TalentProfileChatLauncher`). The big primary button is stateless and spawns a parallel single-talent inquiry that silently drops the lineup. Fix: collapse to one resolver-driven CTA; demote `InquiryDrawer` to the synced expanded form view; remove the instant-submit guest path.
4. **(P1) Add button says "Inquire" (reads as commit), not "Add to lineup".** Mislabeling a reversible one-tap action as a commitment suppresses the top of the funnel. Fix: relabel.
5. **(P1) Contact gate has no value anchor.** Right timing, thin copy. Fix: restate value with lineup recap "We'll use this to send you {agency}'s reply about {Jane, +2}."
6. **(P1) No honest availability / social-proof momentum cues.** Add honest signals (booking window, recency) on the card and receipt. No fake "online".
7. **(P2) Multi-project picker not surfaced on the profile CTA;** server silently picks the project. Fix: the picker (3.3).
8. **(P2) Guest -> account seam framed as account-creation, not "save your project".** Reframe the claim copy around preserving the lineup/project.

---

## 7. Phased build plan

Each phase is independently shippable, TS+lint gated, branched off `main`. "Moves the needle" notes the conversion mechanism.

### Phase 1 — Draft boundary + admin hygiene (net-new) [foundation, highest leverage]
- Goal: make draft a real, private status so the whole arc has something to fire on.
- Surfaces/components: guest early-row creation; admin inbox loaders.
- Key files: `web/src/app/t/[profileCode]/_actions/guest-chat-actions.ts` (insert `draft` not `new`; promote at send in `startGuestChatInquiry`), `web/src/app/t/[profileCode]/_chat/use-unified-inquiry.ts` (draft phase), admin loaders `inquiry-workspace-data.ts` / `messages-shared.tsx` (filter/label drafts), `web/src/lib/inquiry/inquiry-lifecycle.ts` (already has the edge).
- Acceptance: a half-assembled lineup never appears in the live admin queue; send transitions `draft -> submitted`; notification fanout fires only at send (already gated); unit test the promotion. No migration.
- Needle: removes ghost inbox so the "someone is on it within X" promise becomes backable -> faster real replies -> conversion.

### Phase 2 — The SENT -> RECEIVED trust beat (net-new) [the owner's headline insight]
- Goal: turn peak anxiety into peak trust.
- Surfaces/components: send affordance, thread, panel header.
- Key files: `SendToAgencyBar.tsx` (pre-frame sub-line + "No payment now"; polish), new `InquiryReceiptCard` in `_chat`, `guest-auto-ack.ts` (4-field body), `MiniChatPanel.tsx` (airlock on `onSent`; optimistic flip), `MiniChatPanelColumn.tsx:333-339` (humanized coordinator header), `mini-chat-styles.ts` (`STATUS_COPY_KEYS`), `messages/en.json`. Coordinator name/face from `resolveInquiryCoordination` surfaced into the guest payload.
- Acceptance: Send produces the airlock then a pinned receipt with timestamp + coordinator + reply ETA + email; header shows "{coordinator} · {agency}" or "assigning a coordinator"; no flat "Open" post-send.
- Needle: the highest-trust beat in the funnel; directly lifts send -> reply -> offer progression.

### Phase 3 — Collapse the front doors + state-aware CTA (net-new resolver + polish CTAs) [biggest UX win]
- Goal: one frictionless next step everywhere; end the lineup-destroying fork.
- Surfaces/components: profile CTA, directory card, sticky bar, launcher pill.
- Key files: new `web/src/lib/inquiry/inquiry-context-resolver.ts` (+ tests), `talent-profile-inquire-button.tsx` + `page.tsx` (~2138/2163/2188/2257) (collapse to resolver-driven CTA, retire guest instant-submit drawer), `profile-discovery-cta.tsx`, `talent-card-actions.tsx` (relabel + resolver), `TalentProfileChatLauncher.tsx` (pill label).
- Acceptance: a 3-talent lineup is never silently dropped; profile/card/pill all read one resolver; "Inquire" relabeled "Add to lineup"; sent inquiries lock the lineup.
- Needle: removes choice paralysis + the destroy-on-click; relabel lifts add-rate at the top of the funnel.

### Phase 4 — Draft privacy banner + sync fold + status strip (net-new + polish)
- Goal: make the private workspace and forward motion legible.
- Key files: new `DraftPrivacyBanner.tsx` (subsumes `SyncStatusBar.tsx`), `MiniChatPanelColumn.tsx` (status strip + readiness reflection), `mini-chat-styles.ts`.
- Acceptance: draft shows "only you can see this"; save error reads as draft-at-risk; status strip always names the next actor.
- Needle: reduces drafting anxiety -> richer briefs -> higher-quality inquiries the agency converts.

### Phase 5 — Projects model (net-new reshape + small backend)
- Goal: real multi-inquiry projects with park-don't-overwrite.
- Key files: `guest-chat-contract.ts:423` (`GuestInquirySummary` reshape), `listGuestInquiries` + client Messages shell (3.5), `GuestThreadSwitcher.tsx` (face-stack + project labels), project picker via `useAnchoredPopover`/`PortaledOverlay`, `public-discovery-state.tsx` (`clearSavedIds` as park primitive).
- Acceptance: switcher names multi-talent projects; picker defaults to the recent draft; separate inquiry parks, never overwrites; no migration.
- Needle: serves high-LTV repeat clients; preserves "in control".

### Phase 6 — Undo + silent-failure fix + trust framing (polish + bug)
- Goal: reversibility and correctness on removal; surface no-commitment/privacy copy.
- Key files: `TalentProfileChatLauncher.tsx:103-128` (route removal through `patch()`, add undo), `talent-card-actions.tsx` (undo toast), `MiniChatGateForm.tsx` (lineup recap anchor), receipt/send copy.
- Acceptance: removal shows undo and a visible save/retry; gate restates value; no silent inquiry-record drift.
- Needle: removes the only place the flow actively destroys Jon's selection; anchored gate lifts email-capture.

### Phase 7 — Craft + motion + mobile + theming (polish)
- Goal: take felt quality from ~7 to ~9.
- Key files: `mini-chat-styles.ts` (`FONT`, `C`, dark variant), `MiniChatPanel.tsx:733-758` (mobile full-screen sheet, panel open anim), `ExpandedChatLayout.tsx` + `OpenFullConversationLink.tsx` (expand morph + lucide), `LauncherAvatarStack.tsx` / `launcher-avatar-styles.ts` (pill hover, count chip, frosted +N), greeting stagger, rail completeness signal.
- Acceptance: display type on agency name; panel open/expand/airlock animated and reduced-motion-safe; mobile takes over the screen; dark tenant variant; all accents via `color.accent`, AA-clamped.
- Needle: premium feel raises perceived trust and completion intent across the whole flow.

### Phase 8 — Returning-visitor + abandoned-draft nudges (net-new, compounding)
- Goal: bring Jon back to finish or re-enter.
- Key files: `TalentProfileChatLauncher.tsx` (cross-session "Finish your inquiry ({n})" via persisted draft, not just per-tab open flag; "{agency} replied" + pulse on unread). Later: a cron nudging `draft` rows older than N days, only once `contactPromoted`.
- Acceptance: stale draft auto-labels the pill to resume; unread sent inquiry pulses; abandoned-draft email gated on a real promoted contact.
- Needle: the highest-ROI retention hook; turns returns straight into the live conversation.

---

## 8. Open product decisions for the owner

1. **Primary CTA label on a sent/booked-ready inquiry: "Book Now" vs "Message"/"Inquire".** Recommend keeping "Message"/conversation language pre-offer ("Book Now" implies instant transaction we don't do); revisit once an offer exists.
2. **Rename "cart" -> "lineup" in user-facing copy only?** Recommend yes (UI strings + JSDoc), keep DB/store names (`saved_talent`, `useInquiryCart`) to avoid churn and protect the localStorage migration.
3. **Keep `InquiryDrawer` for logged-in client/admin surfaces** as the full-form expanded view, or retire it entirely? Recommend keep as the synced second view, remove only the public guest instant-submit path.
4. **Honest scarcity signals** (booking window, recency) — owner to confirm which signals are truthful per tenant before we surface any.
5. **Coordinator face/name exposure to guests at RECEIVED** — confirm this is acceptable per agency policy.

### House rules honored throughout
No em dashes in user-facing copy. Accent via `color.accent` token, never hardcoded gold. Never "buyer"/"cart" in client copy (use "client"/"lineup"). Real imagery, never placeholder boxes. Never block the happy path; never destroy a selection.
