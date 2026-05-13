# Premium Execution Plan — Tulala
**Date:** 2026-05-12
**Status:** Synthesis of 5 parallel surface audits (client / admin / talent / public+onboarding / cross-cutting) executed after Waves 1-6 audit-recovery sweep landed on `phase-1`.

---

## Executive summary

The platform is **functionally live** (`tulala.digital` + `app.tulala.digital`) and the inquiry-to-booking loop now works end-to-end (client→admin→talent messaging, talent attachment, mark-read RPCs). The 2026-05-12 audit-recovery sweep closed the P0 pipeline bugs.

However, audit surfaces **~60 cross-cutting gaps** that hold the product back from feeling premium:

| Bucket | Severity mix | Effort estimate |
|---|---|---|
| **A. Foundation gaps** (silent failures, type holes, RLS edge cases) | 3 × P0, 7 × P1 | ~5 days |
| **B. Mock-data leaks** (calendar, notifications, public talent profile, workspace registry) | 4 × P1 | ~10 days |
| **C. System consistency** (toast/error/result shapes, empty/loading states, i18n) | ~12 × P1 | ~7 days |
| **D. Mobile + accessibility** (viewport, touch targets, aria, focus mgmt) | 5 × P1, 8 × P2 | ~4 days |
| **E. Trust signals & first impressions** (login, branded 404s, OG images, claim flow, social proof) | 1 × P0, 6 × P2 | ~4 days |
| **F. Backend features behind toast stubs** (team invite, deposits, payment methods, …) | 15 × stubs | scoped per feature; ~3 weeks total |
| **G. Polish** (optimistic UI, microcopy personalization, message edit/delete) | 8 × P2/P3 | ~3 days |

**Total realistic effort to "premium":** ~6 focused weeks of Sonnet/Opus work + 1 week of human-driven QA. Phases A–E ship the *feeling* of premium without building new feature surface area; Phase F is real product growth.

---

## Top-10 highest-impact items (ship first)

These move the most needle for the smallest cost. Do them in order:

1. **🔴 P0** — Unregistered host returns plain-text error → branded 404. *First impression for mistyped/dead custom domains is currently a developer error message.* (`web/src/proxy.ts:120-127`)
2. **🔴 P0** — Silent `catch { return null }` in `admin/media/actions.ts` (2 sites) → log + return `{ ok: false }`. *Upload/edit failures vanish.*
3. **🔴 P0** — `_data-bridge` queries don't re-verify staff role on every call (cached scope assumption). *Drawer caller bypass risk.* Wrap in `guardedQuery<T>(fn, role)`.
4. **🟠 P1** — `WORKSPACE_REGISTRY` mock object in `messages.tsx:273-290` rendered to real users. *Plan tier, signature, branding pulled from hardcoded fixture.*
5. **🟠 P1** — Notifications drawer (`drawers.tsx:17636`) reads `NOTIFICATIONS` fixture; honest copy shipped in Wave 6 but the *real* notifications backend (1 table + 1 hook + event-stream subscription) is the durable fix.
6. **🟠 P1** — Talent calendar (`talent.tsx:11015-11080`) is mock-only. The 3-table Phase-5 data model (`talent_bookings` / `talent_holds` / `talent_availability_blocks`) is the right shape — wire the bridge.
7. **🟠 P1** — Public talent profile (`web/src/app/share/talent/[slug]/page.tsx`) is 100% `MOCK_TALENT`. Only public-facing talent surface; currently useless for share links.
8. **🟠 P1** — Mobile viewport metadata incomplete in `app/layout.tsx`. *Storefronts discovered from Instagram render at desktop width on phones.*
9. **🟠 P1** — `force-dynamic` admin pages lack route-aware `loading.tsx`. *Tab nav within `/admin/*` flashes blank, then content.*
10. **🟠 P1** — Talent ↔ Workspace hybrid toggle exists in state but no visible button. *Onboarding step that promises both surfaces — never discoverable.*

---

## What "premium" means for Tulala specifically

