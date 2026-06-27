# Message Impronta — Unified Inquiry Cart + Live Chat/Form Sync Plan

**Date:** 2026-06-24
**Status:** DRAFT — awaiting owner go
**Author voice:** product owner + designer + staff engineer — one head, no committees.
**Drives:** every PR in the "Message Impronta unified inquiry" workstream until shipped.

## Vision

Today a directory visitor juggles three disconnected things: a heart (favorites), a hidden inquiry cart, and a chat launcher. We collapse the inquiry side into **one surface**. The "Message Impronta" launcher becomes the single inquiry cart — added talent show as face-focus avatar circles stacked on the button — and clicking it opens a guided chat that **is** the inquiry. The visitor starts chatting and slowly fills in structured details (date, location, talent, brief, budget). Every structured edit, whether typed in the chat or set in the in-panel form, writes to the **same** inquiry record and emits a thread note, so the agency (admin Messages), the client dashboard, and any assigned talent all see the change live within 350ms. The form is not a separate destination; it is a synced second view of the same conversation. Favorites/heart stays exactly where it is, untouched.

---

## 1 · LOCKED DECISIONS

Each is a binding decision with a one-line rationale. Flag-on-contradiction notes are inline.

1. **Chat is the primary surface; the form is a synced second view of the SAME inquiry.** — The owner said "start chatting and SLOWLY fill in the inquiry"; a guided conversational stream is the lowest-friction path and the structured form just reflects the same record.
2. **The "Message Impronta" launcher becomes the single inquiry cart.** Added talent render as avatar circles ON the button. — One cart, one source of truth (`cart.cartIds`), no parallel cart sheet competing with the chat.
3. **Favorites/heart stays separate.** — Favorites (`client_favorites`) and inquiry cart (`saved_talent`) are orthogonal stores with different persistence semantics; merging them was never asked for and would lose the persistent-wishlist behavior.
4. **The inquiry is created EARLY as a partial/skeleton row** so structured edits have something to attach to before the visitor finishes. — Without an `inquiryId`, chip edits cannot persist; early creation lets the "slowly fill in" flow autosave from the first answer.
   - **CONSTRAINT FLAG (resolved):** `inquiries.contact_name` + `contact_email` are NOT NULL. A truly empty skeleton cannot be inserted. The early row is created **at the first structured commit** (first talent added OR first chip set), seeded with placeholder contact values that the deferred `ContactCard` overwrites. See §7 for the exact seeding contract. This honors "create early" without violating the schema and **needs no migration**.
5. **Structured edits use a NEW guest-safe patch action that mirrors the existing client one**, built on the proven cookie-gated `captureGuestChip` path — NOT the `assertCanPerform` allowlist. — The chip-capture action already writes `interpreted_query` + flat columns under cookie ownership via service-role; we extend it, we do not touch `inquiry-permissions.ts`.
   - **CONTRADICTION FLAG vs source proposals:** all three source proposals proposed adding `update_inquiry_details` to the guest allowlist in `inquiry-permissions.ts`. That is **wrong and explicitly rejected here** — the structured guest write path does not flow through `assertCanPerform`. Do not edit `inquiry-permissions.ts`.
6. **Cross-role sync reuses the existing realtime hook** (`use-inquiry-realtime`) + the existing `inquiry_details_updated` system-message/event path. — The hook already debounces `router.refresh()` at 350ms across admin/client/talent; the chip action already emits a thread note; nothing new is invented.

---

## 2 · CURRENT ARCHITECTURE (grounded)

### Chat front-end
- `web/src/app/t/[profileCode]/_chat/TalentProfileChatLauncher.tsx` — the fixed bottom-right pill. Renders glyph + label; inserts between them at ~line 134. Pill uses `accent`/`accentInk` (no hardcoded brand hue).
- `web/src/app/t/[profileCode]/_chat/TalentProfileChatLauncherMount.tsx` — mounts the launcher on the talent profile surface.
- `web/src/app/(public)/_chat/AgencyChatLauncherMount.tsx` — the agency-level (directory) mount of the same launcher.
- `web/src/app/t/[profileCode]/_chat/MiniChatPanel.tsx` — the panel. `type Stage = "intro" | "gate" | "thread"` (line 53); `stage` initialized from `existingInquiryId` (line 108); `inquiryId` state (line 96). `handleFirstSend()` (line 360) gates name/email then calls `onStartInquiry()`. `expanded` toggles `ExpandedChatLayout`.
- `web/src/app/t/[profileCode]/_chat/MiniChatPanelColumn.tsx` — single-column body (header, message stream, composer).
- `web/src/app/t/[profileCode]/_chat/ExpandedChatLayout.tsx` — opt-in desktop two-pane (`EXPANDED_WIDTH = min(720px, 100vw-32px)`, left pane 232px).
- `web/src/app/t/[profileCode]/_chat/GuestDetailChips.tsx` + `GuestDetailChipEditor.tsx` — the LIVE always-on chip row above the composer (Date · Location · Headcount · Type · Budget).
- `web/src/app/t/[profileCode]/_chat/MiniChatGateForm.tsx` — the name/email gate form (reused as `ContactCard`).
- `web/src/app/t/[profileCode]/_chat/mini-chat-styles.ts` — design tokens `C.*` (lines 19–68), `FONT`, `readableOn()` (lines 51–69), `expandedShellStyle`. **House rule in-file: no hardcoded gold/rust; the one warm value is the injected `accentColor`.**

### Form / intent
- `web/src/components/inquiry/InquiryDrawer.tsx` — the full structured form. Exports (currently local) `Section`, `Field`, `FieldRow`, `Input`, `Textarea`, `Select`, `Pill`, and the section components `RequesterSection`, `ClientSection`, `LocationSection` (+ nested `CityAutocomplete`), `DateSection`, `TalentSection` (`boundToCart`, `onRemoveTalent`), `BudgetSection`, `BriefSection`, `FilesLinksSection`. Cart binding via `useInquiryCart()` mirrors `cart.cartIds` into `talent.selected_ids`.
- `web/src/lib/inquiry/inquiry-intent.ts` — `InquiryIntent` type, `validateIntentForSubmit()`, `intentToSubmitInquiryInput()`, `computeMissingInfoFlags()`.
- `web/src/lib/inquiry/inquiry-intent-engine.ts` — `createInquiryFromIntent()` (validation-gated full create).
- `web/src/app/(workspace)/[tenantSlug]/client/_actions/inquiry-intent-actions.ts` — `submitInquiryNowAction`, `saveDraftAction`.

### Sync layer
- `web/src/app/(workspace)/[tenantSlug]/client/_actions/inquiry-details-actions.ts` — `updateClientInquiryDetailsAction(tenantSlug, inquiryId, patch)` with `UpdateInquiryDetailsPatch = { event_date?, event_location?, message?, quantity? }`. The **client mirror** the guest action copies.
- `web/src/lib/inquiry/inquiry-engine-details.ts` — `updateInquiryDetails(...)` core: mutable-phase check, version lock, diff tracking, emits `inquiry_details_updated`. `DETAIL_FIELD_LABELS` maps column→label.
- `web/src/lib/inquiry/inquiry-events.ts` — `emitStandardEngineEvent(...)` (accepts `actorUserId: null`), fans out to system message + notifications + log.
- `web/src/lib/inquiry/inquiry-system-messages.ts` — `insertSystemMessage(...)` (service-role fallback on RLS 42501).
- `web/src/hooks/use-inquiry-realtime.ts` — watches `inquiries`, `inquiry_messages`, `inquiry_offers`, `booking_transactions`; debounced 350ms `router.refresh()`. The reuse target for inbound sync.
- `web/src/app/t/[profileCode]/_actions/guest-detail-chips-actions.ts` — **THE live structured guest-write path.** `resolveGuestSessionId()` (line 76), ownership-loaded inquiry (line 136 selects `interpreted_query`), `captureGuestChip(input)` (line 323) read-modify-writes `interpreted_query` + flat columns, emits a bubble/thread note. Handles `date`/`location`/`headcount`/`event_type`/`budget` kinds. **No migration; cookie-gated service-role.**
- `web/src/app/t/[profileCode]/_actions/guest-chat-actions.ts` — `startGuestChatInquiry` (full create at gate), `resolveGuestContext()`, `loadOwnedInquiry(...)`.

