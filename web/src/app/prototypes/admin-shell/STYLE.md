# STYLE.md — Tulala Design System

> **WS-17.4** · Anatomy of the component library, spacing system, typography scale, color decisions, and card/drawer rules.
> Engineers and designers should read this before touching any prototype file.

---

## 1. Spacing system

All spacing is in `px`. The scale follows a 4-point base:

| Token name | Value | Use case |
|---|---|---|
| `4`  | 4px  | Icon padding, micro-gaps between inline chips |
| `8`  | 8px  | Item gaps inside a row |
| `12` | 12px | Default internal padding in compact cards |
| `14` | 14px | Default internal padding in standard cards |
| `16` | 16px | Section padding, card padding |
| `20` | 20px | Page section margin |
| `24` | 24px | Column gap in 2-column grids |
| `32` | 32px | Major section breaks |

Never use arbitrary values. If a component needs `18px` padding, use `16px` instead.

---

## 2. Color tokens (`COLORS.*`)

Defined in `_state.tsx`. Never use a raw hex value in a component — always reference a token.

| Token | Value | Semantic role |
|---|---|---|
| `COLORS.surface`     | `#FAFAF9` | Page / drawer background |
| `COLORS.surfaceAlt`  | `#F3F2F0` | Secondary containers, inputs |
| `COLORS.ink`         | `#1A1A2E` | Primary text |
| `COLORS.inkMuted`    | `#6B7280` | Labels, metadata |
| `COLORS.inkDim`      | `#9CA3AF` | Placeholder, disabled |
| `COLORS.accent`      | `#1F5C42` | CTAs, active indicators, highlights |
| `COLORS.border`      | `#E5E7EB` | Dividers, card borders |
| `COLORS.borderSoft`  | `#F0EFED` | Subtle separators within a card |

**Color decision tree:**
1. Is it interactive? → use `COLORS.accent` for the active/highlighted state.
2. Is it disabled or read-only? → use `COLORS.inkDim` + `opacity: 0.5`.
3. Is it a status signal? → use the tone palette (`green/amber/red/blue/ink`).
4. Is it a background? → `COLORS.surface` (page) or `COLORS.surfaceAlt` (card/input).

**Never** pick a color because it "looks right." If no token fits, add one to `_state.tsx`.

---

## 3. Typography scale (`FONTS.*`)

| Token | Stack | Use for |
|---|---|---|
| `FONTS.body` | `"Geist", "Inter", system-ui` | All body copy, labels, meta |
| `FONTS.display` | same | H1 / hero numbers (large size handles visual weight) |

**Type ramp:**

| Size (px) | Weight | Role |
|---|---|---|
| 10–11 | 600–700, `text-transform: uppercase`, `letter-spacing: 0.06em` | Eyebrow labels, section headers |
| 12    | 400–500 | Meta, timestamps, badges |
| 13    | 400–600 | Default body, row labels |
| 14    | 600–700 | Card titles, important row items |
| 15–16 | 700     | Section headings, drawer titles |
| 20–22 | 800     | Hero numbers, large KPIs |
| 28–32 | 800     | Page H1 (used in `PageHeader`) |

---

## 4. Border radius (`RADIUS.*`)

| Token | Value | Use for |
|---|---|---|
| `RADIUS.sm`  | `7px`  | Tiny pills, status chips |
| `RADIUS.md`  | `10px` | Buttons, small cards |
| `RADIUS.lg`  | `12px` | Standard cards, drawers inner sections |
| `RADIUS.xl`  | `16px` | Drawer panels, modal dialogs |
| `999` (pill) | — | Rounded badges, toggles, full-radius buttons |

---

## 5. Card anatomy

Three card archetypes:

### `PrimaryCard`
- Background: `COLORS.surface` (white)
- Border: `1px solid COLORS.borderSoft`
- Radius: `RADIUS.lg`
- Padding: `16px`
- Use for: main feature surfaces (plan, branding, team)

### `SecondaryCard`
- Background: `COLORS.surfaceAlt`
- Border: `1px solid COLORS.border`
- Radius: `RADIUS.lg`
- Padding: `14px 16px`
- Use for: operational settings (workspace, taxonomy)

### `LockedCard`
- Greyed-out `SecondaryCard` + `LockedPill` badge
- `opacity: 0.55` on the whole card
- Click → `openUpgrade()`

**Rule:** never create a one-off card style. Map to one of the three archetypes.

---

## 6. Drawer anatomy

Drawers use `DrawerShell` from `_primitives.tsx`.

```
┌─────────────────────────────────────┐
│  Topbar: title + ⓘ + size controls  │  ← sticky
│─────────────────────────────────────│
│  Scrollable body                    │
│                                     │
│─────────────────────────────────────│
│  Footer: secondary · primary CTA    │  ← sticky
└─────────────────────────────────────┘
```

- Max 2 CTAs in the footer (secondary left, primary right).
- Drawer sizes: `compact` (380px) · `half` (50vw) · `full` (90vw).
- Every drawer with destructive action must use `UnsavedChangesGuard`.
- Drawer IDs live in `DrawerId` union in `_state.tsx`.

---

## 7. Z-index ladder

Defined in `Z` object in `_state.tsx`:

| Layer | Value | Component |
|---|---|---|
| `Z.topbar`           | 40  | Workspace topbar |
| `Z.controlBar`       | 100 | Debug control bar |
| `Z.drawerBackdrop`   | 200 | Drawer backdrop overlay |
| `Z.drawerPanel`      | 210 | Drawer panel |
| `Z.modalBackdrop`    | 300 | Modal/dialog backdrop |
| `Z.modalPanel`       | 310 | Modal/dialog panel |
| `Z.toast`            | 400 | Toast stack |

GuidedTour spotlight uses `1300` (above all).

---

## 8. Motion principles (→ MOTION.md)

- Default transition: `all .15s ease`
- Page-change fade: `.22s cubic-bezier(.4,0,.2,1)`
- Drawer open: `transform: translateX + opacity`, `.2s ease`
- Always check `useReducedMotion()` and disable transitions if `true`.

---

## 9. Icon system

All icons route through `<Icon name="..." size={N} />` in `_primitives.tsx`.
The underlying renderer is Lucide. Never use emoji as a substitute for a UI icon
(emoji are acceptable in display contexts like feature cards).

Valid icon names are defined in the `Icon` component's props type. When adding
a new icon, add it there — do not use a raw SVG inline.

---

## 10. Forms

- Use `TextInput`, `TextArea`, `Toggle`, `FieldRow` from `_primitives.tsx`.
- Every field gets a label. Never use `placeholder` as the only label.
- Error state: `FieldError` component below the field.
- Dirty-state guard on any drawer form: wrap in `UnsavedChangesGuard`.
- Auto-save: display `AutoSaveIndicator` in the page header actions area.
