# Guest/Client Message Panel — 360 Audit + Uplift Plan (2026-07-09)

**Scope:** the floating "Message {agency}" chat/inquiry panel (guest + client), from first touch to booking: launcher pill, compact panel, expanded view, projects, lineup/cart, favorites bridge, send/contact gate, hub behavior, per-tenant config, and every competing inquiry front door.
**Audited against:** `origin/main` @ `a1b5a3561` (what production runs), plus live QA on `improntamodels.com` and `tulala.digital` (2026-07-09). All file:line refs are to main.
**Method:** 4-lane code exploration (architecture / lifecycle / entry points / pixel bugs) + hands-on reproduction of every screenshot defect on production.

---

## 1. Verdict

**Overall: 4.5/10 as a client operating system.** The engine underneath is genuinely good (single `submitInquiry` convergence, draft→submitted lifecycle, coordinator seating, resolver with a real test suite). The surface on top of it is not trustworthy: it spawns duplicate drafts, lies about lifecycle state on the pill, spams system notes, lets edits leak into already-sent inquiries, renders two projects that are pixel-identical, has no send button in its own expanded draft view, and is broken on the hub. Design reads "engineered," not "concierge": 6+ fixed chrome bands squeezing a 2-line conversation, colliding avatar chips, a text-link "Expand ⤢" as the doorway to the most important view.

Per-dimension (honest, not summed):

| Dimension | Score | One-line reason |
|---|---|---|
| Data correctness | 3.5/10 | Duplicate drafts, writes into sent inquiries, note spam, pill-state lie |
| IA / product model | 4/10 | 14 front doors, 2 identical projects, no draft-vs-sent legibility, favorites disconnected |
| Visual design / craft | 5/10 | Solid tokens + serif identity, but collisions, clipping, band-stack squeeze, lame Expand |
| Surface consistency | 4/10 | Home ≠ directory ≠ profile ≠ builder pages ≠ hub; 3 different pill labels in one session |
| Hub readiness | 2/10 | Roster load fails, "Send to agency" copy on a non-agency, no launcher on hub landing |
| Config / tenant control | 6/10 | Real per-tenant table + admin drawer exists; missing home flag + zero reach into builder pages |

The good news: **every P0 is a seam fix, not a rewrite.** The architecture (59 files, ~14.8k lines under `web/src/app/t/[profileCode]/_chat/`) is aggressively modularized and the defects are concentrated in ~6 files.

---

## 2. What exists today (map)

### 2.1 Component system
- **Launcher:** `TalentProfileChatLauncher.tsx` (769L) — pill + avatar cart rail + project picker + panel host. Mounted by two server seams: `TalentProfileChatLauncherMount` (talent pages) and `AgencyChatLauncherMount` (directory/home/global-directory, talent-less).
- **Panel:** `MiniChatPanel.tsx` (798L, at the 800 cap) orchestrates; `MiniChatPanelColumn.tsx` (783L) renders the band stack; `ExpandedChatLayout.tsx` adds a 232px "Conversations" left pane at 720px width.
- **State:** `useUnifiedInquiry` (debounced patch → `captureGuestChip`), `useInquiryCart` (`saved_talent`), `resolveInquiryCta` + `launcher-cta-label` (pill state machine), 4s message poll (no realtime for thread messages).
- **Legacy still alive:** `InquiryDrawer.tsx` (**2,149 lines**) remains the fallback when no launcher is mounted; `directory-inquiry-sheet.tsx` mounts globally in `(public)/layout.tsx:65`.

### 2.2 Per-tenant activation — EXISTS (partially)
`tenant_guest_chat_settings` table: `enabled`, `show_on_talent`, `show_on_directory`, `greeting`. Admin UI: Settings → Guest chat drawer (`admin/shell/internal/drawers/guest-chat-settings.tsx`). Defaults ON, fail-open (`guest-chat-settings.ts:36-82`).
**Gaps:** no `show_on_home`; flags have zero reach into builder/CMS-rendered pages (they never mount the launcher at all); no builder token.