### Cards / cart / photos
- `web/src/lib/talent-cards/use-inquiry-cart.ts` — `useInquiryCart()`: `cartIds` (line 132), `setInCart(talent, inCart, sourcePage)` (line 76; calls `inquiryModal.bumpSaveCue()` on add at line 99), `toggleInCart`, `isInCart`, `isPending`, `openInquiry`.
- `web/src/lib/talent-cards/use-favorites.ts` — favorites hook (LEAVE UNTOUCHED).
- `web/src/components/directory/directory-inquiry-modal-context.tsx` — context with `saveCue` counter + `bumpSaveCue()` (line 37). `bumpSaveCue` carries no rect today.
- `web/src/components/directory/directory-discovery-header-actions.tsx` — header cart/favorites buttons; the `cueRing` flash hardcodes `--impronta-gold` (lines 105/113/118/141/158/163).
- `web/src/components/talent-cards/talent-card-actions.tsx` — per-card Favorite + Inquire buttons (optimistic).
- `web/src/app/(workspace)/[tenantSlug]/_data-bridge/talent-card-thumbs.ts` — `loadTalentCardThumbs()` with `THUMB_RANK` `card(0)→hero(1)→public_watermarked(2)→gallery(3)→original(4)`.
- `web/src/lib/inquiry/guest-chat-contract.ts` — `GuestInquirySummary` (has `talentPortraitUrl`), `StartGuestChatInput`, result types.

### Data model
- `public.inquiries` — `contact_name`/`contact_email` NOT NULL; `interpreted_query` JSONB holds the full structured intent; flat columns `event_date`, `event_location`, `quantity`, `message`, `company`, logistics notes, etc.; `guest_session_id` for guest ownership; `version` for optimistic lock.
- RLS allows INSERT with `client_user_id IS NULL` (guest); guest reads/writes go through cookie-gated service-role at the app layer.
- `public.guest_sessions` (`session_key` unique). `public.inquiry_messages` (`thread_type`, `message_kind`, `card_payload`). `inquiry_events` (write only via SECURITY DEFINER).
- **Migration required for this work: NO.** `interpreted_query` already holds all rich fields; flat columns exist; service-role guest patch is an established pattern.

---

## 3 · TARGET ARCHITECTURE + DATA-FLOW DIAGRAM

The launcher pill = the cart. The panel = the inquiry. One `InquiryIntent` draft + one `inquiryId` in `MiniChatPanel`, fed by `useUnifiedInquiry`. Structured edits (chat OR form) route through one patch action; that action writes the record and emits one thread note; realtime fans the change to every role.

```
 ┌────────────────────────────── Directory page (Impronta host) ──────────────────────────────┐
 │                                                                                              │
 │   TalentCard  ──"Inquire"──▶ cart.setInCart(talent,true) ──▶ savedIds += id                  │
 │     │                                    │                                                   │
 │     │ getBoundingClientRect()            └─▶ animateAdd({fromRect,portraitUrl,id}) (context) │
 │     ▼                                                          │                             │
 │   FlyingAvatar (body portal, z 2147483001) ───────────────────┘                             │
 │                                                                                              │
 │   "Message Impronta" launcher pill ◀── cartTalents (derived from cartIds + thumbs) ──────────│
 │      [glyph] (•)(•)(•)+N  Message Impronta      ← LauncherAvatarStack + X-to-remove          │
 │           │ click                                                                            │
 │           ▼                                                                                  │
 │   MiniChatPanel  ── useUnifiedInquiry { inquiryId, intent, patch(section,value) } ───────────│
 │      Guided stream  +  GuestDetailChips row  +  AllDetailsSheet (form parity)                │
 └──────────────────────────────────────────────┬───────────────────────────────────────────-─┘
                                                 │ guest OR client edits a field
                                                 ▼
        ┌──────────────── patch action (cookie-gated, service-role) ─────────────────┐
        │  ensureGuestChatInquiry()  → creates early partial row (first commit)        │
        │  captureGuestChip(extended) → read-modify-write interpreted_query + flat cols│
        │                             → emitStandardEngineEvent(inquiry_details_updated)│
        └───────────────┬─────────────────────────────────┬───────────────────────────┘
                        │ UPDATE inquiries                 │ INSERT inquiry_messages (system note)
                        ▼                                  ▼
            ┌──────────────────── postgres_changes (tenant-scoped) ────────────────────┐
            │                use-inquiry-realtime → debounced 350ms router.refresh()     │
            └───────┬───────────────────────┬───────────────────────┬──────────────────┘
                    ▼                        ▼                       ▼
            Admin Messages           Client dashboard          Talent workspace
         (AdminInquiryDetail)      (ClientMessagesShell)        (TalentInquiry)
            re-render +               re-render +                 re-render +
            thread note shows         thread note shows          thread note shows
                    ▲                        ▲                       ▲
                    └─── admin/talent edit also patches the SAME record ──┘
                         (their existing edit actions) → flows back to guest panel chip
```

Inbound on the guest side: `MiniChatPanel` subscribes via `use-inquiry-realtime`; a remote edit refreshes server data, the matching chip/card updates in place with an accent flash (suppressed under reduced-motion) plus a system note ("The agency updated the location.").

---

## 4 · UX/UI DESIGN SPEC (consolidated, verbatim)

This is the binding UX. Keep every value exactly. Colors are `accent`/`accentInk`/`C.*` only, except the neutral ink/white system chips (X button, +N chip) which are intentionally theme-independent.

### A) THE AVATAR STACK ON THE LAUNCHER PILL

**A.1 Data source and photo resolution.** Avatars driven by `cart.cartIds` from `useInquiryCart()` (`use-inquiry-cart.ts:33`, `cartIds` at line 132) — the same array the form binds to (single source of truth). Launcher receives a derived prop `cartTalents: AvatarStackItem[]`:
```ts
type AvatarStackItem = { talentProfileId: string; displayName: string; portraitUrl: string | null };
```
`portraitUrl` resolved via `loadTalentCardThumbs()` rank order `card(0) → hero(1) → public_watermarked(2) → gallery(3) → original(4)`, computed at the directory page level and passed down so the avatar is byte-identical to the card the client clicked. Fallback: `GuestInquirySummary.talentPortraitUrl`.

**A.2 Face-focus circular crop.** No focal-point data exists in `media_assets` (confirmed). Calibrated fallback:
```css
.uic-avatar { width:36px; height:36px; border-radius:50%; overflow:hidden; background:#eef1f5; /* C.surfaceCool — never an empty box */ }
.uic-avatar img { width:100%; height:100%; object-fit:cover; object-position:50% 20%; display:block; }
```
`object-position: 50% 20%`: portrait thumbs put the face in the upper third; 20% from top centers the face in the 1:1 circle without clipping the chin. Element: raw `<img loading="eager" decoding="async" alt={displayName}>` (tiny known set; `next/image` not used in the rail).

**A.3 Geometry** (insertion point: between glyph and label, `TalentProfileChatLauncher.tsx:134`).
- Avatar diameter: 36px desktop / 32px mobile.
- Overlap: `margin-left:-12px` on every avatar after the first (desktop); `-11px` mobile. Container `display:flex; align-items:center`.
- Stacking: newest on top. `z-index:${total - index}` with newest rendered first.
- Ring: `box-shadow: 0 0 0 2px ${accentInk}` + inner `border:1.5px solid #ffffff` + rail-level `filter: drop-shadow(0 3px 6px rgba(20,24,31,0.22))`.
- Pill adaptation when stack non-empty: pill height stays 52px; the rail is absolutely positioned breaking the **top edge**: `position:absolute; top:-16px; right:12px; flex-direction:row-reverse` so the newest sits rightmost and fully exposed. Fixed wrapper gets `margin-top:18px` so overhanging circles never clip the viewport.
- Flying-clone z-index: `2147483001`.

**A.4 The X remove control.**
- Size: 16px visible circle (18px mobile). Position: `top:-4px; right:-4px` of each avatar wrapper (`position:relative`).
- Hit area: 28px desktop / 40px mobile via transparent `::before { inset:-6px }`.
- Visual: background `#16181d` (ink), X glyph 9px SVG `stroke-width:2` color `#ffffff`, `border:1.5px solid #ffffff`. Hover `transform:scale(1.12)`; active `scale(0.92)`.
- Visibility: the X is **always visible**. On fine pointers it rests at `opacity:0.85`, `1.0` on hover/focus; on coarse pointers always `1.0`.
- a11y: `<button aria-label="Remove {displayName} from your inquiry">`, in tab order after its avatar; Enter/Space/Delete/Backspace removes.
- Action: `cart.setInCart({ talentProfileId, profileCode: "" }, false, sourcePage)` (real signature, `use-inquiry-cart.ts:76`) and, if an inquiry row exists, patch `talent.selected_ids` via the chip-capture action (A.8/§7). Single source → propagates to form + rail instantly.

