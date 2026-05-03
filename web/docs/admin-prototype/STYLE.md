# STYLE.md — Tulala Admin Design System

> Source of truth for visual style. Keep this in sync with `_state.tsx` tokens and `_primitives.tsx` components.

---

## 1. Color Tokens (`COLORS`)

Defined in `_state.tsx → export const COLORS`.

### Surfaces

| Token | Hex | Use |
|---|---|---|
| `surface` | `#FAFAF7` | Page background, shell background |
| `surfaceAlt` | `#F2F2EE` | Starter/hero cards, table headers, secondary fills |
| `card` | `#FFFFFF` | All card backgrounds |

### Ink (text)

| Token | Value | Use |
|---|---|---|
| `ink` | `#0B0B0D` | Primary body text, headings |
| `inkMuted` | `rgba(11,11,13,0.72)` | Secondary text, captions, descriptions |
| `inkDim` | `rgba(11,11,13,0.38)` | Timestamps, labels, disabled state |

### Borders

| Token | Value | Use |
|---|---|---|
| `border` | `rgba(24,24,27,0.10)` | Standard card border |
| `borderSoft` | `rgba(24,24,27,0.06)` | Dividers, subtle separators |
| `borderStrong` | `rgba(24,24,27,0.20)` | Hover/active card states |

### Color Roles (semantic — 9 roles)

> Rule: hue = identity, intensity = volume. Default to soft fills + medium text. Step up only when consequence demands.

| Role | Token family | Hue | When to use | Max hits/screen |
|---|---|---|---|---|
| **brand** | `accent / brand` | Forest green | Primary CTA, focus rings, wayfinding | ≤5 |
| **success** | `success / green` | Sage | Completed, paid, confirmed, approved | — |
| **caution** | `amber` | Slate-blue | Needs attention, no risk (drafts, missing fields) | — |
| **coral** | `coral` | Terracotta | Soft urgency, "your move" (awaiting reply, expiring) | — |
| **critical** | `critical / red` | Red | Destructive, broken, irreversible | ≤1/week |
| **info** | `indigo` | Indigo | Analytics, in-flight, system messaging | — |
| **royal** | `royal` | Violet | Premium tier, AI assist, locked-tier reveals | ≤2 |
| **locked** | (no hue) | Muted ink + lock icon | Tier-gated, archived; "opportunity not error" | — |
| **focus** | `brand` | Forest green | Keyboard focus ring — always brand | — |

#### Token triplets (soft / base / deep)

Each semantic role ships as `{role}Soft` (fill) / `{role}` (text/icon on white) / `{role}Deep` (text on soft fill):

```
accentSoft / accent / accentDeep
successSoft / success / successDeep
amberSoft  / amber  / amberDeep
coralSoft  / coral  / coralDeep
criticalSoft / critical / criticalDeep
royalSoft  / royal  / royalDeep
indigoSoft / indigo / indigoDeep
```

**Decision tree:**

```
Is this a background?   → use {role}Soft
Is this text on white?  → use {role}
Is this text on soft?   → use {role}Deep
```

---

## 2. Typography (`FONTS`)

| Token | Stack | Use |
|---|---|---|
| `display` | Geist Sans → Inter → system-ui | Page H1, drawer titles, hero numbers |
| `body` | Inter → system-ui | All body copy, labels, chips, captions |
| `mono` | SF Mono → Menlo | Code blocks, IDs, ref numbers |

### Size hierarchy (proto convention)

| Element | Size | Weight | Font |
|---|---|---|---|
| Page H1 | 20–22px | 700 | display |
| Section title | 16–18px | 600 | display |
| Drawer title | 17px | 600 | display |
| Body default | 13–13.5px | 400–500 | body |
| Caption / sub | 11–12px | 400 | body |
| Chip / badge | 10.5–11px | 500–600 | body |
| Timestamp | 10.5–11px | 400 | body |
| Caps label | 10px | 700 | body (letter-spacing 0.6) |

