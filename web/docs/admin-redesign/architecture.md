# Admin shell — architecture

Companion to [`./README.md`](./README.md). Read that first.

This doc covers:

1. The 4-surface model
2. State flow + ProtoProvider
3. Drawer system (~150 drawers, single dispatcher)
4. Design tokens
5. Primitives reference
6. URL-state sync
7. Mobile / responsive layer
8. Conventions

---

## 1. Four surfaces, one shell

Every viewer of the prototype is in one of four "surfaces":

| Surface | Who sees it | Key URL param |
|---|---|---|
| **Workspace** | Agency staff (owner / admin / coordinator / editor / viewer) | `?surface=workspace` |
| **Talent** | A model / talent on someone's roster | `?surface=talent` |
| **Client** | A brand or buyer ordering talent | `?surface=client` |
| **Platform** | Tulala HQ ops staff | `?surface=platform` |

The surface determines:

- The **topbar** (which functions show up at top — workspace shows
  tenant/plan switcher; talent shows agency switcher; etc.)
- The **page nav** (Overview / Inbox / Calendar / Workflow / etc. on
  workspace; Today / Profile / Inbox / Calendar / Activity on talent)
- The **bottom mobile tab bar** (mirrors page nav, surface-aware)
- The **drawers** that make sense to open in this context (some are
  surface-locked via the palette `surface` filter)

Switching surfaces resets to a sensible default page for the new
surface (see `handleSetSurface` in `ProtoProvider`).

## 2. State flow

All UI state lives in **one** React context: `ProtoProvider` in
`_state.tsx`. There is no Redux, no Zustand, no Recoil. Every component
that needs state calls `useProto()`.

```ts
const { state, setSurface, openDrawer, toast, ... } = useProto();
```

`state` shape:

```ts
type ProtoState = {
  surface: Surface;           // workspace · talent · client · platform
  plan: Plan;                 // free · studio · agency · network
  role: Role;                 // viewer → owner ladder
  entityType: EntityType;     // agency · hub
  alsoTalent: boolean;        // is the workspace owner also on roster?
  page: WorkspacePage;        // overview · inbox · calendar · ...
  talentPage: TalentPage;
  clientPlan: ClientPlan;
  clientPage: ClientPage;
  hqRole: HqRole;
  platformPage: PlatformPage;
  impersonating: Impersonation;       // HQ staff "impersonate tenant" state
  drawer: { drawerId: DrawerId | null; payload?: Record<string, unknown> };
  upgrade: UpgradeOffer;
  toasts: Toast[];
  completedTasks: Set<string>;
  density: "comfortable" | "compact";
};
```

**State changes happen via the action methods on the context** — never
mutate `state` directly. The mock data (`getRoster`, `getInquiries`,
etc.) reads from the plan dimension to return the right slice.

### Density

`state.density` is mirrored to `<html data-tulala-density>` so global
CSS can flip row paddings without component-level prop drilling.
Persisted in `localStorage["tulala_density"]`.

### Drawer stack

The drawer back-stack lives at
`drawerStack: DrawerContext[]`. Opening a new drawer while another is
open pushes the current one onto the stack; `popDrawer()` reopens the
previous. `DrawerShell` reads from this and auto-renders a "← Back to
{previous}" link.

## 3. Drawers — single dispatcher, ~150 ids

Every modal/sheet/sidesheet in the prototype is a "drawer" with a
unique string id (`DrawerId` union in `_state.tsx`). The dispatcher
(`DrawerRoot` in `_drawers.tsx`) is one big `switch`:

```ts
switch (id) {
  case "team": return <TeamDrawer />;
  case "plan-billing": return <PlanBillingDrawer />;
  case "talent-profile": return <TalentProfileDrawer />;
  // ... ~150 cases
  default: return <SimpleStubDrawer ... />;
}
```

Every drawer body wraps its content in `<DrawerShell>`, which provides:

- Backdrop overlay
- Animated slide-in from the right
- Resize handle (drag the left edge to widen)
- Compact / Half / Full size toggle
- "Copy link" button (auto-mounted)
- Close button + Esc-to-close
- Tab focus trap
- Mobile responsive (full-bleed)
- Sticky title + footer (footer is opt-in via `footer` prop)

Open a drawer:

```ts
const { openDrawer } = useProto();
openDrawer("team", { highlight: "lina" });
```

Close:

```ts
const { closeDrawer } = useProto();
closeDrawer();
```

Drawer state syncs to URL via `?drawer=<id>&drawerPayload=<json>`.

## 4. Design tokens

Defined in `_state.tsx`. Use these instead of hardcoding values.