**A.5 ADD bounce / fly animation (card → pill).** Trigger: card add → `cart.setInCart(...)` succeeds → existing `bumpSaveCue()` (`directory-inquiry-modal-context.tsx:37`), extended via a new `animateAdd({ fromRect, portraitUrl, talentProfileId })` method on the context (`bumpSaveCue` kept for back-compat).
- Phase 1 — flight (`FlyingAvatar`, body-portal, `z-index:2147483001`), Web Animations API: duration **520ms**, easing `cubic-bezier(0.22, 1, 0.36, 1)`; arc keyframe at `offset:0.5` lifted `-40px` in Y beyond linear interp; scale `64px → 36px`; opacity `0 → 1` by `offset:0.08`.
- Phase 2 — landing bounce (on the real rail avatar, mounted at `onfinish`):
```css
@keyframes uic-land { 0%{transform:scale(0.42)} 45%{transform:scale(1.18)} 70%{transform:scale(0.94)} 100%{transform:scale(1)} }
.uic-avatar--landing { animation: uic-land 360ms cubic-bezier(0.34,1.56,0.64,1) both; }
```
The flying clone unmounts the instant the real avatar mounts. Pill sympathetic pulse: `scale(1 → 1.02 → 1)` over 300ms `cubic-bezier(0.22,0.61,0.36,1)`. Total perceived ~560ms travel overlapping into 360ms bounce.

**A.6 Remove animation.**
```css
@keyframes uic-leave { 0%{transform:scale(1);opacity:1} 100%{transform:scale(0.4) translateY(6px);opacity:0} }
.uic-avatar--leaving { animation: uic-leave 200ms cubic-bezier(0.4,0,1,1) both; pointer-events:none; }
```
After 200ms unmount; siblings reflow over 180ms (`transform: translateX`, FLIP-lite, then commit).

**A.7 Overflow (+N).** Max **3** desktop / **2** mobile. Beyond that, a counter chip in the last slot: 36px circle, `background:#16181d`, `color:#ffffff`, `+{count - visible}`, `font:600 12px`. Same ring/overlap. No X. Tapping deep-links the panel to the **Talent** section of the All-details sheet (B.5). aria: `"Show all {N} selected talent"`.

**A.8 Empty state.** `cartIds.length === 0` → rail renders nothing; pill reverts to base `[glyph] Message {agencyName}`. No empty ring, no placeholder dot. Missing portrait → initials medallion (`background:accent; color:accentInk; font:600 13px`), never a box.

**A.9 Hover / press / mobile.** Pill hover `translateY(-1px)`, shadow deepens, 140ms; press `scale(0.98)`. Avatar hover (desktop) `translateY(-2px) scale(1.05)`, z-raised, tooltip (`role="tooltip"`, ink bg, white text, 6px radius, `font:500 12px`) below the rail. Mobile: 32px avatars, `-11px` overlap, X always visible at 18px/40px hit, max 2 + counter, rail `top:-14px`; pill label may abbreviate to "Message" with full name in `aria-label`; tooltips suppressed; long-press (450ms) opens the Talent sheet section.

**A.10 Reduced motion** (`prefers-reduced-motion: reduce`). No flight, no arc, no bounce, no pill pulse. New avatar appears `opacity 0→1 + scale 0.9→1`, 180ms ease. Guard the WAAPI call behind `matchMedia('(prefers-reduced-motion: reduce)').matches` so no body-portal element is created. Remove = instant 120ms fade, no translate. A visually-hidden `aria-live="polite"` region announces `"{name} added to your inquiry. {N} selected."` / `"{name} removed. {N} selected."` (motion substitute for everyone).

**A.11 Theming via accent token.** Ring = `accentInk`; initials medallion = `accent`/`accentInk`; pill = `accent`/`accentInk`. +N chip and X stay neutral ink/white. No literal hex in components except the neutral ink/white system chips and the `C.*` tokens. **Required fix:** the `cueRing` flash hardcodes `--impronta-gold` in `directory-discovery-header-actions.tsx` — swap to `var(--accent)`.

**A.12 Accessibility (rail).** `<ul role="list">`; each item `<li>` containing an avatar `<button aria-label="{name}, selected. Open inquiry.">` then a nested remove `<button>`. Roving `tabindex`, arrow-left/right between avatars, Delete/Backspace removes the focused one. Avatar focus = `outline:2px solid var(--accent); outline-offset:2px`.

### B) THE UNIFIED CHAT + FORM SURFACE

**B.0 Primary pattern (committed).** Guided conversational stream is primary. Structured fields surfaced two ways: (1) the **`GuestDetailChips` row** above the composer (Date · Location · Headcount · Type · Budget) — live in code today; (2) an **"All details" sheet** (upgrade of the existing "Add more details →" escalation) that slides up in-panel and exposes the full section set. Rejected: rebuilding `InquiryDrawer`'s 8 sections inside the corner panel. The existing `expanded` two-pane (`ExpandedChatLayout`, `EXPANDED_WIDTH = min(720px, 100vw-32px)`) is kept as **opt-in desktop power mode only**.

**B.1 Surface states.** `stage: "intro" | "gate" | "thread"` exists (`MiniChatPanel.tsx:53`). Layered with `expanded`.

| State | Condition | Layout |
|---|---|---|
| Collapsed chat | `open && !expanded` | Single column, 392px, `MiniChatPanelColumn`. Rail on the pill. |
| Talent-pick first-run | `open && cartIds.length===0 && stage==="intro"` | Single column; first stream card is `TalentPickCard` (B.2). |
| Guided composer | `open && (cartIds.length>0 || stage==="thread")` | Single column; chips row + guided cards + system notes. |
| Power two-pane | `open && expanded` (desktop opt-in) | `ExpandedChatLayout`: chat right, All-details left, both always-on. |

Opening behavior: avatars present → open guided composer, conversation preloaded, Talent prefilled from `cartIds`; no avatars → open talent-pick-first.

**B.2 Talent-pick-first empty state.** Panel opens on an assistant greeting (system voice, `C.systemInk`, 28px agency monogram circle, no box):
> "Hi, I'm here to help you find the right talent. Want someone specific, or should we recommend a fit?"

`TalentPickCard` — two stacked option rows (52px, `border-radius:12px`, `border:1px solid C.border`, `background:C.surfaceFaint`, hover `C.surfaceCool`):
1. **"Pick specific talent"** / sub "Search the roster by name." → expands inline `SearchTalentField` (B.3) in the same card.
2. **"Let the agency recommend"** / sub "Tell us what you need and we will suggest a fit." → sets `talent.selection_mode = "agency_recommends"`, advances the stream to the Brief card.

Neither preselected; exactly one required to proceed. Choice emits a gentle system note (B.7).

**B.3 SearchTalentField (inline roster search).** Input 44px, `border-radius:10px`, `border:1px solid C.border`, leading magnifier, placeholder "Search talent by name". Debounce 250ms against roster. Results: `max-height:220px` scroll list, rows = 40px face-crop (A.2 technique) + name + category, hit 48px, **Add** affordance. Adding → `cart.setInCart(talent, true, sourcePage)` → fires the fly-to-rail animation (A.5; rail visible above the open panel) + system note "{name} added." Selected talent show as removable chips (32px face + name + X) above the input. Empty: "No talent match that name. Try another, or let the agency recommend."