### 2.3 Where the launcher mounts (the home ≠ directory root cause)
| Surface | Launcher? |
|---|---|
| Legacy storefront home (`agency-home-storefront.tsx:447`) | YES |
| **Builder-authored home (home page-role → `CmsPublicPage`)** | **NO — and loses the modal/discovery providers too** (`src/app/page.tsx:225-227`) |
| Built-in `/directory` (`directory/page.tsx:151`) | YES |
| **Builder-authored directory (directory page-role)** | **NO** (`directory/page.tsx:106-114`) |
| All 4 talent-profile templates (`t/[profileCode]/page.tsx:2343`) | YES |
| Talent subpages, `/t/*/site`, all `/p/*` CMS pages | NO |
| Hub landing (`hub-landing.tsx`) | NO |
| Hub + apex `/directory` (`global-directory/page.tsx:167`) | YES (but broken, §3 P0-5) |

So "home page is different from directory page" is structural: the moment a tenant publishes a builder home, the floating funnel disappears from it.

### 2.4 The 14 inquiry front doors (today)
Floating launcher · directory review bar ("Open inquiry · N") · header Send icon · header heart → FavoritesModal → chat bridge · `?inquiry=open` URL · favorites-modal "Inquire about N" · profile guest inquire button · profile CLIENT inquire button (**opens legacy InquiryDrawer, not chat**) · card contact/cart buttons · builder EditorialSplit header CTA (**calls `openInquiry()` — legacy sheet directly, never chat**) · legacy DirectoryInquirySheet · instant-book button (separate engine) · storefront offering CTAs · workspace discover/shortlists/favorites (`POST /api/discover/inquiry`) · public contact form. All converge on `submitInquiry` except instant-book — the engine is unified, the UX is not.

---

## 3. Defect register

Every item live-reproduced on production and/or traced to code. Ordered by severity.

### P0 — trust breakers (the "everything is mixed together" cluster)

**P0-1 · Duplicate drafts; guest can never resume a talent-page draft.**
Early drafts are raw `inquiries` inserts with talent only in `interpreted_query.talent.selected_ids` — **no `inquiry_participants` row** (`guest-chat-actions.ts:1781-1801`; deliberate at `promote-early-inquiry.ts:97-108`). But both the resume path (`getActiveGuestInquiry`, `:1611-1621`) and the idempotency check (`ensureGuestChatInquiry`, `:1729-1746`) gate on `inquiry_participants.talent_profile_id`. Result: the check never matches → every visit/open can mint a fresh draft carrying the same lineup. Live-verified: PROJECTS shows Draft "just now" + Sent, both "Added 9 tal…", identical face stacks.

**P0-2 · The pill lies: a pure draft displays "Inquiry sent."**
`toThreadStatus("draft")` falls through to `"open"` (`guest-chat-actions.ts:475-494`) → `threadStatusToPhase("open")` → `"coordination"` (`launcher-lifecycle-inputs.ts:69-85`) → resolver rule 1 (`SENT_LIVE_PHASES`) short-circuits to `sent_awaiting` before any draft rule runs (`inquiry-context-resolver.ts:256-265`). The carefully-built `resume_draft` state is unreachable for these rows. This is also why the same session shows three different pill labels on home/directory/profile.

**P0-3 · Guest edits mutate already-SENT inquiries.**
`captureGuestChip` refuses only terminal statuses — `submitted` is writable (`guest-detail-chips-actions.ts:491-497`). The agency-launcher ensure path returns the newest **live** inquiry including submitted ones (`guest-chat-actions.ts:1747-1757`), and the project picker offers sent threads as write targets (`launcher-lifecycle-inputs.ts:200-209`). The agency sees a lineup that changes under them after "send" froze nothing.