```ts
COLORS = {
  surface: "#FAFAF7",       // page background
  surfaceAlt: "#F2F2EE",    // hero card / spotlight bg
  card: "#FFFFFF",
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.62)",
  inkDim: "rgba(11,11,13,0.38)",
  border: "rgba(24,24,27,0.10)",
  borderSoft: "rgba(24,24,27,0.06)",
  borderStrong: "rgba(24,24,27,0.20)",
  accent: "#0F4F3E",        // forest — for current state
  accentDeep: "#093328",
  accentSoft: "rgba(15,79,62,0.10)",
  green: "#2E7D5B",
  amber: "#52606D",         // SLATE, NOT GOLD — see feedback memory
  red: "#B0303A",
  shadow: "0 1px 2px rgba(11,11,13,0.04)",
  shadowHover: "0 6px 18px rgba(11,11,13,0.08)",
};

FONTS = {
  display: "Geist Sans, ...",
  body: "Inter, ...",
  mono: "ui-monospace, SF Mono, ...",
};

RADIUS = { sm: 7, md: 10, lg: 12, xl: 16 };

SPACE = { tight: 8, block: 12, group: 24, section: 32 };

Z = {
  topbar: 40,
  controlBar: 100,
  drawerBackdrop: 200,
  drawerPanel: 210,
  modalBackdrop: 300,
  modalPanel: 310,
  toast: 400,
};
```

**Forest accent** (`#0F4F3E`) is used for "current state" — current
plan column, current page underline, current tenant tint, etc. **Not
for premium upsells.** "No gold/rust" is a hard rule from the user's
design memory; the `amber` token is intentionally a slate, not warm.

## 5. Primitives reference

All in `_primitives.tsx`. Tree-shake-safe; import only what you use.

### Layout / cards
- `<PrimaryCard>` — main hero card (icon, title, description, meta, affordance)
- `<SecondaryCard>` — quieter sibling card
- `<StatusCard>` — hero metric tile with tabular-num value + trend caption
- `<LockedCard>` — upsell card for plan-locked features
- `<CompactLockedCard>` — small inline upsell row
- `<StarterCard>` — first-run spotlight card
- `<EmptyState>` — text + actions + numbered tip rows
- `<MoreWithSection>` — wraps locked-feature grid

### Buttons
- `<PrimaryButton>` (ink), `<SecondaryButton>` (white), `<GhostButton>` (transparent)
- All take `size: "sm" | "md"`, `disabled`

### Inputs
- `<TextInput>` — supports `value` / `onChange` controlled, `readOnly`, `prefix` / `suffix`
- `<TextArea>` — same, with `rows`
- `<Toggle>` — switch
- `<FieldRow>` — labelled wrapper with `required` (red asterisk), `optional` chip, `error` inline message, `hint`
- `<SelectInput>` — old; consider native `<select>` with `selectStyle` from `_pages.tsx`

### Chips / badges
- `<PlanChip>`, `<EntityChip>`, `<RoleChip>`, `<ClientTrustChip>`, `<StateChip>`
- `<StatusPill>`, `<StatDot>`, `<Bullet>`
- `<ReadOnlyChip>`, `<Affordance>`, `<CapsLabel>` (with `case="sentence"` option)

### Drawers / modals
- `<DrawerShell>` — see Drawers section above
- `<ModalShell>` — for upgrade modal etc.
- `<UpgradeModal>` exposed via `openUpgrade()` action

### Power-user primitives (deploy across surfaces)
- `<Skeleton>` — loading shimmer
- `<BulkSelectBar>` + `<BulkRowCheckbox>` — multi-select pattern
- `<SwipeableRow>` — mobile swipe-to-reveal-actions row
- `<Popover>` — themed hover/focus tooltip with portal rendering
- `<Avatar>` — supports `photoUrl`, `tone="auto"` deterministic tint via `hashSeed`
- `useKeyboardListNav()` — j/k row nav hook
- `<BackToTop>` — floating "↑ Top" pill (mounted globally)

### Feedback
- `<ToastHost>` mounted at root; trigger via `useProto().toast(message)`
- Toasts auto-dismiss after 4.5s; hover/focus pauses

### Wave-2 helpers (`_wave2.tsx`)
- `<TalentAnalyticsCard>`, `<TalentFunnelCard>` — talent today cards
- `<InquiryTemplatesPicker>` — composer preset picker
- `<DoubleBookingWarning>` — inline conflict alert
- `<ReadReceipt>`, `<TypingIndicator>` — message thread bits
- `<ICalSubscribeCard>` — calendar subscribe affordance
- `<OnboardingArc>` — generic progress checklist with localStorage
- `<SavedViewsBar>` — generic per-list saved-filter primitive
- `<LoadMore>` — pagination row
- `<DraggableList>` — HTML5 DnD reorder + arrow fallback
- `<MentionTypeahead>` — @ typeahead UI shell
- `<QuickReplyButtons>` — Accept / Counter / Decline trio
- `downloadCsv()` — zero-dep CSV exporter