**B.4 Save / sync affordance.** One inquiry record; structured edits autosave via the existing chip-capture pattern (cookie-gated service-role write to `interpreted_query` + flat columns; no allowlist/RLS/migration change). Extend with `talent` and `brief` keys.
- **Field-level micro-status** on each chip/card footer: dot `C.inkDim` (unsaved) → 12px spinner "Saving…" → `accent` check "Saved" (auto-hide 1600ms).
- **Panel-level sync bar** (sticky, 28px, only when active): hidden (clean) / "Saving…" (`C.inkDim` + spinner) / "Saved" (`C.inkMuted` + check, auto-hide) / "Couldn't save. Retry" (`C.danger`, clickable retry; affected card gets `1px solid C.danger` left border, stays editable). Handles version-conflict returns.
- **Inbound live sync:** subscribe via `use-inquiry-realtime` (350ms debounced `router.refresh()`). Remote edit → matching chip/card updates in place with a brief accent flash (`background: accent@8% → transparent`, 600ms; suppressed under reduced-motion) + system note "The agency updated the location." Propagates across guest / client dashboard / admin Messages / talent workspace.

**B.5 "All details" sheet (jump-to-any-section, free edit).** Header **"All details"** button (36px, `border-radius:18px`, `border:1px solid C.border`, `color:C.inkMuted`, list icon) → sheet slides up over the stream (not the header): `translateY(100%) → 0`, 260ms `cubic-bezier(0.22,0.61,0.36,1)`, `background:C.surface`, grabber handle on mobile. Contents = collapsible accordion (one-open-at-a-time), reusing the live chip editors plus the extra sections from `InquiryDrawer.tsx`:
1. **Your info** (`RequesterSection`) — name required, email/phone
2. **Who is this for** (`ClientSection`)
3. **Where** (chip editor / `LocationSection` + `CityAutocomplete`)
4. **When** (chip editor / `DateSection`)
5. **Talent** (`TalentSection`, `boundToCart`, `onRemoveTalent` = cart removal)
6. **Budget** (chip editor / `BudgetSection`)
7. **What you need / brief** (`BriefSection` with AI draft/polish)
8. **Files and references** (`FilesLinksSection`)

Each section header status pill: "Added" (`accent` + check) / "Optional" (`C.inkDim`) / "Needed" (`C.danger`). Editing here writes the same record and emits the same system note. "Back to chat" or swipe-down closes. The +N chip and rail avatars deep-link here scrolled to Talent.

**B.6 Progressive disclosure / guided order.** Assistant requests one inline card at a time; every optional card has "Skip for now":
1. **Talent** (pick or recommend) — always first (B.2)
2. **What you need (brief)** — `BriefSummaryCard` (textarea + "Write a brief for me" / "Polish this brief")
3. **Where** — `WhereCard` (city autocomplete + "Not sure yet" chip)
4. **When** — `WhenCard` (date + "Exact date" / "Flexible" / "Not sure yet")
5. **Budget** — `BudgetCard` (chips, default "Let the agency recommend")
6. **Your info** — `ContactCard` (gate moment, B.9)
7. **Files** — `FilesCard` (optional)

A "Add more details" chevron at stream bottom surfaces not-yet-requested sections on demand; jumping ahead via the sheet makes the stream skip satisfied cards.

**B.7 Structured edits as gentle system notes.** Reuse the existing `inquiry_details_updated` system-message path (`emitStandardEngineEvent` → `insertSystemMessage`). Render in the guest stream as centered, full-width, no-bubble notes: `font:500 12px`, `color:C.systemInk (#6b7280)`, 0.5px hairline above, tiny leading field icon. The chip-capture action must emit this event so all four surfaces stay coherent.
- Self-authored: "Location set to Tulum." · "Event date set to Aug 14." · "Added Sofia to your inquiry." · "Brief updated." · "Budget: you asked the agency to recommend."
- Remote: "The agency updated the brief."
- Microcopy maps `DETAIL_FIELD_LABELS` to client-friendly phrasing; never "buyer", never em dashes.

**B.8 Power two-pane (desktop opt-in).** Existing expand control toggles `ExpandedChatLayout`: right pane = chat stream (unchanged), left pane = the All-details accordion always-open (same record, same autosave, same notes). Width `min(720px, 100vw-32px)`, left pane `232px`. Only place two-pane is used.

**B.9 Email / name capture moment.** `inquiries` requires `contact_name` + `contact_email` NOT NULL. Honor "chat first, fill slowly": the guest picks talent and answers several cards before contact is required. Capture is triggered at the **first of**: (a) tapping "Send to agency", or (b) brief + one logistics card filled. Reuses the `intro → gate → thread` machine. `ContactCard` (inline, non-modal, top of stream — reuses the `gate` stage + `MiniChatGateForm` logic):
> "Almost there. Where should the agency reach you?"
Fields: Name (required), Email (required, validated with `EMAIL_RE`), Phone (optional). Helper: "We will only use this to follow up on your inquiry." Hidden honeypot preserved. Submit → existing `startGuestChatInquiry` payload, flushing all collected structured answers into `interpreted_query` + flat columns in one patch; converts to live `thread`. Inline validation via existing `gateEmailNotice`/`gateEmailBlocksSubmit`.

**B.10 Inline editability.** Every set value renders as an editable inline card (not static text): tapping reopens its control in place. Edits autosave (B.4) + emit a note (B.7). Holds in both stream and sheet.

**B.11 Full microcopy** (no em dashes; "client" never "buyer"):
- Launcher empty: **"Message Impronta"** (`Message {agencyName}`)
- Greeting: "Hi, I'm here to help you find the right talent. Want someone specific, or should we recommend a fit?"
- Pick: **"Pick specific talent"** / "Search the roster by name." · **"Let the agency recommend"** / "Tell us what you need and we will suggest a fit."
- Search placeholder: "Search talent by name" · Added: "{name} added." · Removed: "{name} removed."
- Brief: "Tell us about the project." · "Write a brief for me" · "Polish this brief"
- Where: "Where is this happening?" · chip "Not sure yet"
- When: "When is it?" · chips "Exact date" / "Flexible" / "Not sure yet"
- Budget: "What is your budget?" · default chip "Let the agency recommend"
- Contact: "Almost there. Where should the agency reach you?" · "We will only use this to follow up on your inquiry."
- Sync: "Saving…" / "Saved" / "Couldn't save. Retry"
- All details button: "All details" · statuses "Added" / "Optional" / "Needed"
- Submit: **"Send to agency"** · Success: "Your inquiry is in. The agency will reply soon." · Incomplete tooltip: "Add your name and either a brief or a talent to send."
- Composer placeholder (with talent): "Ask about availability, rates, or anything else." · (recommend mode): "Tell us about your event and what you are looking for."
- Collapse aria: "Minimize to chat" · Expand aria: "Open the full inquiry composer"
- Empty roster search: "No talent match that name. Try another, or let the agency recommend." · Skip: "Skip for now"

### C) COMPONENT BREAKDOWN (named components + states)

**Launcher / rail** (`web/src/app/t/[profileCode]/_chat/`)
1. `TalentProfileChatLauncher` (modify) — new props `cartTalents`, `onRemoveTalent(id)`, `onOpenToTalentSection()`. States: empty · 1-3 avatars · overflow · hover · press · flying-add · reduced-motion · mobile.
2. `LauncherAvatarStack` (new) — `<ul>` of avatars + X + +N. States: 1/2/3 · overflow · per-avatar hover · removing · empty (null).
3. `AvatarStackItem` (new) — face-crop wrapper + `RemoveAvatarButton`. States: loaded · loading · initials-fallback · hover · focus · landing · leaving.
4. `RemoveAvatarButton` (new) — the X. States: rest · hover-scale · active · focus-ring. Coarse-vs-fine visibility branch.
5. `OverflowCounterChip` (new) — +N. States: rest · hover · focus. Opens sheet→Talent.
6. `FlyingAvatar` (new, body-portal) — card→pill clone. States: traveling · landed (unmount) · reduced-motion (null).
7. `useFlyToRail` (new hook) — captures `fromRect`, computes arc, runs WAAPI, fires `onLanded`; reads `prefers-reduced-motion`.

**Panel shell**
8. `MiniChatPanel` (modify) — orchestrates `intro|gate|thread` + guided stream + chips + sheet + sync bar; owns the single `InquiryIntent` draft + debounced autosave (350ms). States: loading · talent-pick · guided · gating · thread · syncing · error · offline.
9. `InquiryStream` (new) — interleaves bubbles, section cards, system notes. States: empty(talent-pick) · guided · complete.
10. `GuestDetailChips` (reuse, live) — extend with `talent`/`brief` kinds.
11. `AllDetailsSheet` (new) — slide-up. States: closed · open · scrolled-to(section).
12. `DetailsAccordionSection` (new wrapper) — one-open; status added/optional/needed.
13. `SyncStatusBar` (new) — hidden · saving · saved · error/offline.
14. `SystemNote` (new) — self-authored · remote · reduced-motion (no flash).

