# Concierge Dock — Autonomous Execution Plan (v2, 2026-07-09)

**Companion to:** `web/docs/guest-message-panel-360-audit-2026-07-09.md` (defect register with file:line evidence — read it first; lane specs below reference its P-numbers).
**Mode:** multi-agent autonomous execution. The orchestrator (Fable 5 session) manages lanes, integrates, and owns ALL QA (Chrome on localhost proxy + production). Sub-agents never self-certify: every lane ends with orchestrator verification.
**Baseline:** branch off `origin/main`. The shared checkout `impronta-app` holds the owner's profile-templates WIP — **never `git switch` it**; every lane runs in an isolated worktree.

---

## 0. Decision defaults (locked for autonomous run; owner can override any line)

| # | Decision | Default |
|---|---|---|
| D1 | Dock with Lineup view merging favorites + cart at UI level (stores stay separate) | **YES** |
| D2 | Retire directory review bar once dock Lineup ships | **YES** (W2-E, after W2-A) |
| D3 | Freeze lineup on send; post-send changes = explicit change-request message | **YES** |
| D4 | Hub = "Tulala Concierge" framing | **YES** (routing stays single-owning-agency — see xtenant constraint §6) |
| D5 | Launcher on all tenant-host pages by default (incl. builder pages), per-tenant off switch + `show_on_home` | **YES** |
| D6 | InquiryDrawer survives only as the workspace dashboard form | **YES** |
| D7 | Reply-notification email to guests (new in v2) | **YES**, throttled, only when guest hasn't seen the reply |
| D8 | Pill simplification: remove per-avatar X from the pill (removal lives in the panel Lineup view) | **YES** — kills the collision class permanently |

House rules that bind every lane: no em dashes in user-facing copy · never "buyer"/"cart" in copy (use "lineup") · do NOT resurrect the dark chat variant · do NOT touch `inquiry-permissions.ts` · en/es/fr parity for every new string · tsc + lint gate before every commit (`NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`).

---

## 1. What changed from plan v1 (PO/architect second pass)

1. **QA enabler first.** The httpOnly `impronta_guest` cookie makes fresh-guest testing impossible (bit every prior program). New lane W0-H: a guest-session reset endpoint, dev-mode OR staff-session gated, so the orchestrator and E2E can mint "a brand-new Mike" on demand — including on prod (staff-gated).
2. **Regression net.** New lane W0-I: Playwright spec `e2e/guest-chat-lifecycle.spec.ts` encoding the Wave-0 acceptance list. Run locally per wave (e2e is not in CI).
3. **Data janitor.** W0-A stops *new* phantom drafts; W0-J archives the existing ones in prod (owner-gated write).
4. **Reply email nudge (W2-F).** A guest who gets a reply but never revisits is a lost booking. Biggest missing funnel piece in v1.
5. **Unread/reply pulse on the pill (folded into W2-B)** and **guest recovery entry** ("been here before? enter your email", W2-G).
6. **Pill de-collision by subtraction (D8)** instead of layout heroics: display-only pill = no per-avatar X, no separate count chip; the stack carries "+N". Cheaper, sturdier, calmer.
7. **Decomposition pre-pass (W1-A)** before any panel UI lane — 5 files sit at the 800-line cap; without headroom every UI lane stalls.
8. **Architectural pick for P0-1 (was open):** do NOT seed talent participant rows on drafts (would leak drafts into talent inboxes and fights the "no participants pre-send" invariant). Instead re-gate resume/idempotency on `interpreted_query->talent->selected_ids` containment (PostgREST `cs` filter; no migration; volume is low, add a GIN index later only if slow). Resume keys primarily on guest_session + tenant; the talent match becomes a preference, not an existence gate.
9. **Copy matrix (§4)** so no agent improvises lifecycle labels.
10. **Metrics + proof (§7)** with an anchor metric per wave, on the existing analytics pipe.
11. **Explicit integration checkpoints** with the home/directory marathon branch and the xtenant-rehome constraint (§6).

---

## 2. Execution protocol

