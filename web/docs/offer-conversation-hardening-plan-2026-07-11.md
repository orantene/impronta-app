# Offer & Conversation Hardening — Execution Plan (2026-07-11)

**Author:** Product owner pass (Claude, with Oran)
**Status:** BINDING — this is the build plan for the next program. Supersedes nothing; extends the DOCK v2 program (see `guest-message-panel-build-plan-2026-07-09.md`) and the services program (`talent-rate-pricing-services-audit-2026-07-08.md`).
**Evidence base:** Live prod audit of 2026-07-11 — two real inquiries (More solo · Tulum fiesta / More+Anto+Tina · 2-day CDMX bottle promo), a real offer drafted in the admin composer, every finding below reproduced on production with screenshots in the session log.

---

## 0. Why this program exists (read this first)

We just proved the whole commercial loop works: a guest inquires from a talent page with a priced service chip, the AI fills the brief (date, city, headcount, event type, budget), the inquiry lands in the agency inbox titled and coordinator-assigned, the admin drafts a multi-talent offer with deposit terms, and a booking freezes an honest three-lane money split (talent / agency / platform).

But the audit also showed the product at its two weakest moments, and both are **trust** moments:

1. **The client's chat looks like a machine wrote in it.** Six identical "Added 9 talent to your inquiry." bubbles in a row read as spam. This is the FIRST thing a prospective client sees after opening the panel. First impressions are the product here.
2. **The coordinator's offer editor can silently lose work.** With an expired session, every save failed with only a vanishing toast; the editor stayed editable; the header chip kept saying "Borrador · $0" while the coordinator believed they had built a $5,000 offer. If this happens to a real agency on a real deal, we lose the agency.

Everything in this plan serves one sentence: **the conversation must feel human, and the money surface must never lie.**

### Binding product decisions (owner, 2026-07-11)

| # | Decision | Consequence |
|---|----------|-------------|
| D1 | **USD is the primary currency** (Mexico market + USDC settlement). FX conversion is a later nice-to-have, never a blocker. | All seeds/defaults USD (done 2026-07-11). Nothing in this plan introduces currency UI. |
| D2 | **No travel/expense line-item feature.** Travel, hotels, per-diems get **baked into the offer total** — negotiated in the conversation, expressed in the line's rate and label. | We keep `line_item_talent_required` exactly as is (it protects the commission snapshot: every charged dollar pays an identifiable party). We make baking-in *expressible* (editable line labels, W2-2) instead of building an expense subsystem. |
| D3 | **The chat is a conversation, not a log.** System/activity noise must collapse to near-invisibility; the human messages own the surface. | Wave 1 is design-led: cluster + minify + prune. |
| D4 | Coordinator builds offers **in the thread context** (the Oferta tab), reusing the talent's real catalog when it exists. | Wave 2 repairs the catalog→offer bridge and its failure modes. |

---

## 1. Findings register (evidence → diagnosis)

Each finding below was reproduced live on prod. File references are the actual code paths.

### F1 — System-note spam in the guest chat  🔴 UX-critical
**Evidence:** Six consecutive "Added 9 talent to your inquiry." bubbles + "Lineup · 1 talent" + "The agency updated the talent on your inquiry." stacked in the fiesta thread. Owner: *"this looks like spam… minify it."*
**Diagnosis (two independent causes):**
- (a) **Legacy rows**: the note-coalescing shipped in W0 (`lineup-note-coalesce.ts`) only affects *new* writes. Threads created before it (and bursts written between cart events) keep their historical duplicates forever — nothing prunes them.
- (b) **Rendering**: every `authorRole === "system"` row renders as its own bubble (`MiniChatMessageBubble.tsx:44-54`). There is no clustering, no de-emphasis hierarchy, no cap. Even *post-coalescing*, a burst of AI captures ("Event date set…", "Location set…", "Headcount set…", "Budget…") renders as 4-6 stacked bubbles.

