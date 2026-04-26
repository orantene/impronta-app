# Admin shell — QA tracker

Live tracking doc for the page-by-page design QA. See
[`./qa-plan.md`](./qa-plan.md) for the structure, the 9-question
checklist, and the wave sequence.

**Status legend:** ⬜ not started · 🔵 in review · ✅ shipped · ⚠️ has open MAJOR

---

## Wave 0 · templates / components

Layer 1 — the reusable building blocks. Fixing one cascades to every
page that uses it. **Run before Wave A** so per-page audits don't
re-log the same component issues.

### 0.1 · Hero strip components ⬜
- `<StatusCard>` — used on Workspace · Overview, Talent · Today,
  Client · Today, Platform · Today (every "Today")
- `<StatusCaption>` (trend tinting)
- 4-up Grid pattern

### 0.2 · Card primitives ⬜
- `<PrimaryCard>` — main hero card (icon, title, description, meta, affordance)
- `<SecondaryCard>` — quieter sibling
- `<LockedCard>` / `<CompactLockedCard>` — upsell cards
- `<StarterCard>` — first-run spotlight
- `<EmptyState>` — text + actions + numbered tip rows
- `<MoreWithSection>` — locked-feature row wrapper

### 0.3 · Drawer system ⬜
- `<DrawerShell>` — header, toolbar slot (auto copy-link, size buttons,
  close), body, footer
- Drawer breadcrumb (back-stack)
- Drawer overlay + backdrop opacity
- Drawer footer pinning
- Plan-compare drawer (special wide layout)
- Modal shell (separate from drawer)

### 0.4 · Topbars (4 surfaces) ⬜
- Workspace topbar (tenant chip, page nav, right cluster: + New /
  Help / Settings / Bell / Role / Avatar)
- Talent topbar (identity, agency switcher, page nav, view-public)
- Client topbar (brand, plan chip, page nav)
- Platform topbar (HQ identity, role lens, page nav)
- Active-page underline animation

### 0.5 · Page header pattern ⬜
- `<PageHeader>` — eyebrow / title / subtitle / actions slot
- `eyebrowCase`: upper vs sentence
- Action slot wrap behavior on mobile

### 0.6 · Chip primitives ⬜
- `<PlanChip>` — Free / Studio / Agency / Network
- `<EntityChip>` — Agency / Hub
- `<RoleChip>` — viewer / editor / coordinator / admin / owner
- `<ClientTrustChip>` — basic / verified / silver / trusted
- `<StateChip>` — talent state (draft / invited / published / etc.)
- `<StatusPill>` — generic status
- `<StatDot>` — small color dot
- `<Bullet>` — separator
- `<CapsLabel>` — uppercase eyebrow (sentence-case variant)
- `<Affordance>` — "Open →" trailing arrow
- `<ReadOnlyChip>` — viewer/audit indicator

### 0.7 · Buttons ⬜
- `<PrimaryButton>` (ink), `<SecondaryButton>` (white), `<GhostButton>` (transparent)
- Sizes (sm / md), disabled state, hover states
- Icon-only buttons in topbar right cluster (Help, Settings, Bell)

### 0.8 · Inputs + forms ⬜
- `<TextInput>` — controlled, readOnly, prefix/suffix
- `<TextArea>` — controlled
- `<Toggle>` — switch
- `<FieldRow>` — required asterisk, optional chip, error message, hint
- Native `<select>` with `selectStyle` shared helper
- Search input pattern (Inbox / Workflow / Roster / Clients)

### 0.9 · List patterns ⬜
- Search input + sort dropdown + filter chips combination
- "Export CSV" placement in PageHeader actions
- Row data-tulala-row marker (density toggle)
- Table-style list (Workflow, Clients) vs card-grid (Roster) vs
  composite list (Inbox)
- `<BulkSelectBar>` + `<BulkRowCheckbox>`
- `<LoadMore>` pagination
- `<SwipeableRow>` mobile + kebab fallback
- `useKeyboardListNav` j/k

### 0.10 · Feedback + overlays ⬜
- `<Popover>` — themed tooltip with portal rendering
- `<ToastHost>` + auto-dismiss + hover pause
- `<UpgradeModal>` — separate from drawer
- `<BackToTop>` — floating pill