- **Worktrees:** one per parallel track, `git worktree add ~/Desktop/mp360-<track> origin/main` (symlink node_modules, copy `web/.env.local`, use `dev:webpack`). Orchestrator integrates FF-only into a ship branch per wave → PR to main.
- **Branches:** `fix/mp360-w0-<lane>`, `feat/mp360-w1` (serialized), `feat/mp360-w2-<lane>`, etc.
- **Migrations:** only W2-C carries one (`tenant_guest_chat_settings.show_on_home`). That agent runs `date -u +%Y%m%d%H%M%S` for the timestamp and `npm run db:push` is part of its lane, before the PR merges (CLAUDE.md protocol).
- **Per-lane contract:** every lane below ships (a) the change, (b) unit/E2E proof named in the lane, (c) i18n parity, (d) tsc+lint green. Orchestrator then runs its own verification (Chrome QA per §5) before integrating. A lane is "done" only after orchestrator sign-off, never on the agent's word.
- **Model assignment rationale:** **Fable 5** = data-semantics and cross-tenant correctness lanes + orchestration + QA + adversarial review. **Opus** = load-bearing UI/logic rebuild lanes. **Sonnet** = mechanical, well-specified lanes (copy, palette, extraction, sweeps, one-liners).

---

## 3. Waves and lanes

### Wave 0 — Correctness + QA enablers (all P0s; small seam fixes; ship first)

| Lane | Model | Size | Depends | Spec + acceptance |
|---|---|---|---|---|
| **W0-A One draft, always resumed** (P0-1) | **fable** | M | — | `guest-chat-actions.ts`: `getActiveGuestInquiry` (:1611) + `ensureGuestChatInquiry` (:1723-1801) drop the `inquiry_participants` talent gate; match on session+tenant with `interpreted_query->talent->selected_ids` containment; prefer draft over sent; if no draft contains the talent, RESUME the newest draft anyway (return `containsTalent:false`) instead of inserting. Insert only when the session has zero live drafts for the tenant. **Accept:** fresh guest opens on talent A → 1 draft; reload ×3 → same id; open on talent B → same id resumed; row count never grows. Unit tests + E2E step. |
| **W0-B Honest draft status** (P0-2) | opus | S/M | W0-A | Extend the guest thread-status union with `draft` (`guest-chat-actions.ts:475-494`), map it in `threadStatusToPhase` (`launcher-lifecycle-inputs.ts:69-85`) so resolver draft rules (resume_draft etc.) actually fire; audit switch exhaustiveness + resolver tests (keep 99/99 green, add draft-path cases). **Accept:** draft-only session shows the draft label on home, directory, AND profile pills (one label, three surfaces); sent session shows "Inquiry sent" only when truly submitted. |
| **W0-C Freeze on send** (P0-3) | opus | M | W0-A | `captureGuestChip` allowlists `status='draft'` only (`guest-detail-chips-actions.ts:491-497`) returning a typed `refused_sent` error; `ensureGuestChatInquiry` live-pick selects drafts only; `LauncherProjectPicker`/`launcher-lifecycle-inputs` stop offering sent threads as write targets — "add to sent" posts a visible change-request message ("Mike asked to add {name} to the lineup") instead of mutating `selected_ids`. **Accept:** chip write on a submitted row is refused server-side; picker on a sent thread produces a message, not a silent mutation; E2E step. |
| **W0-D Server contact gate** (P0-6) | sonnet | S | W0-A | `sendGuestMessageAction` (:1031-1174): refuse the message insert while `isSeedContact` and no contact payload; promote-then-send order. **Accept:** direct action replay with placeholder contact → error, zero rows. Unit test. |
| **W0-E Note coalescing** (P1-7) | opus | S/M | W0-C (same file) | `guest-detail-chips-actions.ts:529-588`: skip when `selected_ids` unchanged; UPDATE the previous lineup note (same thread, same kind, < 10 min old) instead of inserting; fix "Added: Added…" double prefix (:545-546). Copy: "Lineup · {n} talent". **Accept:** 3 rapid adds → exactly 1 note showing final count; coordinator bubble clean. |
| **W0-F Hub launcher unbroken** (P0-5, minimal) | opus | M | — | Root-cause the hub roster failure (agency-scoped roster loader on a hub tenant); hub branch sources talent from the global directory loader; CTA copy per host kind: hub = "Send" + "We'll route it to the right people". Full Concierge framing waits for W3. **Accept:** tulala.digital/directory launcher lists talent, no error banner, no "agency" wording. |
| **W0-G "Custom quote quote"** (P1-13a) | sonnet | XS | — | `OfferingQuickPicker.tsx:21-24,82-87`: suppress the price label when it would duplicate the title token (and for the synthetic default offering). **Accept:** chip reads "Custom quote". |
| **W0-H QA enabler: guest reset** | sonnet | S | — | `POST /api/dev/reset-guest`: rotates the guest session cookie. Gated: dev mode OR authenticated staff session (prod-safe, mirrors dev-signin pattern). **Accept:** orchestrator can mint a fresh guest on localhost and (staff-authed) on prod. |
| **W0-I E2E lifecycle spec** | opus | M | W0-A..E, H | `e2e/guest-chat-lifecycle.spec.ts`: fresh guest → add 3 talent → set date/location → single coalesced note → reload → same draft resumed → send with contact → status submitted + coordinator seated → post-send chip write refused → reopen resumes SENT thread (not a new draft). **Accept:** green locally against dev server. |
| **W0-J Phantom-draft janitor** | sonnet | S | W0-A shipped | Script: archive drafts with zero guest messages whose lineup is a subset of a sibling same-session inquiry. Dry-run report first; **prod write requires owner OK** (flagged at run time). |