## 6. URL state sync

`ProtoProvider` keeps these dimensions in the URL via `replaceState`:

- `surface`, `plan`, `role`, `entityType`, `alsoTalent`, `page` (workspace)
- `talentPage` (talent surface)
- `clientPlan`, `clientPage` (client surface)
- `hqRole`, `platformPage` (platform surface)
- `drawer`, `drawerPayload` (cross-surface drawer state)
- `dev` (`?dev=0` hides the dev controls)

URL state is **source of truth** for surface/plan/role/page. Refresh
the page → state restores from the URL. Share a URL → recipient sees
the exact same view.

When extending state with a new dimension, update both the read effect
(URL → setState on mount) and the write effect (state → URL on change)
in `ProtoProvider`.

## 7. Mobile / responsive layer

Inline desktop styles + a global `<style>` block in `page.tsx` that
flips layouts at narrow widths. Three breakpoints:

- `≤ 1024px` (tablet): 4-col hero strips → 2-col
- `≤ 720px` (small tablet / large phone): grids → 1fr, topbar wraps,
  drawer full-bleed, dev ControlBar horizontal-scrolls, plan-compare
  goes horizontal-scrollable, page nav moves to bottom tab bar
- `≤ 540px` (phone): H1 22px, surface main padding 14/12/40

Components opt into responsive behavior by setting `data-tulala-*`
attributes (e.g. `data-tulala-grid`, `data-tulala-page-header`). The
CSS targets those.

For real-mobile fidelity, the prototype includes:

- Bottom tab bar (`<MobileBottomNav>`) — only visible at ≤720px
- 44×44 tap-target floor (opt-in via `data-tulala-tap-pad`)
- Safe-area-inset support (notch / home indicator)
- prefers-reduced-motion (animations collapse to ~instant)
- Print stylesheet (strips dev chrome; just the surface)

## 8. Conventions

### Filing rule

- Pure UI primitives → `_primitives.tsx`
- Cross-surface state, types, mocks → `_state.tsx`
- The big drawer dispatcher + most drawer bodies → `_drawers.tsx`
- Per-surface page renderers → `_pages.tsx` (workspace) or
  `_talent.tsx` / `_client.tsx` / `_platform.tsx`
- New product surfaces (e.g. share-card, public profile) → outside
  `/prototypes/admin-shell/`, in `web/src/app/`

### Naming

- DrawerId: kebab-case literal string, surface-prefixed if relevant
  (`talent-profile-edit`, `platform-tenant-suspend`)
- Component name: PascalCase, descriptive
- Hook: `useFooBar()`
- Mock data: `MOCK_FOO` or `FOO` as a constant

### Copy

- **No brand jargon in user-facing strings.** "Tulala Discover" is
  internal; users see "Public directory."
- **Sentence case for action labels.** "New inquiry," not "New Inquiry."
- **Verb-first for buttons.** "Browse the directory," not "Directory."
- **No "opens in production" toasts.** Replace with what the action
  would do, or "coming soon" as a fallback.
- **Pluralize.** Use `pluralize()` from `_state.tsx`, not template
  literals with hardcoded plurals.

### Typography rules

- Headings (h1, h2, h3, drawer titles): `FONTS.display`, weight 500
- PrimaryCard h3: also weight 500 (was 600 — unified)
- Body copy: `FONTS.body`, weight 400, color `inkMuted`
- Labels (CapsLabel default): `FONTS.body`, 10.5px, weight 600,
  uppercase + 1.4 letter-spacing
- Sentence-case eyebrow: pass `case="sentence"` to CapsLabel

### Status semantics

- **Forest accent** (`COLORS.accent`): "you are here" / current state
- **Green** (`COLORS.green`): positive sentiment (confirmed booking,
  paid, +18% trend)
- **Slate** (`COLORS.amber`): "needs attention" but not urgent
- **Red** (`COLORS.red`): error, decline, double-booking warning
- **Ink** (`COLORS.ink`): default neutral — most things

### Accessibility

- Every drawer traps Tab focus
- Every interactive element has aria-label or visible text
- Dim chips bumped to AA contrast (`#4A4A52` on white, not `inkMuted`)
- Calendar cells have aria-labels with date + event count
- Forms mark required fields with red asterisk + aria-label
- Color is never the only signal — every color-tinted state has a
  text label too

### Performance

- All mock arrays are tiny; in production these become paginated
  queries (T2 in handoff plan)
- Rendering is synchronous; production lists need `<Skeleton>`
  placeholders during fetch
- The `_talent.tsx` file is 6.5K lines — split into 5 files when
  someone touches that surface non-trivially (T-split in handoff)

## When in doubt

- Read the JSDoc on any primitive — most are heavily commented
- Read the surrounding commit message in git log
- Read [`./production-handoff.md`](./production-handoff.md) for what
  to build next
