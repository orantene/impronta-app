# MOTION.md — Tulala Admin Motion System

> Source of truth for transitions, animations, and choreography.  
> Token definitions live in `_state.tsx → export const TRANSITION`.

---

## 1. Transition Scale (`TRANSITION`)

| Token | Value | Duration | Use |
|---|---|---|---|
| `micro` | `.12s` | 120 ms | Instant hover colour/bg swap — no easing needed at this speed |
| `sm` | `.15s ease` | 150 ms | Small opacity/border state change |
| `md` | `.18s ease` | 180 ms | Badge/pill expand, chip grow, component enter/exit |
| `layout` | `.22s ease-out` | 220 ms | Sidebar expand, grid column resize, list reflow |
| `drawer` | `.26s cubic-bezier(.4,0,.2,1)` | 260 ms | Sheet/panel slides (material decelerate curve) |

### Usage pattern

Always use template literals — never hardcode durations:

```tsx
// ✅ Correct
transition: `background ${TRANSITION.micro}`
transition: `border-color ${TRANSITION.sm}, transform ${TRANSITION.sm}`
transition: `opacity ${TRANSITION.md}, transform ${TRANSITION.drawer}`

// ❌ Wrong
transition: "background .12s"
transition: "border .15s ease, opacity .15s"
```

---

## 2. Easing Rationale

| Curve | Token | Why |
|---|---|---|
| Linear (no easing) | `micro` | 120 ms is below perception threshold for easing. Adding ease makes it feel slow. |
| `ease` (cubic-bezier .25,.1,.25,1) | `sm`, `md` | Standard browser ease — correct for small property changes. |
| `ease-out` | `layout` | Content moves in from resting, decelerates — feels spatial, not mechanical. |
| `cubic-bezier(.4,0,.2,1)` | `drawer` | Material design decelerate curve — sheet enters fast, settles gently. |

---

## 3. Choreography Patterns

### Card hover

```
1. background  → TRANSITION.micro  (instant tint)
2. box-shadow  → no transition      (shadows add perceived latency, skip or use .25s custom)
3. borderColor → TRANSITION.sm     (slightly delayed — creates subtle depth effect)
```

### Drawer enter

```
1. Backdrop fade-in   → TRANSITION.md   (opacity 0 → 1)
2. Panel slide-in     → TRANSITION.drawer (transform translateX(100%) → 0)
   Both fire together — no stagger needed at this scale.
```

### Chip/badge expand

```
transform: scale(0.96) → scale(1)  →  TRANSITION.md
opacity: 0 → 1                     →  TRANSITION.sm (slightly faster)
```

### Sidebar collapse

```
width: auto → 0     →  TRANSITION.layout
opacity: 1 → 0      →  TRANSITION.sm     (content fades before layout reflows)
Sequence: opacity leads by ~50ms (nest inside layout transition using `delay`).
```

### Toast appear/dismiss

```
Enter:  transform: translateY(8px) → 0  + opacity 0 → 1  →  TRANSITION.md
Exit:   opacity 1 → 0                                    →  TRANSITION.sm
```

---

## 4. What NOT to Animate

| Scenario | Reason | What to do instead |
|---|---|---|
| Keyframe animations | Use `@keyframes` with own timing | Do not use `TRANSITION` tokens for `animation-duration` |
| prefers-reduced-motion users | Respect OS preference | Wrap the transition value in a `reduceMotionCheck()` guard or `prefers-reduced-motion: reduce` media query |
| SVG `stroke-dasharray` | Needs longer custom cubic | Use `TRANSITION.layout` or a bespoke `.6s cubic-bezier(...)` |
| Variable-duration collapses (drag-to-resize) | Duration depends on delta | Use `TRANSITION.layout` as max; cap at that value |
| `color` on large text blocks | Causes layout work in some browsers | Prefer `opacity` or `background` transitions instead |

---

## 5. Reduced Motion

```tsx
// Pattern — use this in any component with motion:
const reduceMotion =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

style={{
  transition: reduceMotion ? "none" : `opacity ${TRANSITION.md}`,
}}
```

For the prototype, this is advisory. Production must implement system-wide.

---

## 6. Token → Property Mapping Reference

| Property being animated | Token |
|---|---|
| `background` (hover tint) | `micro` |
| `color` (text colour change) | `micro` |
| `border-color` | `sm` |
| `opacity` (fade in/out) | `sm` |
| `transform: scale` (small) | `md` |
| `transform: translateY` (chip/badge) | `md` |
| `width` (panel resize) | `layout` |
| `max-height` (accordion expand) | `layout` |
| `transform: translateX` (drawer) | `drawer` |
| `transform: translateY` (bottom sheet) | `drawer` |