**Guided cards** (each: prompt · editing · filled · skipped · saving · saved · error)
15. `TalentPickCard` — pick-specific · recommend · undecided
16. `SearchTalentField` (extract from `TalentSection`) — idle · typing · results · empty · selected-chips
17. `BriefSummaryCard` (wraps `BriefSection`) — + ai-generating · ai-polishing
18. `WhereCard` / `WhenCard` / `BudgetCard` (wrap respective sections)
19. `ContactCard` (wraps `MiniChatGateForm`/`RequesterSection`) — prompt · invalid-email · valid · submitting · created; hosts honeypot
20. `FilesCard` (wraps `FilesLinksSection`) — empty · staged · uploading · error

**Data / sync**
21. `useUnifiedInquiry` (new hook) — single `InquiryIntent` + `inquiryId`; `patch(section,value)` debounced via the chip-capture action (extend `captureGuestChip`; add `ensureGuestChatInquiry`), both cookie-gated via `resolveGuestSessionId`, both emit `inquiry_details_updated`. Reconciles inbound via `use-inquiry-realtime`.
22. `useInquiryCart` (reuse) — `cartIds` ↔ `selected_ids`; `setInCart(talent, bool, sourcePage)` on remove.
23. Context extension — `directory-inquiry-modal-context.tsx`: add `animateAdd({ fromRect, portraitUrl, talentProfileId })` alongside `bumpSaveCue`.

**Reused unchanged** (`InquiryDrawer.tsx`): `Section`, `Field`, `FieldRow`, `Input`, `Textarea`, `Select`, `Pill`, `RequesterSection`, `ClientSection`, `LocationSection` (+ `CityAutocomplete`), `DateSection`, `TalentSection`, `BudgetSection`, `BriefSection`, `FilesLinksSection`.

### Exact-value quick reference

| Property | Value |
|---|---|
| Avatar diameter (desktop/mobile) | 36px / 32px |
| Avatar overlap | -12px / -11px |
| Avatar ring | 0 0 0 2px accentInk + inner 1.5px #fff |
| Max avatars before +N | 3 / 2 |
| X size / hit area | 16px / 28px (desktop), 18px / 40px (mobile) |
| Face crop object-position | 50% 20% |
| Fly | 520ms cubic-bezier(0.22,1,0.36,1), arc -40px apex, scale 64→36 |
| Landing bounce | 360ms cubic-bezier(0.34,1.56,0.64,1), scale 0.42→1.18→0.94→1 |
| Pill pulse | 300ms cubic-bezier(0.22,0.61,0.36,1), scale 1→1.02→1 |
| Remove | 200ms cubic-bezier(0.4,0,1,1), scale→0.4 + fade |
| Reduced-motion add | 180ms opacity 0→1 + scale 0.9→1 |
| Rail position | absolute, top:-16px, right:12px, row-reverse |
| Flying clone z-index | 2147483001 |
| Panel width (collapsed) | 392px desktop, 100dvw×92dvh mobile |
| Expanded two-pane | min(720px,100vw-32px); left pane 232px |
| Autosave debounce / realtime | 350ms / ≤350ms |
| Sheet slide | 260ms cubic-bezier(0.22,0.61,0.36,1) |
| Border radius (pill/avatar/sheet/shell) | 26px / 50% / top-16px / 18px |
| Standard / emphasized / exit easing | cubic-bezier(0.22,0.61,0.36,1) / (0.34,1.56,0.64,1) / (0.4,0,1,1) |

---

## 5 · DATA CONTRACTS (TS types/props to add or change)

### 5.1 `web/src/lib/inquiry/guest-chat-contract.ts`
Add:
```ts
export type AvatarStackItem = {
  talentProfileId: string;
  displayName: string;
  portraitUrl: string | null;
};

// New chip kinds for the extended capture action.
export type GuestChipKind =
  | "date" | "location" | "headcount" | "event_type" | "budget"   // existing
  | "talent" | "brief";                                           // new

export type EnsureGuestInquiryInput = {
  tenantSlug: string;
  talentProfileId?: string | null;
  talentProfileCode?: string | null;
  sourcePage: string;
};
export type EnsureGuestInquiryResult =
  | { ok: true; inquiryId: string }
  | GuestChatFailure;
```

### 5.2 `web/src/app/t/[profileCode]/_chat/TalentProfileChatLauncher.tsx` (props extension)
```ts
type TalentProfileChatLauncherProps = {
  // ...existing...
  cartTalents: AvatarStackItem[];                 // NEW — drives the rail
  onRemoveTalent: (talentProfileId: string) => void; // NEW
  onOpenToTalentSection?: () => void;             // NEW — +N / overflow deep-link
};
```

### 5.3 `web/src/components/directory/directory-inquiry-modal-context.tsx` (context extension)
```ts
type AnimateAddPayload = { fromRect: DOMRect; portraitUrl: string | null; talentProfileId: string };
type DirectoryInquiryModalContextValue = {
  // ...existing (saveCue, bumpSaveCue, ...)...
  animateAdd: (payload: AnimateAddPayload) => void; // NEW — bumpSaveCue stays for back-compat
  lastAnimateAdd: AnimateAddPayload | null;         // NEW — consumed by FlyingAvatar host
};
```

### 5.4 `useUnifiedInquiry` hook contract (new file, see §8 P0-T4)
```ts
type UnifiedInquiryPatch =
  | { kind: "talent"; selectedIds: string[]; selectionMode?: "i_know_who" | "agency_recommends" }
  | { kind: "brief"; summary: string }
  | { kind: "date"; status?: string; eventDate?: string | null }
  | { kind: "location"; status?: string; city?: string | null; eventLocation?: string | null }
  | { kind: "headcount"; count: number | null }
  | { kind: "event_type"; eventTypeLabel: string }
  | { kind: "budget"; preference: string; amount?: number | null; currency?: string };

type UseUnifiedInquiryResult = {
  inquiryId: string | null;
  intent: InquiryIntent;
  patch: (p: UnifiedInquiryPatch) => Promise<void>;   // debounced 350ms; ensures row first
  syncState: "idle" | "saving" | "saved" | "error";
  fieldState: Record<string, "idle" | "saving" | "saved" | "error">;
};
```

### 5.5 Cart-with-photo ref type (already exists; confirm shape)
`TalentCardRef` used by `setInCart` is `{ talentProfileId: string; profileCode: string; displayName?: string }`. The rail's `AvatarStackItem` is derived at the page level by joining `cartIds` with `loadTalentCardThumbs()` output — no change to `TalentCardRef`.

---

## 6 · BACKEND SPEC

### 6.1 Extended structured patch action (guest-safe)
**File:** `web/src/app/t/[profileCode]/_actions/guest-detail-chips-actions.ts`
**Reuse, do not fork.** The existing `captureGuestChip(input)` is the action; extend its `kind` union with `talent` and `brief`.
- **Signature (unchanged shape):** `captureGuestChip(input: GuestChipInput): Promise<GuestChipResult>` where `GuestChipInput` gains `kind: "talent" | "brief"` cases.
- **Guest-cookie gate:** `resolveGuestSessionId()` (line 76) reads the cookie/header, idempotently ensures the `guest_sessions` row, returns `guestSessionId`. The action then loads the inquiry (line 136 select includes `interpreted_query`, `guest_session_id`) and rejects unless `inquiry.guest_session_id === guestSessionId`. Service-role write re-asserts `.eq("guest_session_id", guestSessionId)`.
- **Fields it accepts (new kinds):**
  - `talent`: writes `interpreted_query.talent.selected_ids` (string[]) and `interpreted_query.talent.selection_mode`; no dedicated flat column (talent links handled at full-submit). System note "Added {name} to your inquiry." / "Removed {name} from your inquiry."
  - `brief`: writes `interpreted_query.brief.summary` + flat `message` + flat `raw_ai_query`. System note "Brief updated."
- **Engine reused:** the same read-modify-write merge helper (line 187) for `interpreted_query`; the same emit path.
- **System-message/event emitted:** `emitStandardEngineEvent(... type: ENGINE_EVENT_TYPES.INQUIRY_DETAILS_UPDATED, actorUserId: null, systemMessage: { threadType: "private", eventType: "inquiry_details_updated", body })`. This is what makes admin/client/talent see it live.