### 0.11 · Avatars ⬜
- `<Avatar>` photo / initials / emoji hierarchy
- `tone="auto"` deterministic tint via `hashSeed`
- Ringed gradient variant (Oran Tene topbar)
- Sizes: 18 / 22 / 28 / 30 / 32 / 36

### 0.12 · Mobile tab bar ⬜
- `<MobileBottomNav>` — 4 tabs + More sheet
- Per-surface icon mapping
- Safe-area-inset
- Bottom-positioning above toast stack

### 0.13 · Recurring sub-patterns ⬜
- "Today" page template (greeting eyebrow → Today → subtitle → metric
  strip → primary cards → cross-promo)
- "Settings" page template (sections in canonical order)
- "More with X plan" cross-promo grid
- Activation arc (Free overview + onboarding drawer pattern)
- "Where you stand" / "Inquiries you're in" funnel cards
- Calendar grid template (Workspace · Calendar + Talent · Calendar)
- Hero card pair (2-up below the hero strip)

### 0.14 · Wave-2 helpers ⬜
- `<TalentAnalyticsCard>`, `<TalentFunnelCard>`,
  `<InquiryTemplatesPicker>`, `<DoubleBookingWarning>`,
  `<ReadReceipt>`, `<TypingIndicator>`,
  `<ICalSubscribeCard>`, `<OnboardingArc>`,
  `<SavedViewsBar>`, `<DraggableList>`,
  `<MentionTypeahead>`, `<QuickReplyButtons>`,
  `<WhatsNewDrawer>`, `<HelpDrawer>`

### How to run a Wave 0 session

For each component group above:

1. **Find every place it's used** — quick grep across the codebase
2. **Audit the component itself** — apply the 9-question checklist
   to the component as a unit (visual hierarchy, copy patterns, edge
   cases, all variants, mobile, a11y)
3. **Diff its instances** — does it look identical on every surface?
   Or does someone override it inconsistently?
4. **Ship the component fix** — one change cascades to every page

Output per component: tracker checkbox flips, commit ref, list of
pages that benefit downstream.

---

## Wave A · admin core (high traffic)

### A1 · Workspace · Overview ⬜

**URL:** `/prototypes/admin-shell?surface=workspace&plan=studio&page=overview`
(also test: `&plan=free`, `&plan=agency`, `&plan=network`)

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | First impression | — | |
| 2 | Visual hierarchy | — | |
| 3 | Copy pass | — | |
| 4 | Empty / zero state | — | |
| 5 | Edge cases | — | |
| 6 | Interactions | — | |
| 7 | Mobile (375 / 720) | — | |
| 8 | A11y (contrast, focus, aria) | — | |
| 9 | Cross-surface consistency | — | |

**Shipped this session:** —
**Deferred / MAJOR:** —

---

### A2 · Workspace · Inbox ⬜

**URL:** `/prototypes/admin-shell?surface=workspace&plan=studio&page=inbox`

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | First impression | — | |
| 2 | Visual hierarchy | — | |
| 3 | Copy pass | — | |
| 4 | Empty / zero state | — | |
| 5 | Edge cases | — | |
| 6 | Interactions | — | |
| 7 | Mobile (375 / 720) | — | |
| 8 | A11y (contrast, focus, aria) | — | |
| 9 | Cross-surface consistency | — | |

**Shipped this session:** —
**Deferred / MAJOR:** —

---

### A3 · Workspace · Workflow ⬜

**URL:** `/prototypes/admin-shell?surface=workspace&plan=studio&page=work`

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | First impression | — | |
| 2 | Visual hierarchy | — | |
| 3 | Copy pass | — | |
| 4 | Empty / zero state | — | |
| 5 | Edge cases | — | |
| 6 | Interactions | — | |
| 7 | Mobile (375 / 720) | — | |
| 8 | A11y (contrast, focus, aria) | — | |
| 9 | Cross-surface consistency | — | |

**Shipped this session:** —
**Deferred / MAJOR:** —

---

### A4 · Workspace · Talent (Roster) ⬜

**URL:** `/prototypes/admin-shell?surface=workspace&plan=studio&page=talent`
(also test: `&entityType=hub` for "Network" copy)

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | First impression | — | |
| 2 | Visual hierarchy | — | |
| 3 | Copy pass | — | |
| 4 | Empty / zero state | — | |
| 5 | Edge cases | — | |
| 6 | Interactions | — | |
| 7 | Mobile (375 / 720) | — | |
| 8 | A11y (contrast, focus, aria) | — | |
| 9 | Cross-surface consistency | — | |