Firing order: Track-1 `A → B → D` (guest-chat-actions/lifecycle files) ∥ Track-2 `C → E` (chips file) ∥ Track-3 `F` ∥ Track-4 `G + H` in parallel; then `I`; `J` after the wave ships. Wave gate: E2E green + orchestrator Chrome pass (§5) + PR + deploy:smoke + prod fresh-guest walk.

### Wave 1 — Panel geometry (serialized on the panel files, one worktree)

| Lane | Model | Size | Spec + acceptance |
|---|---|---|---|
| **W1-A Decomp pre-pass** | sonnet | M | God-file pattern: byte-stable extraction from `MiniChatPanel` (798), `MiniChatPanelColumn` (783), `TalentProfileChatLauncher` (769) into focused modules; ONE atomic commit; zero behavior change (tsc + resolver tests + snapshot of rendered DOM as proof). Prerequisite for every lane below. |
| **W1-B Band-stack redesign** | opus | L | Max 3 fixed bands (header / thread flex:1 / composer+details-chips). The floating icon rail dies in compact mode; details become a horizontal chip row above the composer (Date ✓ · Location · Budget…), tap → bottom-sheet editor (reuse existing editors). Draft banner shrinks to a one-line lock chip in the header. **Accept:** 620px panel shows ≥8 message lines in a draft with all details set; nothing clips; nothing overlays the thread. |
| **W1-C Send always reachable** (P0-4a) | opus | S/M | SendToAgencyBar renders whenever `status=draft`, compact AND expanded; save-card appears only post-send; `ClaimEmailRecap` replaces (never stacks with) `GuestAccountToolkit`. **Accept:** expanded draft has a visible Send control (DOM-verified); exactly one account CTA exists at any moment. |
| **W1-D Pill simplification** (P1-8, D8) | opus | S/M | Stack of ≤3 faces + "+N" chip carries the whole count; the separate count bubble dies; per-avatar X dies (removal in panel); overhang gets real reserved space (padding inside the fixed wrapper, not margin). **Accept:** zoom-clean at 9 talent in every CTA state; nothing clips or doubles. |
| **W1-E Scroll + containment** (P0-4b) | sonnet | XS/S | `overscroll-behavior: contain` on all panel scrollables; expanded details column bounded with sticky section header. **Accept:** wheel inside panel never scrolls the page. |
| **W1-F Expand = real lightbox** | opus | L | Radix-dialog lightbox (favorites-modal quality bar): desktop centered two-pane (projects left, thread center, details summary right), mobile 100dvh sheet; focus trap, ESC, scroll lock. Replaces the text-link footer with a proper icon button in the header. **Accept:** Chrome QA of open state w/ real clicks; bbox measurements; keyboard walk. |
| **W1-G Services strip placement** (P1-13b) | sonnet | S | Mount above the composer inside the column, adopt the `C` palette + accent chain, i18n. **Accept:** visible un-clipped in draft state, follows tenant accent. |
| **W1-H Small fixes batch** (P1-12, P1-15) | sonnet | S | Greeting gated on `rows.length===0`; status strip actor = "{first} from {agency}"; dead props/z-index INT_MAX cleanup. |

Order: A → B → (C ∥ D ∥ E) → F → (G ∥ H). Wave gate: orchestrator visual-matrix QA (§5) on lvh proxy + mobile viewport + prod after merge.

### Wave 2 — Dock IA + identity + mounting (parallel tracks)