### F2 — Offer editor loses work silently on auth expiry  🔴 Trust-critical
**Evidence:** Session expired mid-edit on app.tulala.digital. Every "Guardar borrador" returned HTTP 200 with `{error}` payload; the only surfacing was a 4-second toast "Error al guardar: You must be signed in." and a tiny red "Save failed" label in the terms card. The editor stayed fully editable; total showed $5,000 client-side; DB had 0 lines. The header chip stayed "Borrador · $0" throughout (it was right by accident).
**Diagnosis:** Three separate gaps:
- (a) No sticky, blocking error state in the editor (`machinery-11.tsx:544` uses a transient toast; `offer-terms-ui.tsx:101,144` a small label).
- (b) No auth-state detection/recovery: server actions fail with `You must be signed in` but the client never attempts `supabase.auth.refreshSession()` or offers a re-login path that preserves the draft.
- (c) `Enviar al cliente` is clickable while the draft has unsaved/failed lines — you can send a $0 offer believing it's $5,000.

### F3 — Catalog→offer bridge degrades silently  🟠
**Evidence:** The per-line "prefill from a service" dropdown showed only the five generic default templates for More, who has 5 published offerings ($350 half-day etc.).
**Diagnosis:** `line-service-picker.tsx:73-74` loads offerings first (correct design) but `.catch(() => ({ok:false}))` swallows every failure and the UI renders the defaults with **no signal** that a load failed. During the audit the failure was the expired session; any transient error produces the same silent downgrade. "No services" and "couldn't load services" are indistinguishable — for a coordinator, those mean opposite things.

### F4 — Offer lines cannot express what they include  🟠 (this is the travel decision)
**Evidence:** The line row exposes talent / unit / units / rate / cost — **no editable label** (`machinery-11.tsx`: label is set implicitly from the talent name or picked service, lines 600, 675). Per D2, travel gets baked into the rate — but then the client sees "More — 2 × $1,000/day" with no way to know it includes flights+hotel, and the talent sees a rate that isn't their rate.
**Diagnosis:** Baking-in is the right model, but it needs *transparency*: an editable line label ("Full-day + travel CDMX") and a per-line note. Both columns already exist in `inquiry_offer_line_items` (`label`, `notes`) — this is pure editor UI.

### F5 — AI budget capture false-positive from service prices  🟡
**Evidence:** Scenario A: the chip prefix "Requesting: Half-day shoot (up to 4h) ($350)" caused "Budget: USD 350." The client never stated a budget; $350 is the *service price*. Scenario B (real budget: "$6000 total") captured correctly.
**Diagnosis:** `guest-message-extract.ts` prompt treats any currency amount as budget. The "Requesting:" prefix is machine-generated and should be excluded from budget inference.

### F6 — Composer caret lands mid-prefill after chip tap  🟡
**Evidence:** Message read "Requesting: Half-day shPrivate fiesta at a beach…ot (up to 4h) ($350) —" — the user's click placed the caret inside the prefilled text.
**Diagnosis:** The chip prefill sets the draft but doesn't manage caret placement; a subsequent tap into the middle of the textarea interleaves. Set caret to end on prefill + keep prefix atomic (or prepend as an uneditable quoted block above the composer instead of inline text — see W1-4 option B).