**Shipped this session:** —
**Deferred / MAJOR:** —

---

## Wave B · admin support

### B1 · Workspace · Clients ⬜

**URL:** `/prototypes/admin-shell?surface=workspace&plan=studio&page=clients`

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | First impression | — | |
| 2 | Visual hierarchy | — | |
| 3 | Copy pass | — | |
| 4 | Empty / zero state | — | |
| 5 | Edge cases | — | |
| 6 | Interactions | — | |
| 7 | Mobile (375 / 720) | — | |
| 8 | A11y (contrast, focus, aria) | — | |
| 9 | Cross-surface consistency | — | |

**Shipped this session:** —
**Deferred / MAJOR:** —

---

### B2 · Workspace · Calendar ⬜

**URL:** `/prototypes/admin-shell?surface=workspace&plan=studio&page=calendar`

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | First impression | — | |
| 2 | Visual hierarchy | — | |
| 3 | Copy pass | — | |
| 4 | Empty / zero state | — | |
| 5 | Edge cases | — | |
| 6 | Interactions | — | |
| 7 | Mobile (375 / 720) | — | |
| 8 | A11y (contrast, focus, aria) | — | |
| 9 | Cross-surface consistency | — | |

**Shipped this session:** —
**Deferred / MAJOR:** —

---

### B3 · Workspace · Public site ⬜

**URL:** `/prototypes/admin-shell?surface=workspace&plan=studio&page=site`

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | First impression | — | |
| 2 | Visual hierarchy | — | |
| 3 | Copy pass | — | |
| 4 | Empty / zero state | — | |
| 5 | Edge cases | — | |
| 6 | Interactions | — | |
| 7 | Mobile (375 / 720) | — | |
| 8 | A11y (contrast, focus, aria) | — | |
| 9 | Cross-surface consistency | — | |

**Shipped this session:** —
**Deferred / MAJOR:** —

---

## Wave C · admin settings

### C1 · Workspace · Billing ⬜

**URL:** `/prototypes/admin-shell?surface=workspace&plan=studio&page=billing`

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | First impression | — | |
| 2 | Visual hierarchy | — | |
| 3 | Copy pass | — | |
| 4 | Empty / zero state | — | |
| 5 | Edge cases | — | |
| 6 | Interactions | — | |
| 7 | Mobile (375 / 720) | — | |
| 8 | A11y (contrast, focus, aria) | — | |
| 9 | Cross-surface consistency | — | |

**Shipped this session:** —
**Deferred / MAJOR:** —

---

### C2 · Workspace · Settings ⬜

**URL:** `/prototypes/admin-shell?surface=workspace&plan=studio&page=workspace`

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | First impression | — | |
| 2 | Visual hierarchy | — | |
| 3 | Copy pass | — | |
| 4 | Empty / zero state | — | |
| 5 | Edge cases | — | |
| 6 | Interactions | — | |
| 7 | Mobile (375 / 720) | — | |
| 8 | A11y (contrast, focus, aria) | — | |
| 9 | Cross-surface consistency | — | |

**Shipped this session:** —
**Deferred / MAJOR:** —

---

## Wave D · talent surface

### D1 · Talent · Today ⬜

**URL:** `/prototypes/admin-shell?surface=talent&talentPage=today`

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | First impression | — | |
| 2 | Visual hierarchy | — | |
| 3 | Copy pass | — | |
| 4 | Empty / zero state | — | |
| 5 | Edge cases | — | |
| 6 | Interactions | — | |
| 7 | Mobile (375 / 720) | — | |
| 8 | A11y (contrast, focus, aria) | — | |
| 9 | Cross-surface consistency | — | |

**Shipped this session:** —
**Deferred / MAJOR:** —

---

### D2 · Talent · Edit profile ⬜

**URL:** `/prototypes/admin-shell?surface=talent&talentPage=profile`

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | First impression | — | |
| 2 | Visual hierarchy | — | |
| 3 | Copy pass | — | |
| 4 | Empty / zero state | — | |
| 5 | Edge cases | — | |
| 6 | Interactions | — | |
| 7 | Mobile (375 / 720) | — | |
| 8 | A11y (contrast, focus, aria) | — | |
| 9 | Cross-surface consistency | — | |

**Shipped this session:** —
**Deferred / MAJOR:** —

