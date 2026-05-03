# PR Review Checklist — Tulala Admin Design Gate

> Run this checklist before merging any PR that touches the admin prototype or production UI.  
> Reviewers: designer or senior frontend. Estimated review time: 10–15 min for a typical PR.

---

## Visual / Design

- [ ] **No raw color values** — every color comes from `COLORS.*` token (no `#0F4F3E`, no `rgba(11,11,13,0.72)` literals)
- [ ] **No gold / brass / rust accents** — check for `#C68A1E`, `#B8860B`, `#CD853F`, `#D4A017`, `#8B6914` or similar warm-gold values; use `COLORS.royal` for premium instead
- [ ] **No mixed border radii** — check for ad-hoc `borderRadius: 8` or `borderRadius: 14`; must use `RADIUS.sm/md/lg/xl`
- [ ] **No ad-hoc shadows** — use `COLORS.shadow` / `COLORS.shadowHover` only
- [ ] **Card variety justified** — new `<div style={{ background: "#fff", border: ... }}>` patterns must use a named card primitive (`Card`, `PrimaryCard`, `SecondaryCard`, `StatusCard`, `StarterCard`, `LockedCard`)
- [ ] **Typography scale respected** — page titles 20–22px, body 13–13.5px, captions 11–12px, chips 10.5–11px; no arbitrary font sizes
- [ ] **Spacing scale used** — margins/gaps come from `SPACE.*` scale; no magic numbers like `marginBottom: 17` or `gap: 7`
- [ ] **Dark text never on dark background** — verify all foreground/background token pairs; especially `inkDim` on `surfaceAlt`
- [ ] **Empty states use `<EmptyState>`** — no raw "No results." strings in JSX, no ad-hoc empty-state divs

---

## Motion

- [ ] **All transitions use `TRANSITION.*` tokens** — no hardcoded `.12s`, `.15s ease`, `.18s` etc.
- [ ] **Transition shorthand uses template literals** — `` `background ${TRANSITION.micro}` `` not `"background .12s"`
- [ ] **No transitions on `color` for large text blocks** — prefer `opacity` or `background`
- [ ] **No new keyframe animations without MOTION.md entry** — custom `@keyframes` need documentation

---

## Copy / Content

- [ ] **Toast messages follow CONTENT.md patterns** — past tense, no "Successfully …", no "Coming soon — [Feature]"
- [ ] **Empty state copy matches CONTENT.md examples** — title ≤5 words, body 1–2 sentences, CTA is a verb phrase
- [ ] **Status labels are plain English** — not internal codes ("Offer sent" not "STATE_PENDING_CLIENT")
- [ ] **Button labels are sentence case** — "Send offer" not "Send Offer"
- [ ] **Confirm dialogs describe the consequence** — "Archive Kai Lin? They'll be hidden from rosters." not "Are you sure?"
- [ ] **Counts use proper pluralization** — `` `${n} ${n === 1 ? "item" : "items"}` ``

---

## Accessibility

- [ ] **All icon-only buttons have `aria-label`** — `<button aria-label="Close">` not `<button>`
- [ ] **Decorative icons have `aria-hidden`** — `<Icon name="mail" aria-hidden />` next to labeled text
- [ ] **Interactive elements are semantic** — `<button>` for actions, `<a>` for navigation; no `<div onClick>`
- [ ] **Form inputs have explicit `<label>`** — not just placeholder text
- [ ] **Live regions on dynamic content** — toasts `role="status"`, errors `role="alert"`, message streams `role="log"`
- [ ] **New drawers/modals trap focus** — verify `DrawerShell`/`ModalShell` used; custom panels need focus trap
- [ ] **Focus ring not removed** — no `outline: "none"` without `:focus-visible` replacement

---

## Icons

- [ ] **Only registered icon names used** — no SVG strings inline; all icons go through `<Icon name="...">` primitive
- [ ] **New icons added to ICONS.md** — with use/not-use guidance
- [ ] **Icon sizes follow ICONS.md guidelines** — body text 14px, nav rail 18–20px, etc.

---

## Architecture / Code Quality

- [ ] **No new `_state.tsx` color constants added without PR author justification** — the token set is frozen; additions need design review
- [ ] **No duplicate components** — check if a primitive already handles the pattern
- [ ] **`ActivityFeedItem` used for activity feeds** — no new `{ who, what, when }` ad-hoc lists
- [ ] **`EmptyState` used for empty states** — no new "Nothing here." raw strings
- [ ] **Toast calls use the pattern from `CONTENT.md`** — `toast(...)` not `alert(...)`
- [ ] **No `console.log` statements** — use `track()` for telemetry; strip debug logs before merge

---

## Prototype-Specific Gates

- [ ] **TypeScript compiles with zero errors** — `npx tsc --noEmit --skipLibCheck` passes
- [ ] **No pre-existing JSX attribute bugs introduced** — JSX attributes need `{}`: `tone={COLORS.x}` not `tone=COLORS.x`
- [ ] **`_primitives.tsx` exports remain stable** — if you changed a prop name/type on a shared primitive, verify all call sites updated
- [ ] **Roadmap debt note added** — if this PR introduces known limitations, add a row to ROADMAP.md §3 (Issues)

---

## Sign-off

| Role | Reviewer | Date |
|---|---|---|
| Design | | |
| Frontend | | |

> A PR passes this gate when all checked items are ✅ or explicitly marked "N/A — not applicable" with a note.