### 6.2 Early-partial inquiry creation
**File:** `web/src/app/t/[profileCode]/_actions/guest-chat-actions.ts` (new export) — `ensureGuestChatInquiry(input: EnsureGuestInquiryInput): Promise<EnsureGuestInquiryResult>`.
- Resolve guest context (cookie). If an owned non-terminal inquiry already exists for this guest+tenant(+talent), return its id (idempotent).
- Otherwise create a minimal row via service-role insert into `inquiries` with: `tenant_id`, `client_user_id: null`, `guest_session_id`, `status: 'new'` (the existing initial status), `source_page`, `interpreted_query: { schema_v1 seed }`, and **placeholder contact values** to satisfy NOT NULL: `contact_name = 'Guest'`, `contact_email = 'pending-{guestSessionId}@guest.impronta'` (clearly synthetic, overwritten by `ContactCard`). It does **not** call `createInquiryFromIntent` (which is validation-gated); it is a direct guarded insert mirroring the legacy guest path.
- **Trigger timing:** called by `useUnifiedInquiry.patch(...)` lazily on the FIRST structured commit (first talent add OR first chip), never on bare panel open. This keeps "create early" without creating empty rows for browsers who only peek.
- On `ContactCard` submit, the real name/email overwrite the placeholders via the same patch path (a `requester`/contact chip), and `startGuestChatInquiry` is NOT re-run if a row already exists — instead the existing row is promoted (set `contact_name`, `contact_email`, send first message). Adjust `MiniChatPanel.handleFirstSend` to detect an existing early row and patch-then-message rather than create.

### 6.3 Migration required?
**NO.** Definitive. `interpreted_query` (JSONB) already holds all rich fields; flat columns (`event_date`, `event_location`, `quantity`, `message`, `raw_ai_query`, `company`) exist; guest cookie-gated service-role writes are an established pattern; RLS already permits `client_user_id IS NULL` inserts; the system-message/event path already accepts `actorUserId: null`. No DDL, no RLS change, no allowlist change.

---

## 7 · PHASED, MULTI-TASK EXECUTION PLAN

Conventions: stable task ids `P{phase}-T{n}`. Each task: goal · files · change · deps · acceptance · QA. QA host = the Impronta proxy at `http://impronta.lvh.me:3114`; directory at `/directory`. "Admin reflects" = open admin Messages for the same inquiry in a second tab/session and confirm the change appears within ~1s. Run `rm -rf web/.next` first if dev wedges. tsc+lint gate before each commit.

Tasks marked **[PARALLEL]** have no intra-phase dependency on each other and can be split across agents.

### Phase 0 — Scaffolding / contracts

**P0-T1 [PARALLEL] — Contract types.**
- Goal: land all new TS types so other tasks compile against them.
- Files: `web/src/lib/inquiry/guest-chat-contract.ts`.
- Change: add `AvatarStackItem`, `GuestChipKind` (with `talent`/`brief`), `EnsureGuestInquiryInput`, `EnsureGuestInquiryResult` (§5.1).
- Deps: none.
- Acceptance: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` clean.
- QA: type-only; no runtime.

**P0-T2 [PARALLEL] — Accent-token fix for cueRing.**
- Goal: remove the hardcoded gold (house rule).
- Files: `web/src/components/directory/directory-discovery-header-actions.tsx`.
- Change: replace every `--impronta-gold` / `--impronta-gold-border` occurrence (lines ~105/113/118/141/158/163) with `var(--accent)` / a neutral accent-derived border.
- Deps: none.
- Acceptance: no `impronta-gold` left in the file; cart/favorites buttons still flash on add.
- QA: on `/directory`, add a talent; the header control flashes with the tenant accent (gold on Impronta because the token resolves to gold, but now token-driven).

**P0-T3 [PARALLEL] — Context `animateAdd` extension.**
- Goal: carry rect+photo for the fly animation.
- Files: `web/src/components/directory/directory-inquiry-modal-context.tsx`.
- Change: add `animateAdd(payload)` + `lastAnimateAdd` state (§5.3); keep `bumpSaveCue`. `setInCart`'s existing `bumpSaveCue()` call (use-inquiry-cart.ts:99) stays; cards will additionally call `animateAdd`.
- Deps: none.
- Acceptance: tsc clean; existing cue still fires.
- QA: add a talent; no regression in the existing cue.

**P0-T4 — `useUnifiedInquiry` hook (skeleton).**
- Goal: the single-record patch hook other phases build on.
- Files: `web/src/app/t/[profileCode]/_chat/use-unified-inquiry.ts` (new).
- Change: implement §5.4 contract; `patch()` lazily calls `ensureGuestChatInquiry` then the extended `captureGuestChip`; debounce 350ms; track `syncState`/`fieldState`; subscribe inbound via `use-inquiry-realtime`. In P0 it can no-op the action calls behind a flag if the backend (P0-T5) is not yet merged — but prefer ordering P0-T5 first.
- Deps: P0-T1, P0-T5.
- Acceptance: tsc clean; hook callable from a test harness.
- QA: deferred to P1.

**P0-T5 — Backend: extend `captureGuestChip` + add `ensureGuestChatInquiry`.**
- Goal: the guest-safe patch + early row.
- Files: `web/src/app/t/[profileCode]/_actions/guest-detail-chips-actions.ts`, `web/src/app/t/[profileCode]/_actions/guest-chat-actions.ts`.
- Change: §6.1 (add `talent`/`brief` kinds + their `interpreted_query`/flat writes + system notes) and §6.2 (`ensureGuestChatInquiry` idempotent early insert with placeholder contact).
- Deps: P0-T1.
- Acceptance: tsc+lint clean; a manual call (temporary dev route or unit) creates a row and a `brief` patch updates `interpreted_query.brief.summary` + `message` and inserts an `inquiry_details_updated` system message. **No migration.**
- QA: via Supabase MCP / SQL, confirm the row + system message after a manual invoke; confirm `inquiry-permissions.ts` is untouched.

### Phase 1 — Vertical slice (prove cross-role live sync)

**P1-T1 — Wire `MiniChatPanel` to `useUnifiedInquiry` + create-early.**
- Goal: panel owns one record; first structured commit creates the early row.
- Files: `web/src/app/t/[profileCode]/_chat/MiniChatPanel.tsx`.
- Change: instantiate `useUnifiedInquiry`; on first date/location chip commit, ensure the early row; route chip edits through `patch()`. Keep gate/thread flow intact.
- Deps: P0-T4, P0-T5.
- Acceptance: setting Date or Location in the guest panel creates the inquiry (if none) and persists.
- QA: `/directory` → open Message Impronta → set a Location chip → confirm a row in Supabase with `interpreted_query.location` + flat `event_location`.

**P1-T2 — In-chat "Inquiry details" mini-view (Date + Location).**
- Goal: minimal structured view inside the panel using the live `GuestDetailChips` row, edits via `patch()`.
- Files: `web/src/app/t/[profileCode]/_chat/GuestDetailChips.tsx`, `GuestDetailChipEditor.tsx`, `MiniChatPanel.tsx`.
- Change: render the chip row; route Date + Location through `useUnifiedInquiry.patch`; show field-level micro-status (B.4).
- Deps: P1-T1.
- Acceptance: editing Date/Location shows "Saving…"→"Saved" and emits a system note in the stream.
- QA: edit each; see the note "Event date set to …" / "Location set to …".

**P1-T3 — Inbound realtime reconcile on the guest panel.**
- Goal: remote edits update the guest chips live.
- Files: `web/src/app/t/[profileCode]/_chat/use-unified-inquiry.ts` (or `MiniChatPanel.tsx`).
- Change: subscribe via `use-inquiry-realtime`; on refresh, re-read details, update chips with accent flash + remote system note (reduced-motion-safe).
- Deps: P1-T1.
- Acceptance: an admin edit to location appears in the guest panel within ~1s with the flash + "The agency updated the location."
- QA: see the test matrix §9 rows 1-2.

**P1 ACCEPTANCE (gate to Phase 2):** Edit Date or Location in the guest chat on `http://impronta.lvh.me:3114/directory` and watch it appear live in **admin Messages** (second session) AND the **client dashboard** view of that inquiry, with a thread note on all surfaces.

### Phase 2 — Full form parity in chat