---

### D3 · Talent · Inbox ⬜

**URL:** `/prototypes/admin-shell?surface=talent&talentPage=inbox`

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | First impression | — | |
| 2 | Visual hierarchy | — | |
| 3 | Copy pass | — | |
| 4 | Empty / zero state | — | |
| 5 | Edge cases | — | |
| 6 | Interactions | — | |
| 7 | Mobile (375 / 720) | — | |
| 8 | A11y (contrast, focus, aria) | — | |
| 9 | Cross-surface consistency | — | |

**Shipped this session:** —
**Deferred / MAJOR:** —

---

### D4 · Talent · Calendar ⬜

**URL:** `/prototypes/admin-shell?surface=talent&talentPage=calendar`

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | First impression | — | |
| 2 | Visual hierarchy | — | |
| 3 | Copy pass | — | |
| 4 | Empty / zero state | — | |
| 5 | Edge cases | — | |
| 6 | Interactions | — | |
| 7 | Mobile (375 / 720) | — | |
| 8 | A11y (contrast, focus, aria) | — | |
| 9 | Cross-surface consistency | — | |

**Shipped this session:** —
**Deferred / MAJOR:** —

---

### D5 · Talent · Activity ⬜

**URL:** `/prototypes/admin-shell?surface=talent&talentPage=activity`

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | First impression | — | |
| 2 | Visual hierarchy | — | |
| 3 | Copy pass | — | |
| 4 | Empty / zero state | — | |
| 5 | Edge cases | — | |
| 6 | Interactions | — | |
| 7 | Mobile (375 / 720) | — | |
| 8 | A11y (contrast, focus, aria) | — | |
| 9 | Cross-surface consistency | — | |

**Shipped this session:** —
**Deferred / MAJOR:** —

---

### D6 · Talent · Settings ⬜

**URL:** `/prototypes/admin-shell?surface=talent&talentPage=settings`

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | First impression | — | |
| 2 | Visual hierarchy | — | |
| 3 | Copy pass | — | |
| 4 | Empty / zero state | — | |
| 5 | Edge cases | — | |
| 6 | Interactions | — | |
| 7 | Mobile (375 / 720) | — | |
| 8 | A11y (contrast, focus, aria) | — | |
| 9 | Cross-surface consistency | — | |

**Shipped this session:** —
**Deferred / MAJOR:** —

---

## Wave E · client surface

### E1 · Client · Today ⬜

**URL:** `/prototypes/admin-shell?surface=client&clientPage=today`

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | First impression | — | |
| 2 | Visual hierarchy | — | |
| 3 | Copy pass | — | |
| 4 | Empty / zero state | — | |
| 5 | Edge cases | — | |
| 6 | Interactions | — | |
| 7 | Mobile (375 / 720) | — | |
| 8 | A11y (contrast, focus, aria) | — | |
| 9 | Cross-surface consistency | — | |

**Shipped this session:** —
**Deferred / MAJOR:** —

---

### E2 · Client · Discover ⬜

**URL:** `/prototypes/admin-shell?surface=client&clientPage=discover`

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | First impression | — | |
| 2 | Visual hierarchy | — | |
| 3 | Copy pass | — | |
| 4 | Empty / zero state | — | |
| 5 | Edge cases | — | |
| 6 | Interactions | — | |
| 7 | Mobile (375 / 720) | — | |
| 8 | A11y (contrast, focus, aria) | — | |
| 9 | Cross-surface consistency | — | |

**Shipped this session:** —
**Deferred / MAJOR:** —

---

### E3 · Client · Shortlists ⬜

**URL:** `/prototypes/admin-shell?surface=client&clientPage=shortlists`

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | First impression | — | |
| 2 | Visual hierarchy | — | |
| 3 | Copy pass | — | |
| 4 | Empty / zero state | — | |
| 5 | Edge cases | — | |
| 6 | Interactions | — | |
| 7 | Mobile (375 / 720) | — | |
| 8 | A11y (contrast, focus, aria) | — | |
| 9 | Cross-surface consistency | — | |

**Shipped this session:** —
**Deferred / MAJOR:** —

---

### E4 · Client · Inquiries ⬜