**P0-4 · Expanded draft view has no send path + scroll leaks to the page.**
Live-verified: in expanded mode with a draft active, no "Send to agency" control exists in the DOM (the only match on the page is the directory's own review bar). Root: `SendToAgencyBar` gates on `!showGate && extrasEnabled && onSendToAgency` (`MiniChatPanelColumn.tsx:753`) and the unbounded in-flow rail (§P1-9) crushes/starves the column; the draft row in PROJECTS also doesn't visibly switch threads. Mouse-wheel over the panel scrolls the page behind it (no overscroll containment).

**P0-5 · Hub launcher is broken where it exists and absent where it matters.**
`tulala.digital/directory` mounts "Message Tulala" but the Talent section errors: *"Couldn't load the roster. You can still let the agency recommend."* — and the CTA reads "Send to agency" on a host that is not an agency. Hub landing page has no launcher at all. (Mount resolution: `AgencyChatLauncherMount.tsx:81-109`; hub landing `src/app/page.tsx:233`.)

**P0-6 · Server accepts guest messages with no real contact.**
`sendGuestMessageAction` persists the message first (`guest-chat-actions.ts:1098-1105`) and only then conditionally promotes contact (`:1127-1152`). A replayed/direct call deposits messages on a placeholder-contact draft. Client-side gate exists (`use-mini-chat-send.ts:380-388`); the server does not enforce it.

### P1 — major UX defects

**P1-7 · "Added N talent to your inquiry." spam.** Every talent write inserts a fresh system note — no dedup, no coalescing, no same-value guard (`guest-detail-chips-actions.ts:529-588`); triggers = every 350ms debounce settle + park + picker-add. Live-verified 3 consecutive identical notes; the user's screenshot shows 6. Bonus: coordinator-side bubble double-prefixes "Added: Added 9 talent…" (`:545-546`).

**P1-8 · Launcher pill collision.** Count chip isn't suppressed for `sent_awaiting` (suppression list covers only lineup states, `TalentProfileChatLauncher.tsx:477-481`) → avatar stack (with its own "+N") AND a "9" chip AND the label all fight for the pill. Per-avatar X badges (`top:-4,right:-4`) float over neighbors overlapped by `-12px`. The `marginTop:18` "reservation" does nothing on a bottom-anchored `position:fixed` box (`:512-519`) so overhang clips. Live-verified at zoom: "+6" renders half-clipped as "-6".

**P1-9 · Rail geometry broken in both modes.** Compact: collapsed rail gets **no maxHeight and no overflow scroll** (`railBounded = bounded && !collapsed` → false; `InquiryDetailsRail.tsx:357-372,484-496`) so icons 6-8 (Talent/Brief/Contact) clip with no affordance. Expanded: the rail mounts in-flow, unbounded, `flexShrink:0` (`MiniChatPanelColumn.tsx:710`) inside an `overflow:hidden` pane → the conversation body collapses toward 0 and the Draft banner butts into the non-sticky "INQUIRY DETAILS" header (the screenshot occlusion).

**P1-10 · Competing CTAs everywhere.**
In-panel: "Save this conversation" card + "Send to agency" bar render simultaneously (independent gates, `MiniChatPanelColumn.tsx:568-591` vs `:753-764`); after first send, `ClaimEmailRecap` + `GuestAccountToolkit` stack, both offering the same magic link (`use-mini-chat-send.ts:257`). On-page: directory shows the launcher AND the review bar at once; profile shows hero CTA + sticky-footer CTA + launcher. Client-path divergence: the signed-in profile inquire button opens the 2,149-line legacy InquiryDrawer, not the chat.

**P1-11 · Two projects, zero legibility.** Thread tabs both render "Lineup of 9"; expanded rows truncate to "Lin…"; the ONLY differentiator is a tiny Draft/Sent chip. No names, no event/date summary, no last-message preview.

**P1-12 · "Oran is on it."** Coordinator strip uses bare first token of `profiles.display_name` with no role/agency qualifier (`ConversationStatusStrip.tsx:116-124`). A guest has no idea who Oran is. Trust beat reads as a stranger.

**P1-13 · Services strip defects.** "Custom quote quote": chip prints `title` + `offeringChipPriceLabel` and the synthetic default is titled "Custom quote" with `amountCents:null` → price label "quote" (`OfferingQuickPicker.tsx:21-24,82-87`; `TalentProfileChatLauncherMount.tsx:152-167`). The strip is also mounted AFTER the whole column — i.e. **below the Expand footer**, trimmed by the 18px rounded corner (`MiniChatPanel.tsx:773`), despite its own doc-comment saying "pinned under the composer." And it hardcodes `#fff`/`#0B0B0D` outside the panel palette.

**P1-14 · Signed-in users are treated as guests.** Live-verified: a session with the admin Edit pill still gets "Save this conversation / Email me a sign-in link." The panel's identity model is guest-cookie-only; it never bridges an authenticated session (workspace users are expected to use `ClientMessagesShell`, but the public surface doesn't say so — it asks the logged-in user to create an account).

**P1-15 · Greeting double-render risk.** Static greeting is gated only on `receipt == null` — no `rows.length === 0` guard — with `rows.map` unconditional right after (`MiniChatPanelColumn.tsx:485-525`).