**P2-T1 [PARALLEL] — Export reusable sections from `InquiryDrawer`.**
- Goal: make sections importable without the drawer chrome.
- Files: `web/src/components/inquiry/InquiryDrawer.tsx` (add named exports for `Section`, `Field`, `FieldRow`, `Input`, `Textarea`, `Select`, `Pill`, `RequesterSection`, `ClientSection`, `LocationSection`, `CityAutocomplete`, `DateSection`, `TalentSection`, `BudgetSection`, `BriefSection`, `FilesLinksSection`).
- Deps: none. Acceptance: importable; drawer unchanged. QA: drawer still renders on the client surface.

**P2-T2 — Extract `SearchTalentField` from `TalentSection`.**
- Goal: standalone roster search for chat + sheet.
- Files: `web/src/components/inquiry/SearchTalentField.tsx` (new), `InquiryDrawer.tsx` (consume the extract).
- Deps: P2-T1. Acceptance: search debounced 250ms, Add wired to `cart.setInCart`. QA: search returns roster, adding fires fly animation (after P3).

**P2-T3 — `AllDetailsSheet` + `DetailsAccordionSection`.**
- Goal: in-panel slide-up form parity (8 sections, one-open accordion, status pills).
- Files: `web/src/app/t/[profileCode]/_chat/AllDetailsSheet.tsx` (new), `DetailsAccordionSection.tsx` (new), `MiniChatPanel.tsx` (host + "All details" button), `mini-chat-styles.ts` (sheet tokens).
- Deps: P2-T1, P1-T1. Acceptance: every section edits the same record via `patch()` and emits a note. QA: edit Budget in the sheet → admin reflects + note in stream.

**P2-T4 — Guided cards (Brief/Where/When/Budget/Files/Contact) + `InquiryStream`.**
- Goal: the conversational sequence (B.6) with skip + inline edit.
- Files: `web/src/app/t/[profileCode]/_chat/InquiryStream.tsx`, `BriefSummaryCard.tsx`, `WhereCard.tsx`, `WhenCard.tsx`, `BudgetCard.tsx`, `FilesCard.tsx`, `ContactCard.tsx` (all new; wrap the P2-T1 sections / reuse `MiniChatGateForm`), `MiniChatPanel.tsx`.
- Deps: P2-T1, P2-T3, P1-T1. Acceptance: each card filled emits a note + autosaves; ContactCard promotes the early row (§6.2). QA: full guided run from pick→send; admin sees every step.

**P2-T5 — Extend `captureGuestChip` callers for `brief`/`talent` in chat.**
- Goal: brief + talent edits in chat persist via the extended action.
- Files: `MiniChatPanel.tsx`, `use-unified-inquiry.ts`.
- Deps: P0-T5, P2-T4. Acceptance: brief edit → `message` + `interpreted_query.brief.summary` updated + note. QA: edit brief in chat → admin Messages shows updated brief + "Brief updated." note.

**P2-T6 — Power two-pane left-pane = All-details.**
- Goal: opt-in desktop power mode (B.8).
- Files: `web/src/app/t/[profileCode]/_chat/ExpandedChatLayout.tsx`, `MiniChatPanel.tsx`.
- Deps: P2-T3. Acceptance: expand shows chat right + always-open accordion left, same record. QA: desktop expand; edit left, see note right.

### Phase 3 — Launcher avatar stack + retire old cart sheet

**P3-T1 [PARALLEL] — `FlyingAvatar` + `useFlyToRail`.**
- Goal: card→pill flight (A.5) with reduced-motion guard.
- Files: `web/src/app/t/[profileCode]/_chat/FlyingAvatar.tsx` (new), `use-fly-to-rail.ts` (new).
- Deps: P0-T3. Acceptance: WAAPI flight 520ms + arc; no portal under reduced-motion. QA: add from card; clone flies to pill.

**P3-T2 — `LauncherAvatarStack` + `AvatarStackItem` + `RemoveAvatarButton` + `OverflowCounterChip`.**
- Goal: the rail on the pill (A.1-A.12).
- Files: `web/src/app/t/[profileCode]/_chat/LauncherAvatarStack.tsx`, `AvatarStackItem.tsx`, `RemoveAvatarButton.tsx`, `OverflowCounterChip.tsx` (new), `mini-chat-styles.ts` (rail tokens).
- Deps: P0-T1. Acceptance: 1-3 avatars + overflow + X-remove + a11y + reduced-motion all per spec. QA: with 4 in cart, see 3 + "+1"; X removes one with leave animation + aria-live announce.

**P3-T3 — Mount the stack on the launcher; derive `cartTalents`.**
- Goal: feed `cartIds` + thumbs into the launcher.
- Files: `TalentProfileChatLauncher.tsx`, `TalentProfileChatLauncherMount.tsx`, `AgencyChatLauncherMount.tsx`, the directory page that resolves thumbs.
- Deps: P3-T2. Acceptance: rail reflects cart on both talent + agency surfaces; landing bounce on add. QA: add/remove on `/directory`; pill rail updates live.

**P3-T4 — Click opens chat preloaded; +N / avatar deep-links to Talent sheet.**
- Goal: opening behavior (B.1) + overflow deep-link (A.7).
- Files: `TalentProfileChatLauncher.tsx`, `MiniChatPanel.tsx`.
- Deps: P3-T3, P2-T3. Acceptance: avatars present → guided composer with Talent prefilled; +N opens sheet at Talent. QA: click pill with cart → talent prefilled; click +N → sheet scrolls to Talent.

**P3-T5 — Talent-pick-first empty state.**
- Goal: B.2 greeting + `TalentPickCard` + recommend path.
- Files: `MiniChatPanel.tsx`, `TalentPickCard.tsx` (new), `SearchTalentField` (P2-T2).
- Deps: P3-T3, P2-T2. Acceptance: empty cart → greeting + pick card; "Let the agency recommend" sets `selection_mode` + advances. QA: open with empty cart → greeting; pick path adds talent, recommend path skips to brief.