| Lane | Model | Size | Spec + acceptance |
|---|---|---|---|
| **W2-A Dock views: Chat / Lineup / Projects** | **fable** | L | Segmented header. Lineup = two shelves ("In your inquiry" = saved_talent; "Saved" = client_favorites) with move/remove actions (stores never merge; reuse favorites-modal bridge). Projects = auto-named cards ("{eventType} · {date}", stored in `interpreted_query.project_label`, editable), status chip (Draft — only you can see this / Sent · awaiting {agency} / {agency} replied), last-message preview, face row. **Accept:** two projects are visually unmistakable in 1s; rename persists; removal from Lineup updates the pill. |
| **W2-B Honest pill + reply pulse** | opus | M | One label matrix (§4) across home/directory/profile/builder mounts; unread-reply detection (lastMessageRole + last-seen marker) → pulse + "{agency} replied". **Accept:** same session shows the SAME label on all surfaces (screenshot triplet); reply flips the pill within one poll cycle. |
| **W2-C Mount everywhere + `show_on_home`** | opus | M | **Owns the wave's only migration.** Layout-level mount for tenant hosts (root page branches + `(public)/layout.tsx`) so builder home/directory and `/p/*` pages get launcher + providers; settings drawer gains Home toggle; `revalidatePath` set extended. **Accept:** builder-published home shows the dock; toggle hides it; `db:push` done pre-merge. |
| **W2-D Identity bridge** | **fable** | M/L | Authenticated session on tenant host → dock recognizes it: header "Signed in as {name}", threads resolved by `client_user_id` (client variant of listGuestInquiries), save-cards suppressed, "Open full view" deep-links `/{tenant}/client/messages?inquiry=…`. RLS-reviewed. **Accept:** signed-in owner/client never sees "Save this conversation"; guest→magic-link→return lands in the same dock state. |
| **W2-E Front-door collapse** | opus | M | Retire review bar (after W2-A); header Send → dock; profile guest+client CTAs → dock (client path stops opening InquiryDrawer); EditorialSplit CTA → `requestOpenChat()`; DirectoryInquirySheet unmounts from public layout; InquiryDrawer remains dashboard-only (D6). **CHECKPOINT: diff against `feat/home-directory-marathon` before starting** — coordinate, don't double-build. |
| **W2-F Reply email nudge** (D7) | opus | M | On coordinator reply to a guest inquiry with real contact + no guest view since reply: one email ("Impronta replied about {project}") with the `/c/{id}` link; per-inquiry throttle (max 1/reply-burst, quiet hours); reuse Resend + existing notification patterns. **Accept:** E2E: reply → email fires once; second reply within window → no second email. |
| **W2-G Guest recovery entry** | sonnet | S | Empty dock: "Been here before?" email field → `sendGuestClaimToEmail`. **Accept:** new device regains projects via email link. |
| **W2-H i18n sweep** | sonnet | S | Full en/es/fr parity for every W1+W2 string; no em dashes. |
| **W2-I Smart-fill (AI reads the chat → fills the details)** | opus (build); runtime model = **claude-haiku-4-5** | M | **Extends the EXISTING Lane-D extractor** `src/lib/inquiry/guest-message-extract.ts` (fires once, first message only, fresh-create path only — `guest-chat-actions.ts:745`). (a) Run extraction after EVERY guest message on draft inquiries (early-row path included), over the last ~6 messages + current field state; (b) fill EMPTY fields only, written via the unified patch path with `source:'ai_suggested'` metadata — chips render "Auto-filled" with tap-to-edit; NEVER overwrite user-set/confirmed values; never mutate sent inquiries (respects W0-C freeze; post-send extraction surfaces as coordinator-side suggestions only); (c) "Scan conversation" sparkle button in the details area → whole-thread extraction → confirm sheet ("Found: Date · Location · Budget — Apply / pick"); (d) cheap regex pre-filter (digits, currency, month names, "people/persons/models", date words) gates the auto path so chit-chat doesn't call the model — cost is negligible either way; the filter is for latency/noise; (e) reuse the EXISTING gates verbatim: `getAiFeatureFlags`, `assertAiInvocationAllowed`, `recordAiUsageEstimate`, 6s timeout, best-effort fail-open-to-nothing; (f) model set to `claude-haiku-4-5` via the ai-providers config for this feature (cost row already exists in `ai-model-costs.ts`). Coalescing from W0-E keeps AI writes from spamming notes. **Accept:** typed "beach party Aug 14 in Tulum, around $4k, need 6 models" → Date/Location/Budget/Headcount/Type chips fill as suggestions within ~2s; user-set field never changes; AI-off flag → feature silently absent; per-scan cost logged < $0.005. |

Tracks: (A → B, E) ∥ (C) ∥ (D) ∥ (F, G) ; H last. Wave gate: full Mike-journey QA (§5) on localhost AND prod, desktop + mobile.

### Wave 3 — Hub Concierge