The product positions against:
- WhatsApp/Email chaos (the user's stated direction in `project_product_vision.md`)
- Bloated agency-management tools (Salesforce, generic CRMs)
- Custom-built agency sites that rot

So premium ≠ "more features". Premium = **the four trust gates**:

1. **No silent failures.** Every action either says "done" or says "this failed because X, try Y."
2. **No fake data.** What you see is the truth about your workspace; if a number is demo, it's labeled.
3. **No work lost.** Forms preserve state on error, optimistic UI reverts cleanly, no orphaned drafts.
4. **No surprise.** Destructive actions confirm, sensitive ones explain, the next step is always one click away.

The plan below is organized by which trust gate each fix services.

---

## Section 1 — Consolidated audit findings

### 1.1 Client surface

| ID | Sev | Where | Finding | Trust gate |
|---|---|---|---|---|
| CLI-1 | P0 | `_ParticipantThreadShell.tsx:164-167` | Failed `sendMessage()` removes optimistic bubble but doesn't restore body to textarea — user retypes | No work lost |
| CLI-2 | P1 | `new-inquiry-form.tsx:119-185` | No inline field validation; round-trip only | No surprise |
| CLI-3 | P1 | `inquiries/[id]/page.tsx:116-119` | "Coordinator" fallback hides which staff person — no avatar or secondary id | No surprise |
| CLI-4 | P1 | `_ParticipantThreadShell.tsx:284-301` | Send button shows opacity change only, no "Sending…" or spinner | No silent failures |
| CLI-5 | P1 | `today/page.tsx:80-91` | Relative dates ("2d ago") never refresh after mount — drift if tab left open | No surprise |
| CLI-6 | P2 | `inquiries/page.tsx:330-346` | Empty state generic ("No inquiries yet") — no client name, no agency reference | (polish) |
| CLI-7 | P2 | `bookings/page.tsx:45-155` | No "Add to calendar" / iCal export on confirmed bookings | (polish) |
| CLI-8 | P2 | `today/page.tsx:320-373` | Sticky action bar can occlude content under 640px viewport | Mobile |
| CLI-9 | P2 | `_ParticipantThreadShell.tsx:197-235` | Sent messages immutable — no edit/delete affordance | (polish) |
| CLI-10 | P2 | `DiscoverShell.tsx:245-265` | Search/filter has no debounce or pending signal — feels broken on slow networks | No silent failures |

### 1.2 Admin surface

| ID | Sev | Where | Finding | Trust gate |
|---|---|---|---|---|
| ADM-1 | P1 | `messages.tsx:273-290` | `WORKSPACE_REGISTRY` mock hardcoded (signature, plan tier, name) — real workspace identity not wired | No fake data |
| ADM-2 | P1 | `pages.tsx:1124, state.tsx:7348` | Talent↔Workspace hybrid mode toggle present in state, no visible UI button | (discoverability) |
| ADM-3 | P1 | `drawers.tsx:1308, 1461, 1789` | "Toast and close" save pattern — no "Saved ✓" state, no dirty indicator | No silent failures |
| ADM-4 | P1 | `pages.tsx:147 (DemoDataBanner)` | Lists fall back to MOCK fixtures with no demo banner shown on the surface | No fake data |
| ADM-5 | P2 | `drawers.tsx:1434, 1477, 3291, 7115, 13550` | Theme picker hardcodes accent colors (gold/rust/warm) outside COLORS system | (consistency) |
| ADM-6 | P2 | `drawers.tsx:6127, 6226, 10201, 10515` | Error-state colors `#C82828` inline instead of `COLORS.red` | (consistency) |
| ADM-7 | P2 | `drawers.tsx:2532-2695` | TalentTypesDrawer error renders raw text — no retry button | No silent failures |
| ADM-8 | P2 | `pages.tsx:577, 630-650` | Roster badge collapses approvals + verifications to one number; tooltip only | (clarity) |
| ADM-9 | P2 | `messages.tsx:402-488` | Pinned-row hover actions visible always; unpinned only on hover — inconsistent | (consistency) |
| ADM-10 | P3 | All Settings tabs | No "unsaved changes" warning if user tabs away | No work lost |
| ADM-11 | P3 | Various taxonomy drawers | Remove/add operations not optimistic — feel slower than they are | (perceived perf) |
| ADM-12 | P3 | All drawers | No focus management on open — keyboard users tab from top of page | Accessibility |

### 1.3 Talent surface

| ID | Sev | Where | Finding | Trust gate |
|---|---|---|---|---|
| TAL-1 | P1 | `talent.tsx:11015-11080` | Calendar = mock TALENT_BOOKINGS / TALENT_REQUESTS only; bridge unwired | No fake data |
| TAL-2 | P1 | `wave2.tsx:2203-2350, talent.tsx:6017-6022` | Notifications drawer reads `MOCK_TALENT_NOTIFS` — no real event source | No fake data |
| TAL-3 | P1 | `inbox/[id]/page.tsx:10-17` | Deep links to thread redirect to list — invite emails dump talent at inbox root | No surprise |
| TAL-4 | P2 | `talent-drawers.tsx:4455-4522` | Photo upload errors generic ("Could not send message") — file/size/format not surfaced | No silent failures |
| TAL-5 | P2 | `state.tsx:7348, pages.tsx:1124` | Hybrid mode toggle invisible — feature exists but no entry point | (discoverability) |
| TAL-6 | P2 | `share/talent/[slug]/page.tsx:23-58` | Public talent share page = 100% mock; only entry point for unauthenticated visitors | No fake data |
| TAL-7 | P2 | `talent.tsx:4046-4058, 4469-4497` | Trust badges render if present but never sourced — `talent_profiles.badges` always `[]` | (trust signal) |
| TAL-8 | P2 | `talent.tsx:351-400` | Client trust chips (`ClientTrustChip`) missing from inbox rows — spec calls them out | (trust signal) |
| TAL-9 | P2 | `talent.tsx:6272-6367` | Mobile pane system exists but back affordance unclear, no device QA evidence | Mobile |
| TAL-10 | P3 | `talent.tsx:245, 782, 3334+` | Mock fixture names ("Marta", "Atelier Roma") in comments/constants | (code hygiene) |

### 1.4 Public + onboarding

| ID | Sev | Where | Finding | Trust gate |
|---|---|---|---|---|
| PUB-1 | **P0** | `proxy.ts:120-127` | Unregistered host → plain-text 404 "Host not registered. Seed agency_domains." | First impression |
| PUB-2 | P1 | `app/(auth)/login/login-form.tsx:43-62` | No "Remember me" / extended session | (friction) |
| PUB-3 | P1 | `app/layout.tsx (viewport)` | Viewport metadata incomplete — mobile renders at desktop width | Mobile |
| PUB-4 | P1 | `app/page.tsx:52-64` | No OG-image fallback per-agency — social shares are text-only | First impression |
| PUB-5 | P1 | Agency storefront (empty roster) | Empty roster page renders blank — no "claim your talent" CTA | First impression |
| PUB-6 | P2 | `directory/cart/page.tsx:13-32` | Guest inquiry: success modal in sheet, URL params stripped, no persistent confirmation page | No surprise |
| PUB-7 | P2 | `directory/actions.ts (submitGuestInquiry)` | No "create account to track" flow after guest submit | (conversion) |
| PUB-8 | P2 | `app/onboarding/role/*` | Role selector bare — no description of what Talent vs Client/Agency unlocks | (clarity) |
| PUB-9 | P2 | `app/onboarding/actions.ts:229-300` | Form state lost on validation error — user re-fills everything | No work lost |
| PUB-10 | P2 | Talent claim invite | Email link doesn't propagate workspace context; talent lands at `/login` not `/[slug]/talent/claim?token=…` | (continuity) |
| PUB-11 | P2 | `app/error.tsx:1-52` | Storefront 5xx says "agency may need to check configuration" — visitor blames agency | First impression |
| PUB-12 | P2 | `proxy.ts:296-299` | 404 on bad storefront paths returns plain text, not branded `not-found.tsx` | First impression |
| PUB-13 | P2 | Storefronts globally | No "Powered by Tulala" / verified-agency footer badge | Trust signal |
| PUB-14 | P3 | `auth/actions.ts:40-68` | Password reset confirmation page wording ambiguous after click-through | No surprise |

### 1.5 Cross-cutting concerns

| ID | Sev | Concern | Pattern | Frequency |
|---|---|---|---|---|
| XC-1 | **P0** | Silent `catch { }` swallowing errors | `media/actions.ts:85, :95`, `site/CopyUrlButton.tsx` | Rare but critical (5 sites) |
| XC-2 | **P0** | `_data-bridge` doesn't re-verify role on every call | Caller relies on cached layout scope | 1 systemic pattern |
| XC-3 | P1 | Inconsistent error messages — 3 incompatible strategies | Generic fallback / reason-mapped / raw propagation | Pervasive |
| XC-4 | P1 | Server action result shapes inconsistent — 2 shapes coexist | `{ok, data}` vs `{error}` only | Every action file |
| XC-5 | P1 | `force-dynamic` admin layouts with no route-aware `loading.tsx` | Tab nav flashes blank | 15+ pages |
| XC-6 | P1 | Empty states without CTAs | "No data" vs "Add your first X →" | ~80% of lists |
| XC-7 | P1 | Three uncoordinated notification systems | `toast()` queue / `AlertRow` panel / browser `alert()` | Pervasive |
| XC-8 | P2 | ~285 `as any` / `as unknown` casts — type holes | Bypass Supabase typing, context shapes | 1/50 lines TS |
| XC-9 | P2 | `useOptimisticMutation` hook defined but under-used | 76 `startTransition` refs, only ~10 optimistic | Common miss |
| XC-10 | P2 | ~10% of user-facing copy not `t()`-wrapped | Server actions, inquiry-alerts, raw toasts | Common |
| XC-11 | P2 | Fire-and-forget promises without `.catch(logServerError)` | View counts, preference saves | Rare in admin; common in telemetry |
| XC-12 | P2 | `.maybeSingle()` results unwrapped without null guard | Mostly guarded, ~15 sites still raw | Rare |
| XC-13 | P2 | Schema drift script reports 179 errors — only 2 are real bugs | Script can't parse PostgREST nested selects | False positives dominant |

---

## Section 2 — The premium bar (quality gates per surface)

Before writing code: every new task in Phases A–G must satisfy this checklist OR explicitly note why it can't.

**Every server action must:**
- Return `{ ok: true; data?: T } | { ok: false; error: string }` (the canonical `ServerActionResult<T>`).
- Call `requireStaffTenantAction()` or equivalent role guard at the top.
- Wrap external calls in try/catch and `logServerError("context", err)` on failure.
- `revalidatePath()` after a successful mutation when the change is visible elsewhere.

**Every mutation trigger (button, form, drawer footer) must:**
- Show a pending state (spinner, disabled, "Saving…").
- Show success feedback (toast + visible "Saved" pill or state change).
- Show error feedback (toast with **specific** message; never `"Failed"` alone).
- Preserve input state if the mutation fails.
- For destructive actions: confirm via `<ConfirmDialog>`, never bare toast.

**Every list / feed / table must have:**
- A loading state (skeleton or spinner — never blank).
- A "no rows, ever" empty state with a primary CTA.
- A "filtered to nothing" empty state distinct from "no rows" (with a "clear filters" action).
- An error state with retry.

**Every page route must:**
- Have a `loading.tsx` if it's `force-dynamic` or fetches in server components.
- Have an `error.tsx` boundary with branded fallback.
- Render proper viewport/og meta for public surfaces.
- Run i18n through `useCopy()` / `copy.t()` — no raw English in user-visible code.

**Every mobile breakpoint must:**
- Touch targets ≥ 44px.
- No fixed-width content that exceeds viewport.
- No floating UI occluding the last content row.
- Keyboard-dismissible composers with visible "back" affordances.

---

## Section 3 — Phased execution plan

Phases are designed to be **independently shippable** — each one ends with a deployable, regression-free state. Estimated durations assume sonnet-grade agents with focused prompts; opus may compress by 30%.

### Phase A — Foundation gaps (P0 first) — *3-5 days*

**Goal:** No silent failures. No data-access risks. Trust gate: "no silent failures."

| Task | Files | Effort | Verify |
|---|---|---|---|
| A.1 — Branded 404 for unregistered hosts | `proxy.ts:120-127`, new `app/host-unregistered/page.tsx` | 2h | curl bad host → branded page |
| A.2 — Replace silent catches with logged errors | `media/actions.ts:85,95`, `site/CopyUrlButton.tsx` | 1h | grep `catch { }` returns 0 hits |
| A.3 — `guardedQuery<T>(fn, role)` wrapper | new `lib/server/guarded-query.ts`, wrap all `_data-bridge/*` calls | 1d | Server action audit shows every read passes through wrapper |
| A.4 — Canonical `ServerActionResult<T>` type + audit | new `lib/server-actions/result.ts`, sweep all server actions | 1d | TS check + grep for `{ error: ` non-conforming shapes |
| A.5 — `logServerError` everywhere `void promise` | sweep + replace with `.catch(logServerError)` | 4h | grep `void [a-z]+(` in components |
| A.6 — `.maybeSingle()` null-guard lint rule | `eslint-plugin-local` or codemod | 4h | CI fails on any unguarded maybeSingle |
| A.7 — Inline-validation pattern on critical forms | `new-inquiry-form.tsx`, `onboarding/actions.ts` | 1d | Submit empty form → inline errors |

**Exit criteria:** P0 count = 0. Lint passes. CI green. `grep -rn "catch { }" web/src` returns nothing.

---

### Phase B — Real-data wiring (kill the prototype) — *8-12 days*

**Goal:** Every screen shows the user's actual workspace, not a fixture. Trust gate: "no fake data."

| Task | Files | Effort | Verify |
|---|---|---|---|
| B.1 — Wire `WORKSPACE_REGISTRY` to real settings | `messages.tsx:273-290`, new `getWorkspaceIdentity(supabase, tenantId)` server data fn | 1d | Switch workspace → signature/plan reflect real data |
| B.2 — Real notifications backend (Phase X) | new migration `user_notifications` table + RLS, `lib/notifications/*` event-emitter wired to existing inquiry-events, new `useNotifications()` hook, NotificationsDrawer rewire | 4d | Submit inquiry → talent gets row in `user_notifications`; drawer shows it; mark-all-read works |
| B.3 — Talent calendar Phase 5 data model | migrations `talent_bookings` + `talent_holds` + `talent_availability_blocks` w/ RLS, bridge in `_data-bridge/talent-calendar.ts`, wire `talent.tsx:11015-11080` | 4d | Confirmed booking appears on talent's calendar |
| B.4 — Public talent profile real data | `app/share/talent/[slug]/page.tsx` — resolve slug → `talent_profiles`, load `media_assets` for gallery, fallback for 404 | 1d | Visit share link → real talent renders |
| B.5 — Empty roster CTA on storefront | `agency-home-storefront.tsx` — detect 0 published, render "Add your first talent →" linking to admin | 4h | Fresh agency storefront → friendly empty state |
| B.6 — Trust badges source from DB | schema check on `talent_profiles.badges`, populate via verification-event hooks (ID/age/agency) | 2d | Verify identity → badge appears on profile + inbox |
| B.7 — Client trust chips on talent inbox | `talent.tsx:351-400` add `ClientTrustChip` rendering | 4h | Inbox shows tier next to client name |

**Exit criteria:** `grep -rn "MOCK_\|TENANT\." web/src` returns only test/fixture-prototype-mode hits. Every list/feed reads from a real source. Phase 5 calendar data model migrations applied.

---

### Phase C — System consistency — *5-7 days*

**Goal:** One way to do each thing across the codebase. Trust gate: "no surprise."

| Task | Files | Effort | Verify |
|---|---|---|---|
| C.1 — Centralized error-copy lexicon | new `lib/i18n/error-copy.ts` (10-15 reason codes), `useCopy()`-wired, replace `CLIENT_ERROR` raw strings | 1d | Same error reason → same message everywhere |
| C.2 — Single `useToast()` API | rewrite `state.tsx` toast queue, kill browser `alert()` callsites, document timings (success 3s / error 6s / info 4s) | 1d | One toast component class; consistent durations |
| C.3 — Standard empty-state component | new `EmptyState` variant with `primaryAction`, sweep all lists | 1d | Every list has CTA-carrying empty state |
| C.4 — Standard loading-state component | route-aware `loading.tsx` for `/admin`, `/client`, `/talent`; skeleton matched to next surface | 1d | Tab nav within `/admin/*` shows skeleton, never blank |
| C.5 — Audit + fix server-action result shapes | sweep, convert non-conforming shapes | 4h | TS narrowing works on every call site |
| C.6 — `i18n` wrap sweep | grep raw English in user-visible strings (server actions, alerts, toasts); wrap with `t()` keys | 1d | Locale toggle changes ALL strings |
| C.7 — Save-state visibility — `Saved ✓` pill | drawers + form footers; reusable `SaveStateIndicator` component | 1d | Every save shows idle → saving → saved/error |

**Exit criteria:** One toast API, one error-copy table, one empty-state pattern, one save-state pattern. i18n locale toggle changes every visible string.

---

### Phase D — Mobile + accessibility — *3-5 days*

**Goal:** Premium on a 375px phone. Trust gate: "no surprise" (on any device).

| Task | Files | Effort | Verify |
|---|---|---|---|
| D.1 — Fix viewport metadata | `app/layout.tsx` viewport export | 30min | iPhone Safari renders at correct width |
| D.2 — OG-image fallback per agency | new `app/api/og/agency/[tenantSlug]/route.tsx` (Vercel OG image gen) | 1d | Social share shows agency-branded card |
| D.3 — Mobile occlusion sweep | sticky bars, composers, modal scrollers across client/talent surfaces | 1d | No content hidden under floating UI on 375px |
| D.4 — Touch-target audit | all icon-only buttons → ≥44px hit zones | 4h | Lighthouse mobile usability ≥ 95 |
| D.5 — Focus management on drawer open | drawer primitives — focus first input, trap focus, restore on close | 1d | Tab-only nav works in every drawer |
| D.6 — Color-contrast lint | extract `statusTone()`, validate WCAG AA on all status chips | 4h | All chips pass AA |
| D.7 — ARIA labels on icon buttons | sweep `aria-label` on send / pin / delete / icon buttons | 4h | Screen reader names every action |

**Exit criteria:** Lighthouse mobile score ≥ 90 across 5 sample pages (storefront, login, client thread, admin inbox, talent profile).

---

### Phase E — Trust signals & first impressions — *3-5 days*

**Goal:** A stranger landing on a storefront trusts the platform. Trust gate: "first impression."

| Task | Files | Effort | Verify |
|---|---|---|---|
| E.1 — Branded 5xx page on storefronts | `app/error.tsx` route-aware (storefront vs admin vs hub) | 4h | Trigger 500 on storefront → branded error |
| E.2 — Branded 404 for bad storefront paths | route through `not-found.tsx` instead of plain text | 2h | Visit invalid path → branded |
| E.3 — Login UX upgrade | "Remember me" checkbox, OAuth surface check, error messages friendly | 1d | Sign in feels like a current product |
| E.4 — Guest-inquiry confirmation page | persistent success page with "create account to track" CTA + email pre-fill | 1d | Submit guest inquiry → clear next step |
| E.5 — Talent claim flow context | propagate tenant + token through login redirect | 1d | Click invite email → land on `/[slug]/talent/claim?token=…` after auth |
| E.6 — Workspace onboarding role descriptions | role-select cards with what each unlocks | 4h | New user understands path |
| E.7 — Onboarding form state preservation | save FormData to localStorage, restore on error | 4h | Validation error doesn't lose typed values |
| E.8 — Powered-by-Tulala footer | branded footer badge on storefronts (toggleable per agency) | 2h | Storefront has trust marker |

**Exit criteria:** First-time visitor experience tested on storefront, hub, login, guest-inquiry, talent-claim. Each path has branded errors and clear next steps.

---

### Phase F — Behind-the-toast features (real backend work) — *3 weeks; scope per feature*

**Goal:** Replace the ~15 toast-only stubs with real working features. Trust gate: "no fake promises."

Each item is a self-contained mini-project. Tackle in priority order:

| Feature | Effort | Notes |
|---|---|---|
| F.1 — Team invite (admin) | 3d | Email infra check, role assignment, accept flow |
| F.2 — Resend claim invite (talent) | 1d | Reuses existing `sendTalentInvitedNotification` |
| F.3 — Add alternate domain | 5d | DNS verification + Vercel alias automation |
| F.4 — Payment method editor | 5d | Stripe Connect dance, KYC if needed |
| F.5 — Wire deposit / bank link | 5d | Plaid/TrueLayer integration |
| F.6 — Cancel subscription / downgrade | 3d | Stripe subscription state machine + win-back |
| F.7 — Talent take-over (agency-managed) | 2d | Workflow status transition + persistence |
| F.8 — Reject all profile changes | 2d | Persist rejection event + email notify |
| F.9 — Brief saved (pre-fill inquiry) | 1d | LocalStorage + URL param hydration |
| F.10 — Schedule saved | 2d | Availability persistence |
| F.11 — Privacy settings save | 1d | `user_prefs` extension |
| F.12 — Notification preferences save | 1d | Channels × event types matrix |
| F.13 — Migration queued | 3d | Background job runner; depends on Phase B notifications backend |
| F.14 — Plan compare drawer | 1d | Static content + tier matrix |
| F.15 — Mark-all-read | 4h | Depends on Phase B notifications backend (B.2) |

**Exit criteria:** `grep -n "onClick={() => toast(" web/src/components/admin/shell/internal/drawers.tsx` returns only confirmed-prototype features with explicit "Demo · prototype data" labels.

---

### Phase G — Polish & optimistic UX — *2-3 days*

**Goal:** Speed (perceived). Microcopy. Tiny delights.

| Task | Effort |
|---|---|
| G.1 — Apply `useOptimisticMutation` to 10 high-frequency operations (pin, mark-read, reorder, toggle requirement-group) | 1d |
| G.2 — Personalize empty states with user name + agency name | 4h |
| G.3 — Message edit / delete (client + talent thread, 30s window) | 1d |
| G.4 — Add-to-calendar on confirmed bookings | 4h |
| G.5 — Real-time relative dates (`useEffect` interval) | 2h |
| G.6 — Hover-action consistency on inbox rows | 2h |
| G.7 — Read receipts (visible "Seen at HH:MM" on threads) | 4h |
| G.8 — Unsaved-changes warning on Settings nav-away | 2h |

**Exit criteria:** Feels noticeably snappier on the same hardware. Microcopy reads like the product knows the user.

---

## Section 4 — Standards to establish (so this stays clean)

These are the durable scaffolding that prevents regression after Phases A–G ship.

### 4.1 Server action contract

```typescript
// lib/server-actions/result.ts
export type ServerActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; reason?: string };

export async function serverAction<T>(
  context: string,
  required: "staff" | "client" | "talent" | "any",
  fn: () => Promise<T>,
): Promise<ServerActionResult<T>> {
  try {
    const auth = await requireActor(required);
    if (!auth.ok) return { ok: false, error: "Forbidden", reason: "forbidden" };
    const data = await fn();
    return { ok: true, data };
  } catch (err) {
    logServerError(context, err);
    return { ok: false, error: CLIENT_ERROR.unexpected, reason: "unexpected" };
  }
}
```

Every server action goes through this wrapper. Callers can rely on `if (result.ok)` to narrow.

### 4.2 Toast / notification contract

```typescript
// lib/ui/toast.ts
export type ToastTone = "success" | "error" | "info" | "warning";
export interface ToastOptions {
  tone: ToastTone;
  title: string;       // i18n key required
  description?: string; // i18n key
  durationMs?: number;  // default by tone
  action?: { label: string; onClick: () => void };
}
export function toast(opts: ToastOptions): void;
```

Three call patterns:
- `toast({ tone: "success", title: "saved" })` (default duration 3s)
- `toast({ tone: "error", title: "saveFailed", description: "tryAgain", action: { label: "retry", onClick: ... }})` (default duration 6s)
- `toast({ tone: "info", title: "syncing" })` (default duration 4s)

Browser `alert()` and ad-hoc banner inserts are forbidden by lint rule.

### 4.3 Empty / loading / error state

Every list rendering must use one of three primitives:

```tsx
<DataList
  state={loading ? "loading" : error ? "error" : rows.length === 0 ? "empty" : "ready"}
  loading={<Skeleton variant="list" />}
  empty={
    <EmptyState
      icon="inbox"
      title={t("emptyInbox.title")}
      description={t("emptyInbox.description")}
      primaryAction={{ label: t("emptyInbox.cta"), href: "/admin/roster" }}
    />
  }
  error={<RetryState onRetry={refetch} message={...} />}
>
  {rows.map(...)}
</DataList>
```

Lint rule: any `array.map` that renders a list >5 lines must be inside a `<DataList>` (or marked `// data-list-exempt`).

### 4.4 Mobile breakpoint contract

```typescript
// lib/ui/breakpoints.ts
export const BREAKPOINTS = {
  phone: 640,
  tablet: 900,
  desktop: 1200,
} as const;
```

Three quality gates per breakpoint:
- All interactive elements ≥ 44 × 44 px touch target.
- No element with `position: fixed/sticky` may cover the last 80px of content.
- All composers must dismiss the keyboard via tap-outside or explicit close button.

### 4.5 i18n contract

- All user-visible strings live in `lib/i18n/copy/<surface>.ts` (one file per surface).
- Strings use template form: `t("inboxEmpty.title", { name: "Alex" })`.
- Server actions emit `reason` codes (e.g. `"rate_limited"`), client maps to copy at render.
- CI fails if any `.tsx` contains an English literal > 3 words in user-visible JSX.

---

## Section 5 — Ordering & dependencies

```
Phase A ─┬─→ Phase C ─┬─→ Phase G
         │            │
Phase B ─┴─→ Phase D ─┘
                      │
            Phase E ──┴─→ Phase F (most features depend on B for notifications)
```

**Critical path:** A → B.2 (notifications backend) → F.15 (mark-all-read), F.13 (migration queued).
**Parallelizable:** Phases C, D, E can run concurrently with B once A is done.
**Last:** Phase F mini-features can ship one at a time after B; G can interleave with anything.

**Recommended sprint structure (6 weeks):**

| Week | Phases active | Focus |
|---|---|---|
| 1 | A | Foundation P0s, lint rules, wrappers |
| 2 | B (start) + C (start) | Workspace identity + error copy + result shapes |
| 3 | B (continue) + D | Calendar + notifications backend + mobile |
| 4 | B (finish) + E + G (start) | Public talent profile + first impressions |
| 5 | F (top 5 features) + G | Highest-value backend features |
| 6 | F (next 5) + QA + polish | Round out features, full regression |

---

## Section 6 — Verification per phase

Each phase ends with an explicit "is this done" gate. Don't merge until green.

**Phase A done when:**
- `grep -rn "catch { }" web/src` → 0 hits
- `grep -rn "void [a-z]*(" web/src/components` ignores known-safe lines; otherwise flagged
- All server actions return `ServerActionResult` (TS narrows correctly)
- Branded 404 rendered for `curl https://unknown-host.example`

**Phase B done when:**
- Live QA: switch workspaces — signature/plan/branding all update
- Live QA: talent confirms booking — appears on their calendar
- Live QA: submit inquiry — notification row inserted, drawer displays it
- `grep -rn "MOCK_TALENT\|TENANT\.slug\|atelier-roma" web/src` returns only prototype-mode fallback paths

**Phase C done when:**
- One `useToast()` import path; no other toast/alert dispatch
- One `ServerActionResult<T>` type; sweep complete
- Every list has empty/loading/error states (codemod-verified)
- Locale toggle from EN→ES changes every visible string on 5 sample pages

**Phase D done when:**
- Lighthouse mobile score ≥ 90 on storefront, login, client thread, admin inbox, talent profile
- All icon buttons have `aria-label`
- Keyboard-only nav can complete: login → inquiry submit → message send

**Phase E done when:**
- 404, 500, host-unregistered all branded
- Guest inquiry: visible confirmation, account-creation offer with pre-filled email
- Login: remember-me works; password-reset clearer
- Talent claim invite link lands on correct tenant + claim flow

**Phase F done when:**
- All 15 stubs either wired or labeled "Demo · prototype data" with explicit roadmap note

**Phase G done when:**
- Optimistic UI verified on pin/mark-read/reorder (sub-100ms perceived response)
- Empty states personalized
- Message edit/delete works for 30s window

---

## Section 7 — Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Phase B notifications schema design loops | High | 2-day slip | Time-box design to 4h; ship MVP with single `user_notifications` table, iterate |
| Calendar real-data model touches RLS broadly | Medium | 3-day slip | Stage as separate migration with feature flag; rollback path ready |
| `as any` codemod breaks Supabase typed queries | Medium | 1-day slip | Manual review on first 20 fixes, then automate the safe pattern |
| Stripe integrations (F.4, F.5, F.6) require test mode keys | High | Blocks F until keys provided | Surface as dependency Day 1; design contracts without keys |
| Lighthouse mobile tests need device QA | Low | 0.5-day slip | Document required test devices; otherwise emulator |
| Locale toggle audit reveals 100+ untranslated strings | Medium | 1-day slip | Time-box; defer non-critical ones to a follow-up |

---

## Section 8 — What this gets us toward "premium"

After Phase A: **Nothing fails silently.** Every action says yes or no. Trust earned.
After Phase B: **What you see is real.** No more demo pollution. The product is the product.
After Phase C: **Everything feels designed by one team.** One toast, one empty state, one error voice.
After Phase D: **Premium on a phone.** First-class mobile.
After Phase E: **Visitors trust on arrival.** Branded edges. Clear paths.
After Phase F: **Every button does what it says.** No promised features that don't exist.
After Phase G: **Snappy. Personal. Considered.** The little things.

---

## Section 9 — How to use this plan

**For Claude agents picking up work:**
- Each task in the table has files + line ranges. Treat them as the starting point, not the boundary.
- Verify the file/line still applies before editing (the codebase moves fast).
- Always run `npx tsc --noEmit` and `npm run lint` before commit.
- Always include in the commit message: which finding ID (e.g., `CLI-1`, `ADM-3`) this addresses.

**For the human reviewing:**
- Phase A is non-negotiable; everything else is opt-in by phase.
- Phase F features should each have a dedicated session — don't batch them.
- Live-QA is the only credible sign-off; smoke tests + Lighthouse are necessary but insufficient.

**For session continuity:**
- Reference this plan in commits: `feat(phase-b): wire workspace identity (ADM-1, B.1)`.
- Update the table status as items land: replace finding with `✅ commit hash`.
- Don't expand the plan in-place; spawn a follow-up plan if scope grows.

---

## Appendix — Audit source documents

This plan synthesizes findings from five parallel Explore agent runs on 2026-05-12:

1. **Client surface audit** — 10 findings across `inquiries/new`, `inquiries/[id]`, `bookings`, `today`, `discover`, `_ParticipantThreadShell`
2. **Admin surface audit** — 12 findings across `pages.tsx`, `messages.tsx`, `workspace.tsx`, `drawers.tsx`, `talent.tsx`
3. **Talent surface audit** — 10 findings across `talent.tsx`, `inbox`, `calendar`, `share/talent`, profile editor
4. **Public + onboarding audit** — 14 findings across `proxy.ts`, `login`, storefront, guest-inquiry, talent claim, onboarding
5. **Cross-cutting concerns audit** — 13 systemic patterns (error handling, type holes, server-action shapes, etc.)

Trust-the-loop memory reference: `~/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/project_trust_the_loop_audit.md` (Waves 1-6).