**URL:** `/prototypes/admin-shell?surface=client&clientPage=inquiries`

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | First impression | — | |
| 2 | Visual hierarchy | — | |
| 3 | Copy pass | — | |
| 4 | Empty / zero state | — | |
| 5 | Edge cases | — | |
| 6 | Interactions | — | |
| 7 | Mobile (375 / 720) | — | |
| 8 | A11y (contrast, focus, aria) | — | |
| 9 | Cross-surface consistency | — | |

**Shipped this session:** —
**Deferred / MAJOR:** —

---

### E5 · Client · Bookings ⬜

**URL:** `/prototypes/admin-shell?surface=client&clientPage=bookings`

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | First impression | — | |
| 2 | Visual hierarchy | — | |
| 3 | Copy pass | — | |
| 4 | Empty / zero state | — | |
| 5 | Edge cases | — | |
| 6 | Interactions | — | |
| 7 | Mobile (375 / 720) | — | |
| 8 | A11y (contrast, focus, aria) | — | |
| 9 | Cross-surface consistency | — | |

**Shipped this session:** —
**Deferred / MAJOR:** —

---

### E6 · Client · Settings ⬜

**URL:** `/prototypes/admin-shell?surface=client&clientPage=settings`

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | First impression | — | |
| 2 | Visual hierarchy | — | |
| 3 | Copy pass | — | |
| 4 | Empty / zero state | — | |
| 5 | Edge cases | — | |
| 6 | Interactions | — | |
| 7 | Mobile (375 / 720) | — | |
| 8 | A11y (contrast, focus, aria) | — | |
| 9 | Cross-surface consistency | — | |

**Shipped this session:** —
**Deferred / MAJOR:** —

---

## Wave F · platform / HQ

### F1 · Platform · Today ⬜

**URL:** `/prototypes/admin-shell?surface=platform&platformPage=today`

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | First impression | — | |
| 2 | Visual hierarchy | — | |
| 3 | Copy pass | — | |
| 4 | Empty / zero state | — | |
| 5 | Edge cases | — | |
| 6 | Interactions | — | |
| 7 | Mobile (375 / 720) | — | |
| 8 | A11y (contrast, focus, aria) | — | |
| 9 | Cross-surface consistency | — | |

**Shipped this session:** —
**Deferred / MAJOR:** —

---

### F2 · Platform · Tenants ⬜

**URL:** `/prototypes/admin-shell?surface=platform&platformPage=tenants`

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | First impression | — | |
| 2 | Visual hierarchy | — | |
| 3 | Copy pass | — | |
| 4 | Empty / zero state | — | |
| 5 | Edge cases | — | |
| 6 | Interactions | — | |
| 7 | Mobile (375 / 720) | — | |
| 8 | A11y (contrast, focus, aria) | — | |
| 9 | Cross-surface consistency | — | |

**Shipped this session:** —
**Deferred / MAJOR:** —

---

### F3 · Platform · Users ⬜

**URL:** `/prototypes/admin-shell?surface=platform&platformPage=users`

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | First impression | — | |
| 2 | Visual hierarchy | — | |
| 3 | Copy pass | — | |
| 4 | Empty / zero state | — | |
| 5 | Edge cases | — | |
| 6 | Interactions | — | |
| 7 | Mobile (375 / 720) | — | |
| 8 | A11y (contrast, focus, aria) | — | |
| 9 | Cross-surface consistency | — | |

**Shipped this session:** —
**Deferred / MAJOR:** —

---

### F4 · Platform · Network ⬜

**URL:** `/prototypes/admin-shell?surface=platform&platformPage=network`

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | First impression | — | |
| 2 | Visual hierarchy | — | |
| 3 | Copy pass | — | |
| 4 | Empty / zero state | — | |
| 5 | Edge cases | — | |
| 6 | Interactions | — | |
| 7 | Mobile (375 / 720) | — | |
| 8 | A11y (contrast, focus, aria) | — | |
| 9 | Cross-surface consistency | — | |

**Shipped this session:** —
**Deferred / MAJOR:** —

---

### F5 · Platform · Billing ⬜

**URL:** `/prototypes/admin-shell?surface=platform&platformPage=billing`

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | First impression | — | |
| 2 | Visual hierarchy | — | |
| 3 | Copy pass | — | |
| 4 | Empty / zero state | — | |
| 5 | Edge cases | — | |
| 6 | Interactions | — | |
| 7 | Mobile (375 / 720) | — | |
| 8 | A11y (contrast, focus, aria) | — | |
| 9 | Cross-surface consistency | — | |