| Lane | Model | Size | Spec |
|---|---|---|---|
| W3-A Hub landing mount + Concierge identity | opus | M | Dock on hub landing + hub directory; "Tulala Concierge" header, hub greeting, "Send — we'll route it" CTA. |
| W3-B Routing receipt | **fable** | M | Post-send receipt explains routing honestly within CURRENT safe semantics (single owning agency per inquiry; independents direct). **Constraint:** XTENANT_REHOME money P0s are unresolved and its flag is OFF — this lane must NOT widen cross-tenant fan-out; copy + routing metadata only. |
| W3-C Directory data hygiene (country/city normalization) | sonnet | S | Separate concern — spawn as its own task; not blocking. |

### Wave 4 — Craft, a11y, instrumentation, re-audit

| Lane | Model | Size | Spec |
|---|---|---|---|
| W4-A Motion polish (dock open spring, kept fly-to-pill, reply pulse) | sonnet | S | reduced-motion safe. |
| W4-B Light brand tint (accent-washed surfaces; LIGHT only — dark stays dead) | sonnet | S | |
| W4-C A11y pass (focus order across views, aria-live for notes/status, contrast re-check) | opus | M | |
| W4-D Funnel instrumentation on existing pipe (`dock_view`, `lineup_add`, `details_set`, `send`, `reply_seen`, `claim_click`, per-surface) + a duplicate-draft counter that should flatline | sonnet | S | |
| W4-E Adversarial review + scored re-audit | **fable** (orchestrator) | M | /code-review high on the accumulated diff + full Chrome re-audit with the §7 scorecard; publish `…-reaudit` doc. |

---

## 4. Copy matrix (binding for all lanes)

| Resolver state | Pill label | Panel banner/receipt |
|---|---|---|
| empty | "Message {agency}" | greeting only |
| draft, lineup N | "Your lineup · {N}" | lock chip "Draft. Only you can see this." |
| draft, no lineup | "Finish your inquiry" | same |
| sent, awaiting | "Inquiry sent" | "{agency} has your inquiry." + "{first} from {agency} is on it" |
| replied, unseen | "{agency} replied" (pulse) | thread |
| booked/terminal | "Message {agency}" | thread with booking card |
| hub variants | same states, agency = "Tulala Concierge" | routing receipt |

es/fr equivalents ship with each lane. No other lifecycle copy may be invented by a lane agent.

---

## 5. QA protocol (orchestrator-owned, every wave)

1. **Local:** dev server + tenant proxy (`impronta.lvh.me` pattern); fresh guest via W0-H; drive with Chrome MCP REAL clicks (Radix ignores programmatic `.click()`); measure open-state bboxes; check clipping/occlusion per the "QA the OPEN state" rule; mobile viewport pass.
2. **Matrix per wave:** {empty, draft, sent, replied} × {compact, expanded} × {home, directory, profile, builder page, hub} × {desktop, mobile} — screenshots archived in the wave PR.
3. **Prod:** after merge + deploy:smoke → staff-gated guest reset on improntamodels.com → full Mike walk (no test-row litter beyond one clearly-marked QA inquiry per wave; purge list maintained).
4. **Data checks:** duplicate-draft count per session (must be 1), note count per lineup burst (must be 1), post-send `selected_ids` immutability.
5. Supabase free-tier egress throttle wedges image-heavy dev QA — do image passes in one clean run; on 402/image errors check quota first.

## 6. Risks + constraints

- `captureGuestChip` also serves non-guest chip paths — W0-C must verify client/admin callers before tightening (grep call sites; add tests).
- Marathon branch (`feat/home-directory-marathon`) touches directory front doors — W2-E checkpoint mandatory.
- XTENANT money P0s: W3-B is copy/metadata only; no new cross-tenant fan-out.
- PostgREST jsonb containment filter needs a live query test early in W0-A (fallback: two-step fetch + in-memory filter; still no migration).
- 800-line cap: any lane pushing a capped file must extract first (W1-A pattern).
- Prod DB = dev DB: janitor (W0-J) and any data write stays owner-gated.

## 7. Success metrics (existing analytics pipe; baseline captured before W1)

- **Anchor:** guest `contact_promoted` (send) rate per dock-open. Target: +30% by end of W2.
- Duplicate drafts per guest session: → 1.00 after W0 (hard invariant, telemetered).
- Reply-seen rate within 24h: baseline → target +50% after W2-B/F.
- Claim-link click-through after send: baseline → target 2× after W1-C/W2 framing.
- Re-audit score target: 4.5 → **8/10** after W4 (honest per-dimension, not summed).