**P3-T6 — Retire / redirect the old separate cart sheet.**
- Goal: one cart only (LOCKED #2). Make the old header cart control open the chat (or hide it) and remove the parallel cart sheet.
- Files: `directory-discovery-header-actions.tsx`, `directory-inquiry-modal-context.tsx`, the old cart sheet component (identify via `openInquiry`). Keep favorites/heart untouched.
- Deps: P3-T3, P2-T4. Acceptance: no second cart UI; old entry points open the unified chat. Favorites unchanged. QA: every former "view cart"/"inquiry" entry now opens the chat; heart still toggles favorites independently.

### Phase 4 — Polish, cross-role QA, perf, a11y

**P4-T1 — Full cross-role sync matrix pass.** Run §9 end to end on `http://impronta.lvh.me:3114`. Files: none (QA). Deps: P1-P3. Acceptance: every matrix row green.

**P4-T2 — a11y sweep.** Keyboard rail (arrow/Delete), focus rings, aria-live announces, tooltip roles, reduced-motion verified via DevTools emulation. Deps: P3. Acceptance: keyboard-only add/remove/open works; reduced-motion creates no portal.

**P4-T3 — Perf.** Confirm thumbs resolved once at page level (no N+1), realtime debounce holds at 350ms, no layout thrash from the rail (FLIP-lite only). Deps: P3. Acceptance: no jank adding/removing 4+ talent rapidly.

**P4-T4 — Microcopy + token audit.** Grep for em dashes and hardcoded gold across touched files; confirm "client" never "buyer". Deps: all. Acceptance: clean grep.

---

## 8 · CROSS-ROLE SYNC TEST MATRIX

Setup: two sessions — Session G (guest on `http://impronta.lvh.me:3114/directory`), Session A (admin Messages for the same tenant). For client/talent rows, a third session signed in as the relevant role on the same inquiry.

| # | Action (where) | Expected (who sees) | Steps |
|---|---|---|---|
| 1 | Guest sets Location chip (G) | Admin (A) sees updated location + "…updated…" note ≤1s | G: open Message Impronta → Location chip → "Tulum". A: open the inquiry → location field + private-thread note appear. |
| 2 | Admin edits Location (A) | Guest (G) chip updates in place + accent flash + "The agency updated the location." | A: edit details → location. G: watch the Location chip change live. |
| 3 | Guest sets Event date (G) | Client dashboard (signed-in client on same inquiry) shows date + note | G: When card → date. Client session: open inquiry → date + note. |
| 4 | Guest edits Brief (G) | Admin (A) sees brief text + "Brief updated." | G: Brief card → type. A: brief field + note. |
| 5 | Guest adds a talent via SearchTalentField (G) | Admin (A) sees talent in lineup + "Added {name}." ; pill rail gains an avatar with fly+bounce | G: pick specific → search → Add. A: lineup + note. |
| 6 | Guest removes a talent via rail X (G) | Admin (A) sees removal + "Removed {name}." ; rail avatar leaves | G: pill → X on an avatar. A: lineup + note. |
| 7 | New chat message (G) | Admin (A) + talent (if assigned) see the message ≤1s | G: type in composer → send. A/talent: message appears. |
| 8 | Talent edits a detail (talent session) | Guest (G) + admin (A) reconcile + note | Talent: edit a permitted field. G/A: field + note. |
| 9 | Budget set in All-details sheet (G) | Admin (A) sees budget + note (proves sheet == record) | G: All details → Budget. A: budget + note. |
| 10 | Reduced-motion add (G) | No portal/flight; avatar fades in; aria-live announces | DevTools: emulate reduced-motion → add from card → assert no `.uic-avatar` flying clone, fade-in only. |

---

## 9 · CONSTRAINTS & HOUSE RULES

- **No em dashes** in any user-facing copy. Use periods or "and".
- **Accent token, never hardcoded gold.** Use `accent` / `accentInk` / `var(--accent)` and the `C.*` tokens. The only literal ink/white is the neutral system chips (X, +N). Fix the existing `--impronta-gold` cueRing (P0-T2).
- **Client language: never "buyer."** Use "client" / persona titles. Never "pay to DM."
- **Localhost-first QA** on `http://impronta.lvh.me:3114` (directory `/directory`); Vercel previews are 5-10 min/cycle and `*.vercel.app` hosts 404 (not in `agency_domains`).
- **Gate before every commit:** `cd web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit && npm run lint`. An OOM-crashed tsc is NOT clean.
- **Branch off latest `main`** into a short-lived feature branch; PR back; never commit to `main`. Never `git switch` in the shared checkout — `git worktree list` first; use `dev:webpack` in a worktree and copy `web/.env.local`.
- **One migration timestamp** only if a migration is ever needed (`date -u +%Y%m%d%H%M%S`) + `npm run db:push` before merge. **This plan needs NO migration.**
- **Stale `.next` wedge:** `rm -rf web/.next` and restart dev FIRST on any dev weirdness.
- **Preview tools cannot drive deep React state** (builder/chat client state). QA the OPEN interactive state on a real host (Chrome MCP or e2e) — open the panel with a real event, measure bbox, check occluders.
- **Do NOT touch** `web/src/lib/inquiry/inquiry-permissions.ts` — the structured guest write path does not use the `assertCanPerform` allowlist (all three source proposals were wrong here).
- **Do NOT touch** favorites (`use-favorites.ts`, `client_favorites`) — heart stays separate.

---

## 10 · RISKS & GOTCHAS

- **Placeholder contact values leaking.** The early-row `contact_email = 'pending-{id}@guest.impronta'` must be overwritten by `ContactCard` before any agency-facing notification fires. Mitigation: suppress new-inquiry notifications until the row is promoted (real email present); admin list should label such rows "draft / awaiting contact."
- **Double-creation race.** Rapid chip edits could call `ensureGuestChatInquiry` twice. Mitigation: idempotent lookup (existing owned non-terminal row) + in-hook single-flight guard.
- **Version conflict on concurrent edits** (guest + admin same field). The chip path is read-modify-write; surface "Couldn't save. Retry" on conflict and re-read. Do not silently clobber.
- **Realtime tenant filter.** `use-inquiry-realtime` filters by `tenant_id`; ensure the guest panel knows the tenant id so it subscribes to the right channel.
- **Thumb resolution cost.** Resolve `loadTalentCardThumbs` once at the directory page level; do not call per-avatar.
- **Free-tier Supabase quota** (402 possible). Check quota first on DB errors.
- **Stale `.next`** is the recurring dev wedge — clear it first.
- **`*.vercel.app` 404s** — QA only on seeded hosts via the proxy.

## DEFINITION OF DONE

1. On `http://impronta.lvh.me:3114/directory`, adding talent from a card flies an avatar to the "Message Impronta" pill and the pill shows face-focus circles (max 3 + "+N"), each removable with an X; favorites/heart behaves exactly as before.
2. Clicking the pill opens the guided chat preloaded with the cart talent; an empty cart opens the talent-pick-first greeting with working search and a "Let the agency recommend" path.
3. The visitor can fill the inquiry slowly — Date, Location, Headcount, Budget, Brief, Talent, Contact — via chips, guided cards, or the "All details" sheet; every edit autosaves to ONE inquiry record and drops a gentle thread note.
4. Every structured edit and message propagates live (≤~1s) to admin Messages, the client dashboard, and any assigned talent; admin/talent edits reconcile back into the guest panel with an accent flash + remote note. The §8 matrix is fully green.
5. No migration, no `inquiry-permissions.ts` change, no second cart UI. tsc + lint clean. No em dashes, no hardcoded gold, no "buyer." a11y (keyboard rail, focus, aria-live) and reduced-motion all pass.
6. Merged to `main` via PR off a short-lived feature branch; localhost-QA-proven on the Impronta host.

---

## ADDENDUM 2026-06-25 (owner direction)

### Status checkpoint
- **Phase 0 ✅ shipped local** (contracts, accent-token fix, `animateAdd` context, guest-safe `ensureGuestChatInquiry` + extended `captureGuestChip`, `useUnifiedInquiry` hook). tsc + lint clean.
- **Phase 1 ✅ proven** (vertical slice): set Location + Date in the guest chat on `impronta.lvh.me:3114/directory` → one inquiry record written (flat + `interpreted_query`) → thread notes emitted → **rendered live in admin Messages** (`qa-admin@impronta.test`, separate session) on the same inquiry. Cross-role round-trip confirmed.
- Decision: **continue with Phase 2 (full form parity), functional-first**, THEN build the details sidebar (Addendum A), THEN avatar stack (Phase 3). Nothing committed yet (owner: keep uncommitted for now).

### A — Collapsible details SIDEBAR (SUPERSEDES the slide-up `AllDetailsSheet` in §4.B and the §7 P2-T3 / P2-T6 two-pane)
The canonical "form view" is a **left vertical sidebar of inquiry sections**, not a horizontal chip row or a slide-up sheet. Owner spec, locked:
- **Vertical list** of section rows: **Type · Budget · Headcount · Date · Location · Talent · Brief · Files · Contact** (order TBD; Type/Budget/Headcount/Date first per owner).
- Each row = **leading icon + label + a filled-state check** (checkmark/filled icon when that section has a value; empty/outline when not).
- **Collapsible rail:** collapsed → **icons only** (a thin rail); expanded → **icons + labels** (and the filled checks). A toggle (chevron/hamburger) expands/collapses.
- Clicking a row **opens that section's editor** (reuse the P2-T1 exported `InquiryDrawer` section components + the existing chip editors) inline / in the adjacent pane; on commit it routes through `useUnifiedInquiry.patch` exactly like the chips do today (same sync + thread note).
- Replaces the horizontal `GuestDetailChips` row as the primary affordance (the chip row may remain as a compact fallback on very small screens, owner to confirm). One canonical surface — no parallel sheet.
- House rules unchanged: accent token (no hardcoded gold), no em dashes, "client" never "buyer", reduced-motion + keyboard/aria for the expand/collapse and the checklist.
- New components: `InquiryDetailsRail` (the collapsible sidebar), `InquiryDetailRow` (icon + label + check + open), reusing the section editors. Filled-state derives from `useUnifiedInquiry` values.

### B — Future Phase 5: AI auto-fill from the conversation (NOT now)
After the sidebar lands: an assistant that **reads the chat/client messages and auto-populates the inquiry sections** (date, talent, budget, location, headcount, brief) by interpreting what the client writes — the client never has to open a section to fill it; the AI infers and the synced sidebar reflects it (client can still edit/confirm). Builds on the same `useUnifiedInquiry.patch` write path + the section schema. Scope/triggers/guardrails to be specced when reached. Reuse the existing AI brief-draft + directory AI-search infra as priors.