### P2 — craft and hygiene

- "Expand ⤢" / "Collapse ✕" as a plain text footer link is the doorway to the full experience (`OpenFullConversationLink.tsx:61-62`) — weakest affordance in the panel.
- Expanded mode adds only a 232px list pane at 720px total; it is not a real workspace (compare: FavoritesModal got a true centered lightbox).
- Panel neutrals don't adapt to tenant brand (accent only); dark variant fully wired but intentionally dormant (owner call 2026-06-27 — do not resurrect without a new decision).
- `InquiryProjectPicker.tsx:154` `zIndex: 2147483000`; dead props (`extrasOpen`/`onToggleExtras`); dead `label` prop computed-and-ignored on both mounts; SyncStatusBar ghost comments.
- 5 files pinned at the 800-line cap = no headroom for any feature work without extraction first.
- Hub directory data hygiene: "Mexico"/"México" duplicate facets, 3 spellings of Playa del Carmen; first-paint skeleton wash.
- Profile page (adjacent, seen during QA): full black viewport mid-page, `she_her` raw enum rendered, three inquiry CTAs.

---

## 4. Product recommendation — "the client operating system"

The ask: this panel should be the guest/client operating system — quick inquiries, ongoing conversation, booking, registration — per tenant, hub-ready, integrated with favorites. My recommendation, based on what's already built (don't rewrite the engine; rebuild the shell):

### 4.1 One Concierge Dock, three views
Rebuild the floating surface as a **dock with three explicit views** (segmented control in the header, not buried footers):

1. **Chat** — the conversation, full-height, nothing floating over it. Details live behind a compact summary chip row ABOVE the composer (tap → bottom-sheet editor), not an overlay rail that eats the thread.
2. **Lineup** — the cart AND favorites, side by side, as a merge at the **UI level only** (keep `saved_talent` vs `client_favorites` stores separate — that separation is a good prior decision; the bridge action "move to lineup" already exists in FavoritesModal). This is the "add to cart / booking optimization" surface: face tiles, remove, "ask about availability," per-talent service chips.
3. **Projects** — the inquiries list done right: auto-named ("Beach wedding · Aug 14" from event_type+date, editable), status-truthful chips (Draft — only you can see this / Sent · awaiting {agency} / Reply received), last-message preview, lineup faces. Draft and Sent must be visually unmistakable (drafts get the lock + muted styling globally).

The pill stays the single persistent entry, but honest: `Draft · 9` / `Inquiry sent` / `{agency} replied` — one label system on every surface, count chip and avatar stack never rendered together (avatars + label only; the stack carries the count).

**Expand** becomes a real full-screen takeover (mobile) / centered two-pane lightbox (desktop) — same quality bar as the favorites modal, with projects left, conversation right, details as a right-edge summary column, and the send bar ALWAYS visible for drafts. Kill the text-link footer.

### 4.2 Lifecycle honesty (the correctness spine)
- Seed a talent `inquiry_participants` row on early-draft create (or re-gate resume/idempotency on `interpreted_query.selected_ids`) — kills duplicate drafts at the root (P0-1).
- Map `draft` → its own thread status end-to-end so the resolver's draft states actually fire (P0-2).
- **Freeze on send**: `captureGuestChip` refuses non-draft writes; post-send lineup changes go through an explicit "Request a change" message or a new draft via the picker — matching the airlock mental model already shipped (P0-3).
- Coalesce system notes: one "Lineup updated · 9 talent" note per thread that UPDATES in place (or suppress when value unchanged; minimum: same-value guard + collapse consecutive) (P1-7).
- Server-enforce the contact gate in `sendGuestMessageAction` (P0-6).
- Identity bridge: if an authenticated session exists on the tenant host, the dock shows "Signed in as {name}" and continues into the client thread (no more asking the owner to create an account) (P1-14).

### 4.3 One front door per page
- Directory: the dock pill is THE inquiry surface. The review bar's job (review + send) moves into the dock's Lineup view; retire the bar. Header Send opens the dock.
- Profile: hero CTA + sticky bar both `requestOpenChat()` with the talent pre-added — and the signed-in client path stops opening the legacy InquiryDrawer (route it to the dock too; keep InquiryDrawer only as the workspace dashboard form).
- Builder pages: mount the launcher at the **layout level for tenant hosts** (root layout branch + `(public)/layout.tsx`), gated by `tenant_guest_chat_settings`, so builder home/directory/`/p/*` pages get the same funnel. Add `show_on_home` and (optionally) per-page-role flags to the settings drawer. This closes "home ≠ directory" permanently rather than page-by-page.