**Shipped this session:** —
**Deferred / MAJOR:** —

---

### F6 · Platform · Operations ⬜

**URL:** `/prototypes/admin-shell?surface=platform&platformPage=operations`

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | First impression | — | |
| 2 | Visual hierarchy | — | |
| 3 | Copy pass | — | |
| 4 | Empty / zero state | — | |
| 5 | Edge cases | — | |
| 6 | Interactions | — | |
| 7 | Mobile (375 / 720) | — | |
| 8 | A11y (contrast, focus, aria) | — | |
| 9 | Cross-surface consistency | — | |

**Shipped this session:** —
**Deferred / MAJOR:** —

---

### F7 · Platform · Settings ⬜

**URL:** `/prototypes/admin-shell?surface=platform&platformPage=settings`

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | First impression | — | |
| 2 | Visual hierarchy | — | |
| 3 | Copy pass | — | |
| 4 | Empty / zero state | — | |
| 5 | Edge cases | — | |
| 6 | Interactions | — | |
| 7 | Mobile (375 / 720) | — | |
| 8 | A11y (contrast, focus, aria) | — | |
| 9 | Cross-surface consistency | — | |

**Shipped this session:** —
**Deferred / MAJOR:** —

---

## Wave G · drawers (~150 ids, batched per surface)

Each surface has its drawer set. Spot-check the heavy ones at full
depth; light pass for the rest.

### G1 · Workspace drawers (heavy) ⬜
- `talent-profile`, `inquiry-workspace`, `plan-compare`,
  `tenant-summary`, `tenant-switcher`, `team`, `branding`, `domain`,
  `plan-billing`, `payments-setup`, `audit-log`, `notifications`,
  `notifications-prefs`, `data-export`, `inbox-snippets`, `danger-zone`
- Light pass: everything else under workspace

### G2 · Talent drawers ⬜
- `talent-profile-edit`, `talent-portfolio`, `talent-availability`,
  `talent-personal-page`, `talent-tier-compare`,
  `talent-contact-preferences`, `talent-payouts`,
  `talent-agency-relationship`
- Light pass: rest

### G3 · Client drawers ⬜
- `client-send-inquiry`, `client-talent-card`,
  `client-shortlist-detail`, `client-inquiry-detail`,
  `client-counter-offer`, `client-billing`, `client-team`
- Light pass: rest

### G4 · Platform drawers ⬜
- `platform-tenant-detail`, `platform-tenant-impersonate`,
  `platform-tenant-suspend`, `platform-billing-invoice`,
  `platform-incident`, `platform-support-ticket`
- Light pass: rest

---

## Wave H · cross-cutting

### H1 · Color & contrast pass ⬜
- Run through every chip, badge, status, and label across all
  surfaces; verify WCAG AA contrast at body and small sizes
- Output: a contrast report + diff for any failing tints

### H2 · "Today" surface consistency ⬜
- Compare Workspace · Today, Talent · Today, Client · Today,
  Platform · Today side-by-side
- Each should follow the same template: greeting eyebrow → page
  title → subtitle → 4-tile metric strip → primary cards → secondary
  cards → cross-promo
- Diff anywhere it deviates without good reason

### H3 · "Settings" surface consistency ⬜
- Same: compare Workspace · Settings vs Talent · Settings vs
  Client · Settings vs Platform · Settings
- Settings sections should be in similar order: Identity → Team /
  Permissions → Billing → Notifications → Integrations → Danger zone

### H4 · Cross-cutting copy review ⬜
- Final read-through of every visible string with fresh eyes
- Sentence case, verb-first CTAs, no internal product names, no
  "in production" leaks

---

## How a session works

1. Open the page on localhost (use the URL listed)
2. Walk the 9-question checklist top to bottom
3. Mark each PASS / MINOR / MAJOR
4. Ship MINORs as a single commit
5. Capture MAJORs as Wave-2 tickets in `production-handoff.md` or as
   their own redesign brief
6. Update this tracker — change ⬜ → 🔵 → ✅ when shipped

## How to start

Message me: `QA session · A1` (or whichever wave/page) and I'll:
- Open the URL myself or screenshot if Chrome extension is connected
- Walk the checklist
- Propose fixes inline
- Update this doc as we go

Or: just paste a screenshot + comment, and I'll slot the finding into
the right page's tracker entry.