---

## 3. Border Radius (`RADIUS`)

| Token | px | Use |
|---|---|---|
| `RADIUS.sm` | 7 | Chips, inline pills, small inputs, icon backgrounds |
| `RADIUS.md` | 10 | Buttons, dense cards, status chips |
| `RADIUS.lg` | 12 | Cards, modal shells, drawers |
| `RADIUS.xl` | 16 | Hero cards, spotlight panels |

---

## 4. Spacing (`SPACE`)

| Token | px | Use |
|---|---|---|
| `SPACE.tight` | 8 | Between dense sibling cards (strips, action rows) |
| `SPACE.block` | 12 | Default sibling gap |
| `SPACE.group` | 24 | Between a metric strip and its rich panels |
| `SPACE.section` | 32 | Between top-level page sections |

---

## 5. Elevation / Shadows

| Token | Value | Use |
|---|---|---|
| `shadow` | `0 1px 2px rgba(11,11,13,0.04)` | Default card shadow |
| `shadowHover` | `0 6px 18px rgba(11,11,13,0.08)` | Card hover state |

---

## 6. Card Archetypes

All card variants live in `_primitives.tsx`. Always prefer a named card over `<div style={{ background:"#fff", border:... }}>`.

| Component | When to use |
|---|---|
| `<Card>` | Generic container. Pass `interactive` for hover/focus behavior. |
| `<PrimaryCard>` | Hero stat, primary call-to-action tile. Accent left-border + accent icon. |
| `<SecondaryCard>` | Feature explanation, info tile, onboarding explainer. No border accent. |
| `<StatusCard>` | Metric with label + value + optional caption + tone. One data point per card. |
| `<StarterCard>` | Onboarding prompt, "next step" nudge. surfaceAlt background. |
| `<LockedCard>` | Premium gated content. Ink-muted, lock icon, hover reveals royal upgrade CTA. |

### Anatomy of a `<StatusCard>`

```
┌──────────────────────────────┐
│  [Icon]  Label               │
│                              │
│  Value (bold, 22px display)  │
│                              │
│  Caption (muted, 11px)       │
└──────────────────────────────┘
```

Tone options: `"green"` (success), `"amber"` (caution), `"ink"` (neutral).

### When NOT to use `<Card>`

- Content that's a table row → use a `<button>` with grid layout
- Simple text paragraph → use `<p>` directly
- Navigation items → use the nav rail component

---

## 7. Z-Index Ladder (`Z`)

| Token | Value | Layer |
|---|---|---|
| `Z.topbar` | 40 | Top navigation bar |
| `Z.controlBar` | 100 | Sticky control bars inside pages |
| `Z.drawerBackdrop` | 200 | Drawer/sheet backdrop overlay |
| `Z.drawerPanel` | 210 | Drawer/sheet panel itself |
| `Z.modalBackdrop` | 300 | Modal backdrop |
| `Z.modalPanel` | 310 | Modal panel |
| `Z.toast` | 400 | Toast notifications (always on top) |

---

## 8. Do / Don't Quick Reference

| ✅ Do | ❌ Don't |
|---|---|
| Use `COLORS.accent` for forest-green primary actions | Use `#C68A1E` gold/brass — it's been flagged repeatedly |
| Use `COLORS.amber` for caution states | Use warm gold for caution — see `feedback_admin_aesthetics.md` |
| Use `COLORS.royal` for premium/AI features | Use gold for premium — royal (violet) is the premium token |
| Use `RADIUS.lg` (12) for standard cards | Mix random radii (8, 9, 14, 16) on different cards |
| Step up to `shadowHover` on card hover | Add shadows on every state change |
| Use `inkDim` for timestamps | Use a custom `rgba()` when `inkDim` fits |
| Pick from the `SPACE.*` scale | Hardcode padding like `marginBottom: 17` |