### 4.4 Hub = Tulala Concierge
Same dock, hub-branded ("Tulala Concierge", no fake agency framing): fix the roster load on hub hosts, copy becomes "Send — we'll route it to the right agency," and post-send the receipt explains the routing ("Impronta will reply — they represent 6 of your 9 picks"). This is the Discover/hub-triage model from the binding spec, surfaced honestly. Hub landing gets the launcher.

### 4.5 What NOT to do
- Don't merge `client_favorites` into `saved_talent` at the data layer — the UI-level Lineup view gives you the merged feel without breaking the durable rule.
- Don't resurrect the dark chat variant (rejected 2026-06-27).
- Don't fork a second panel implementation — extract from the existing 59-file system; the 800-cap files need decomposition first or every lane will fight the cap.
- Don't touch `inquiry-permissions.ts` (explicitly rejected in the binding plan).

---

## 5. Execution plan (4 waves)

> **SUPERSEDED (2026-07-09, same day):** the execution-grade version of this plan — decision defaults, model-assigned lanes (Sonnet/Opus/Fable 5), firing order, QA protocol, copy matrix, metrics — lives in `web/docs/guest-message-panel-build-plan-2026-07-09.md`. The wave sketch below is kept for context.

**Wave 0 — Correctness (the P0s). ~1 session, highest ROI.**
0a participant seeding + resume/idempotency fix (P0-1) · 0b draft thread-status truthfulness (P0-2) · 0c freeze-on-send chip policy (P0-3) · 0d server contact gate (P0-6) · 0e note coalescing + double-prefix fix (P1-7) · 0f hub roster load + copy (P0-5) · 0g "Custom quote quote" one-liner (suppress price label when it duplicates the title). Each lane is small, testable, and independently shippable. Gate: a fresh-guest E2E on a preview host proving one-draft-resume, honest pill, frozen sent lineup, single coalesced note.

**Wave 1 — Panel geometry rebuild.**
Band-stack redesign (max 3 fixed bands: header / thread / composer+details-chips), rail → summary chips + bottom-sheet editors, SendToAgencyBar always-visible for drafts, services strip above composer inside the palette, pill de-collision (avatar stack OR count, reserved overhang box), scroll containment (`overscroll-behavior: contain`), save-card vs send-bar mutual exclusion, greeting guard.

**Wave 2 — Product IA (the dock).**
Three-view dock + honest pill labels everywhere · Projects naming + previews · Lineup view with favorites bridge tab · front-door collapse (retire review bar, reroute profile CTAs + builder header CTA) · layout-level mounting + `show_on_home` + settings drawer update · identity bridge for signed-in users · Expand → real lightbox/full-screen.

**Wave 3 — Craft + proof.**
Motion (spring on dock open, fly-to-pill kept), brand-adaptive surface tint, i18n parity sweep (en/es/fr), a11y (focus order in dock views, aria-live on notes), instrumentation on the existing analytics pipe (dock_view, lineup_add, project_switch, send), and a scored re-audit on prod.

Sequencing note: Wave 0 ships straight to main behind nothing (pure fixes). Waves 1-2 are one branch each in an isolated worktree (the shared checkout carries your profile-templates WIP — do not `git switch` it). The home/directory marathon (`feat/home-directory-marathon`) touches the same directory surfaces — coordinate the front-door collapse with it to avoid double-building the review bar's replacement.

---

## 6. Owner decisions needed

1. **Dock with Lineup+Favorites views** (UI-level merge) — approve the concept? (Data stores stay separate.)
2. **Retire the directory review bar** once the dock's Lineup view ships?
3. **Freeze-on-send**: after sending, lineup edits require "request change" (recommended) or stay silently editable?
4. **Hub branding**: "Tulala Concierge" framing + routing copy OK?
5. **Builder-page mounting**: launcher on ALL tenant-host pages by default (with per-tenant off switch), including builder homes?
6. **InquiryDrawer**: keep as the workspace dashboard form only, and remove it from all public-surface fallbacks?