### F7 — Header offer-status chip is stale  🟡
**Evidence:** Chip stayed "Borrador · $0" through every state change (it happened to be true here because saves failed, but it also didn't update after the draft was created with intent to be $5,000; historical sessions show it lagging after sends).
**Diagnosis:** The chip (AdminOperationsShell) reads a snapshot loaded with the thread, not the offer editor's live state; no revalidation after save/send.

### F8 — Coordinator assignment timed out for guests (historic)  🟡
**Evidence:** Six "System had a coordinator assignment time out for Guest" events in the admin activity feed (10-14h before the audit). Today's inquiries assigned instantly to the default coordinator (Oran).
**Diagnosis:** Needs a short investigation: the timeout events predate/surround the default-coordinator setting. Either (a) the default was unset for a period, or (b) an assignment SLA job races guest inquiries. Low current impact (default now set) but the failure mode "inquiry sits with no coordinator" is a dead client experience — we want a guaranteed fallback + an alert, not a silent timeout event.

### F9 — QA residue in prod  🧹
**Evidence:** This audit intentionally created: 2 inquiries from `qa-fiesta@impronta.test` (+1 draft), a draft offer (`e9905b2f`), and earlier `qa-multi`/`qa-add3`/`qa-scan2`/`qa-dockv2`/`qa-w0-e2e` rows (12 ids listed in session log). Legacy "Added 9 talent" duplicate note rows also qualify as residue after W1-2 ships.
**Diagnosis:** Sweep after the program lands, owner-approved scope: only rows created by these audits (emails above), never `qa-client-1` (pre-existing shared fixtures).

---

## 2. The plan — waves, stories, reasoning

Ground rules (unchanged from prior programs): worktree per lane off latest `main`; scoped-tsconfig typecheck + eslint + unit suites per lane (full tsc = CI); no em dashes in user copy; tenant accent only; EN+ES (+FR where the file already has it); every UI story live-QA'd on prod with REAL clicks before its PR merges; money-adjacent stories run `test:money` + offerings E2E; flake-diff merge procedure vs main's known 13.

Model lanes: **fable/opus** for W2 (money-adjacent editor) and W1-2 (data migration), **opus** for UI stories, **sonnet** for copy/i18n/cleanup.

---

### WAVE 0 — "The money surface never lies" (F2, F7) — *ship first, alone*

The single highest-stakes fix. A coordinator building a $5k offer must know, at every second, whether the server has their work.

**W0-1 · Sticky save-state banner in the offer editor** (opus)
*Why:* A transient toast is the wrong severity for "your work is not saved." The editor must wear its sync state the way the guest panel wears the draft-lock chip (same pattern we shipped in W1 of DOCK: visible state, retry affordance).
*What:* One `saveState` machine for the whole Oferta tab (`idle | saving | saved · hh:mm | error(reason)`). On error: a sticky banner pinned above the line editor — "No se pudo guardar: {reason} · Reintentar" — that persists until a successful save. Line-items and terms failures feed the same banner (they're one mental object to the coordinator). The banner must render the *engine reason* mapped to human copy (`line_item_talent_required` → "Cada línea necesita un talento asignado", `version_conflict` → "Alguien más editó esta oferta — recarga", `rate_limited` → "Demasiados guardados — espera un momento", auth → W0-2).
*Acceptance:* Kill the session cookie in devtools mid-edit → banner appears on next save and STAYS; fix session → Reintentar succeeds; banner clears. `line_item_talent_required` shows the per-line human reason and highlights the offending row.
*Files:* `machinery-11.tsx`, `offer-terms-ui.tsx` (merge their two save paths' surfacing), new `offer-save-state.ts` (pure reducer + tests).

**W0-2 · Auth-expiry recovery without data loss** (fable — auth semantics)
*Why:* Sessions expire; that must never cost work. The failure we hit returns HTTP 200 with `{error:"You must be signed in"}` — the client can detect exactly this and repair.
*What:* On an auth-shaped action failure: (1) attempt silent `supabase.auth.refreshSession()`; retry the save once on success. (2) If refresh fails: snapshot the FULL editor state (lines + terms) to `localStorage` keyed by offerId, then show a blocking modal "Tu sesión expiró — vuelve a iniciar sesión. Tu borrador está guardado en este navegador." with a login link (`/login?next=<current>`). (3) On return to the thread with a restorable snapshot newer than the server draft: offer "Restaurar borrador local ($5,000 · hace 4 min)".
*Acceptance:* Simulate expiry (delete sb-* cookies) → edit → save → modal; login in another tab → return → restore banner → one click restores lines+terms → save succeeds. Snapshot is deleted after a successful server save.
*Files:* new `offer-local-snapshot.ts` (+unit tests: snapshot/restore/expire), hook into W0-1's state machine.

**W0-3 · Send is gated on a clean save** (sonnet, small)
*Why:* "Enviar al cliente" while lines are unsaved sends a $0 offer — the worst possible surprise for the client AND the agency.
*What:* Disable send while `saveState != saved` or the server draft's line count/total mismatches the local editor; tooltip explains why. Server-side backstop already exists (`empty_offer` refusal on send) — verify it and add a client-visible reason if tripped.
*Acceptance:* With a failed save, send button is disabled with reason; after successful save it enables; sending a genuinely empty draft surfaces "empty_offer" as human copy, never silently.

**W0-4 · Live offer-status chip** (sonnet, small)
*Why (F7):* The header chip is the coordinator's ambient truth; a stale chip trains people to ignore it.
*What:* Chip re-derives from the editor's save-state machine while the Oferta tab is mounted (total from last SUCCESSFUL save; status from server response), and revalidates the thread snapshot after save/send.
*Acceptance:* Save $3,800 → chip reads "Borrador · $3,800" within a second; send → "Enviada · $3,800".

---

### WAVE 1 — "A conversation, not a log" (F1, F6, plus F5) — *the owner's screenshot*

**W1-1 · Activity clustering + quiet visual register** (opus — this is a design story)
*Why:* System notes are *metadata about* the conversation, not the conversation. Messaging products (iMessage day markers, Slack join/leave collapse) render them as whisper-quiet captions, clustered so bursts read as ONE event. Our notes currently have the same visual weight as a human message, so 6 notes = 6 shouts.
*What (behavioral spec):*
- Consecutive system rows (no human message between) collapse into ONE cluster element.
- Collapsed render: a single centered caption line, ~11px, `C.inkDim`, no bubble box: latest note text + "· {n-1} more" when n>1. Example: `Budget: USD 6,000 · 5 more updates`.
- Tap/click expands the cluster in place (chevron rotates); expanded rows keep the mini-caption style, never bubbles. Collapse state is per-cluster, default collapsed when n≥3, expanded when n≤2.
- The AI-capture burst on send (date/location/headcount/type/budget) becomes its own semantic cluster titled "Detalles actualizados de tu evento" with the fields as its expanded body — because five field-set notes are ONE event: "we understood your brief."
- Never re-order: clusters sit exactly where their rows sit in the timeline.
*Why not hide them entirely:* the notes carry trust ("the agency updated your lineup" explains why faces changed). Whisper, don't delete.
*Acceptance:* The owner's screenshot scenario (6× Added-9 + Lineup·1 + agency-updated) renders as TWO caption lines (one legacy cluster collapsed, one current state). At 390px nothing wraps awkwardly. Expanded/collapsed survives re-render but not reload (no persistence needed).
*Files:* `GuestConversationBody.tsx` (cluster derivation — pure function `clusterSystemRows(rows)` in a new module + node tests), `MiniChatMessageBubble.tsx` (caption variant), i18n keys EN/ES/FR.

**W1-2 · Prune the legacy duplicate notes (data migration)** (fable — prod data writes)
*Why:* Rendering fixes the future; the DB still holds the historical spam and the Inquiries previews/emails can surface it.
*What:* A one-shot, idempotent script (`scripts/prune-duplicate-system-notes.mts`, service-role, DRY-RUN default): for each inquiry, find runs of >1 *identical-body consecutive* system rows in the private thread and delete all but the newest of each run. Log per-inquiry counts. Explicitly scoped to `message_kind='system'`-class rows only; never touches human messages or cards. Run dry → review counts → run live (owner sign-off in PR description) → keep the script for reuse.
*Acceptance:* Dry-run report matches expectation on the known threads (fiesta thread: 6→1). Live run + the affected threads re-checked in UI. Unit test the run-detection on a fixture array.

**W1-3 · Chip-prefill caret & atomic prefix** (sonnet)
*Why (F6):* Interleaved text made the client's own message read as garbage in the contact gate and the admin inbox — sloppy first impression on the highest-intent action (a priced request).
*What:* Option B (preferred, cleaner): the tapped service becomes a small dismissible "Solicitando: Half-day shoot · $350" pill ABOVE the composer (state, not text); the message body stays purely the user's words; on send, the pill's line is prepended server-side exactly as today (`offeringDraftPrefix` moves from composer-string to send-time concatenation). Fallback option A if B's plumbing is heavy: keep inline prefill but set caret to end + make the prefix one undividable token (replace on re-tap, not append).
*Acceptance:* Tap chip → pill appears, composer empty; type → send → thread + admin inbox show "Requesting: … — {user text}" clean. Re-tapping another chip replaces the pill. Dismissing the pill sends a plain message.

**W1-4 · Budget capture ignores machine-generated prices** (sonnet, prompt-only)
*Why (F5):* "Budget: USD 350" when the client never stated a budget makes the AI look wrong exactly where it was impressing us; coordinators will stop trusting the captures.
*What:* In `guest-message-extract.ts` SYSTEM_PROMPT: "A line beginning 'Requesting:' names a service and its listed price — the price of a requested service is NOT the client's budget. Only capture budget when the client states what they want to spend." Add the fiesta message as a regression case in the prompt-eval fixtures.
*Acceptance:* Scenario-A message re-run through the extractor → no budget captured; Scenario-B message → still captures $6,000.

---

### WAVE 2 — "The offer speaks the catalog" (F3, F4, D2)

**W2-1 · Catalog prefill: loud failures, honest empty states** (opus)
*Why (F3):* The bridge from a talent's storefront prices to the offer line is the whole point of the catalog for coordinators — and today its failure mode is indistinguishable from "this talent has no services." A coordinator who sees only generic templates for a talent they KNOW has prices will (rightly) stop trusting the composer.
*What:* In `line-service-picker.tsx`: drop the silent `.catch`; three explicit states — loading ("Cargando servicios…") / error ("No se pudieron cargar los servicios · Reintentar") / genuinely-empty (defaults with caption "Este talento aún no tiene servicios publicados — usa una plantilla"). When offerings exist, they render FIRST with their real prices ("Half-day shoot · $350 / half-day") and defaults collapse under "Plantillas genéricas".
*Acceptance:* More's line → picker lists her 5 USD offerings; pick "Half-day $350" → unit=half_day, rate=350, label="Half-day shoot (up to 4h)", sourceServiceId stamped (S18 audit trail). Network-blocked load → error state with working retry, NEVER silent defaults.

**W2-2 · Editable line label + note — the "baked-in travel" story** (opus)
*Why (D2/F4):* The owner's model: travel/hotel/expenses are negotiated in the conversation and folded into the line's rate. For that to be honest to BOTH sides, the line must be able to *say so* — the client should read "Full-day + vuelos y hotel (CDMX) — 2 × $1,300" and the talent should see their own cost split from the trip mark-up (talent_cost stays their real rate; the delta is agency-managed). No new schema: `label` and `notes` columns already exist; the editor just never exposed them.
*What:* Each line row gains an editable label (defaults to talent/service name as today; editing marks it custom so re-picking a talent doesn't clobber it) and an optional note line ("incluye vuelos PDC→MEX + 2 noches hotel") shown to the client under the line in the offer card. Copy guidance (ES-first placeholder): "p. ej. Full-day + viaje (CDMX)".
*Acceptance:* Build the CDMX offer as the audit intended WITHOUT an expense line: More 2×$1,300 labeled "Full-day + viaje y hotel (CDMX)" (cost $550), girls 2×$600 — total $5,000; client offer card shows labels+notes; commission snapshot unchanged in shape (three lanes, sums exact); `test:money` green.

**W2-3 · Offer card in the guest panel names what's included** (sonnet)
*Why:* Closing the loop of W2-2 on the client side — the panel's offer card must render label + note per line so the baked-in framing is what the CLIENT reads when approving.
*What:* Guest offer card line rows: label (bold) + note (muted, small) + `units × rate`; totals + "Deposit due now" unchanged.
*Acceptance:* The CDMX offer renders in Mike's panel with the travel-inclusive label; approve flow unchanged.

---

### WAVE 3 — "No inquiry without an owner" (F8)

**W3-1 · Coordinator assignment: investigate, guarantee, alert** (fable investigation → sonnet fix)
*Why:* An unassigned inquiry is a client talking to an empty room. The default-coordinator now papers over it, but six timeout events mean the assignment path CAN strand inquiries, and "papering" isn't a guarantee.
*What:* (1) Trace the six events: which job emits `coordinator assignment time out`, what raced. (2) Enforce the invariant *at inquiry creation*: if no assignment rule matches within the transaction, stamp the tenant default coordinator synchronously (no async wait), falling back to the tenant owner. (3) If somehow still unowned (default unset), emit a `requiresAction` notification to all admins ("Consulta sin coordinador") instead of a passive activity event.
*Acceptance:* Create guest inquiry with default coordinator UNSET on a test tenant → inquiry lands owned by tenant owner + admins notified; the timeout event class no longer occurs for new inquiries. Document findings in the PR.

---

### WAVE 4 — Finish the audited loop + cleanup (F9)

**W4-1 · Complete the CDMX scenario end-to-end on prod** (orchestrator + owner)
*Why:* The audit stopped at the expired session. The program isn't done until the full loop is DEMONSTRATED: re-save the $5,000 offer (per W2-2 shape) → send → approve as Mike in the guest panel → booking converts → deposit $1,500 requested (mock checkout) → commission snapshot verified (3 lanes, sums to charged).
*Depends on:* owner re-login on app.tulala.digital (cannot be automated — password entry is off-limits by policy). Everything else is scripted in the session log (inquiry `event_date=2026-09-05`, offer `e9905b2f`).
*Acceptance:* DB shows booking + snapshot + deposit transaction for the CDMX inquiry; screenshots of all three role views (client card, admin thread, talent inbox).

**W4-2 · QA-residue sweep** (sonnet, owner-approved scope)
*What:* Delete inquiries/messages/participants/offers for `qa-fiesta|qa-multi|qa-add3|qa-scan2|qa-dockv2|qa-w0-e2e @impronta.test` (post-W4-1, so the demo rows serve their purpose first). NEVER touch `qa-client-1/2` (pre-existing shared fixtures). Re-run the W1-2 prune after deletion. Publish final counts.

---

## 3. Sequencing & lanes

```
W0 (money-surface trust)  ──►  ship alone, first PR. fable+opus+sonnet, 1 worktree.
W1 (calm conversation)    ──►  parallel lanes W1-1/W1-3/W1-4 (disjoint files); W1-2 after W1-1 merges.
W2 (catalog→offer)        ──►  after W0 (shares machinery-11). W2-1 ∥ W2-2, then W2-3.
W3 (coordinator)          ──►  independent, anytime.
W4 (loop + sweep)         ──►  last; W4-1 gated on owner login.
```

Per-PR gates: scoped tsc, eslint, `test:inquiry-workspace` (80), guest-chat suites (90+), `test:money` for W2, offerings E2E 22/22 for W2, live prod click-QA with screenshots, flake-diff merge.

## 4. What we are deliberately NOT building (and why)

- **Expense/non-talent line items** — owner decision D2. The commission model's integrity rests on every line paying an identifiable party; travel is a negotiation detail, not a ledger entity. W2-2's labels/notes carry the transparency instead.
- **Multi-currency conversion** — D1. USD primary; FX needs API keys and adds settlement ambiguity ahead of USDC rails.
- **A separate "activity log" tab in the guest panel** — considered for F1 and rejected: it moves the trust signals out of sight instead of quieting them; clusters keep them in-timeline where they explain lineup changes.
- **Auto-draft offers from AI captures** — tempting (we capture budget/dates/talent already) but premature until W0/W2 make the manual editor trustworthy. Candidate for the next program.

## 5. Success criteria for the program

1. The owner's spam screenshot is unreproducible: same thread renders ≤2 quiet caption lines.
2. A coordinator with an expired session cannot lose offer work — worst case is one click of "Restaurar borrador local".
3. Building the CDMX offer uses More's real catalog prices via the picker, expresses travel in the label, and the full loop (send → approve → booking → deposit → 3-lane snapshot) is demonstrated on prod.
4. Zero new inquiries can exist without a coordinator.
5. All audit QA residue purged; legacy note spam pruned across all threads.
