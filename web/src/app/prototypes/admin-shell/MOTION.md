# MOTION.md — Tulala Motion Principles

> **WS-17.5** · Durations, easings, choreography, and do's/don'ts for every animated surface in the admin-shell prototype.

---

## 1. Core principle

Motion should communicate, not decorate.

Every animation answers one of three questions:
1. **Where did this element come from / go?** (spatial orientation)
2. **What changed?** (state change feedback)
3. **How long do I have to wait?** (progress)

If an animation doesn't answer one of these, remove it.

---

## 2. Duration scale

| Token | Value | Use for |
|---|---|---|
| `instant` | 0ms | Focus rings, cursor state changes |
| `fast` | 100ms | Hover feedback, icon swaps, active press |
| `default` | 150ms | Most UI state changes (color, border, opacity) |
| `medium` | 200ms | Drawer open/close, toast enter/exit |
| `slow` | 220ms | Page transition fade |
| `deliberate` | 300ms | Modals, complex layout shifts |

**Never exceed 300ms** for a UI response to a user action. If it needs longer to complete, show a progress state instead of just a longer transition.

---

## 3. Easing reference

| Name | CSS value | Use for |
|---|---|---|
| `ease` | `ease` | Default for most transitions |
| `ease-out` | `cubic-bezier(0,.2,.2,1)` | Elements entering (drawers, toasts, dropdowns) |
| `ease-in` | `cubic-bezier(.2,0,1,.2)` | Elements exiting |
| `spring` | `cubic-bezier(.4,0,.2,1)` | Page transitions, significant layout changes |
| `linear` | `linear` | Progress bars, loading spinners |

**Rule:** entering motions use ease-out (decelerating = arriving). Exiting motions use ease-in (accelerating = leaving).

---

## 4. Component choreography table

| Component | Property animated | Duration | Easing | Notes |
|---|---|---|---|---|
| **Drawer open** | `translateX(100%)→0` + `opacity 0→1` | `200ms` | ease-out | Panel slides from right |
| **Drawer close** | `translateX(0→100%)` + `opacity 1→0` | `200ms` | ease-in | — |
| **Drawer backdrop** | `opacity 0→0.4` | `200ms` | ease | Separate from panel |
| **Toast enter** | `translateY(16px)→0` + `opacity 0→1` | `200ms` | ease-out | Stacks from bottom-right |
| **Toast exit** | `opacity 1→0` + `height collapse` | `150ms` | ease-in | Height collapses after opacity |
| **Page transition** | `opacity 0→1` | `220ms` | spring | Cross-fade only; no slide |
| **Modal enter** | `scale(0.96→1)` + `opacity 0→1` | `200ms` | ease-out | Center-scale |
| **Modal exit** | `scale(1→0.96)` + `opacity 1→0` | `150ms` | ease-in | Faster exit |
| **Popover enter** | `opacity 0→1` + `translateY(4px)→0` | `100ms` | ease-out | Tiny offset |
| **Tooltip enter** | `opacity 0→1` | `100ms` | ease | No motion |
| **StaleDataPill** | `opacity 0→1` + `translateY(-4px)→0` | `200ms` | ease-out | Floats in from above |
| **GuidedTour spotlight** | `opacity 0→1` + `scale 0.95→1` | `200ms` | ease-out | — |
| **Skeleton pulse** | `opacity 0.5→1→0.5` | `1400ms` | linear | `animation-iteration-count: infinite` |
| **Tab indicator** | `translateX(…)` | `150ms` | spring | Pill follows active tab |
| **Toggle switch** | `translateX(…)` | `150ms` | ease | Thumb moves |
| **Focus ring** | `opacity 0→1` | `0ms` | — | Never animate focus rings |
| **Row hover** | background color | `100ms` | ease | Fast — feels native |
| **Button hover** | background, border | `100ms` | ease | — |
| **Progress bar fill** | `width` | `300ms` | linear | Smooth, not spring |

---

## 5. Reduced motion

Always check `useReducedMotion()` from `_primitives.tsx` before applying any animation:

```tsx
const reduced = useReducedMotion();

// Wrong — always animated
style={{ transition: "transform .2s ease-out" }}

// Correct
style={{ transition: reduced ? "none" : "transform .2s ease-out" }}
```

When `reduced === true`:
- Set all transitions to `"none"`
- Skip `animation` CSS entirely (skeleton pulses, spinners: use static state)
- Preserve `opacity` changes at `0ms` duration (the state still changes, just instantly)
- Backdrop can use `opacity: 0 → 0.4` at `0ms` (it's not decorative)

---

## 6. Choreography rules (ordering)

When multiple things animate simultaneously:

### Drawer opening
1. Backdrop fades in (0ms delay)
2. Panel slides in (0ms delay, same duration)
3. Content appears (no additional fade — it's pre-rendered)

### Toast stacking
1. Existing toasts shift up (`translateY`) — `150ms ease`
2. New toast enters at bottom — `200ms ease-out`
3. Both start simultaneously

### Page navigation
1. Old page fades out — `110ms ease-in`
2. Overlap: new page starts fading in at 80ms — `220ms spring`
3. Total perceived duration: `~280ms`

### Skeleton → content
1. Remove skeleton (instant)
2. Content fades in — `150ms ease`
3. Never slide content in — jarring with varying content heights

---

## 7. What NOT to do

| ❌ Don't | ✅ Do instead |
|---|---|
| Bounce or spring drawers | Smooth ease-in/out |
| Animate width or height without `overflow: hidden` | Animate `max-height` or use `opacity + pointer-events: none` |
| Animate every interactive element on every interaction | Animate only on state changes that benefit from orientation |
| Use different durations for the same component in different places | Standardize on the choreography table |
| Animate focus rings | Always instant |
| Loop decorative animations on the main UI surface | Only in empty states / celebration moments |
| Add `will-change: transform` everywhere | Only on elements that animate continuously |
| Use CSS `transition: all` | Specify exact properties: `transition: opacity .15s ease, transform .15s ease` |

---

## 8. Celebration moments (special case)

Three confirmed celebration moments (per CONTENT.md §10) are exempt from the "motion should communicate" rule — they can use more expressive motion:

1. **First booking confirmed** — confetti burst, `@keyframes` OK, `reduced-motion` collapses to a color flash
2. **First inquiry sent** — pulse/ripple on the sent-checkmark icon
3. **Profile 100% complete** — progress bar fills to 100% with a `spring` ease + brief hold

Duration for celebration: up to `600ms` total.

---

## 9. Loading states

| State | Pattern |
|---|---|
| **Page load** | `OverviewSkeleton` / `InboxSkeleton` — skeleton at layout level, not spinner |
| **Drawer opening** (data fetch) | `DrawerDetailSkeleton` — inside the open drawer |
| **Button action in progress** | Replace label with `<Spinner size={14} />` inside the button |
| **Background refresh** | `StaleDataPill` — non-blocking pill above content |
| **Upload / file action** | Inline progress bar at 0→100%, then replaced by file row |

**Never** use a full-screen blocking spinner for an action that can reasonably complete in under 2 seconds.
