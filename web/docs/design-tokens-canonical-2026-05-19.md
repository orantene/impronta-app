# Design Tokens — Canonical Map (Phase Y4)

**Date:** 2026-05-19 · **Branch:** `y4/token-map` · **Status:** BINDING — the
one product-owner decision that the Style System climb (Y1 + Y2 + Y3) hangs
on. Once landed, the Y2 color codemod can run.

**Amends:**
- `web/docs/improvement-plan-2026-05-19-weak-dimensions.md` §"Dimension 4 — Style System / Phase Y4"
- `web/docs/remediation-plan-2026-05-19.md` §4 (Phase 3 — design-token codemod)

---

## 1. The product-owner question this answers

> "When the Y2 codemod converts `style={{ color: COLORS.coral }}` into a
> utility class, **what utility class does it write**? And when a
> hand-written CSS rule says `color: var(--???-coral)`, **what is the
> canonical custom-property name**?"

For ~5,000 inline `style={{}}` objects with `COLORS.*` references in the
admin shell, the answer must be deterministic, collision-free, and resolve
to the same hex the JS object resolves to today. That's what this map
defines.

## 2. The three token systems (intentional — do not collapse)

The codebase has three distinct token systems, each owned by one surface
with one set of brand constraints. They are NOT redundant; collapsing them
would force admin shells, tenant storefronts, and the Tulala marketing site
to share a single palette they were each built to NOT share.

| System | Prefix | Lives in | Surface | Brand owner | Per-tenant override? |
|---|---|---|---|---|---|
| **Admin** | `--color-admin-*` (new, Y4) / `COLORS.*` (legacy JS) | `state/fixtures.ts` + `styles/admin-color-bridge.css` | Admin shell, talent/client dashboards | Tulala-platform palette (forest accent, neutral surfaces) | No (one system look) |
| **Storefront** | `--token-color-*` | `app/token-presets.css` | Tenant public sites (`/t/<slug>`) | Tenant brand (resolver writes `data-token-*` attrs from `theme_json`) | **Yes — primary purpose** |
| **Marketing** | `--tl-*` | `app/globals.css` | Tulala marketing site (`tulala.digital/...`) | Editorial Tulala brand (bone surface + forest/clay accents + Fraunces serif) | No (single tenant) |
| (shadcn semantic) | `--color-*` (background/primary/accent/card/border/...) | `app/globals.css` `@theme inline` | shadcn primitives reused across surfaces | Aliased through `--impronta-*` neutrals per `site-theme-*` class | Indirect (`site-theme-tenant-override`) |

The **shadcn `--color-*` block** is the reason admin tokens can't use the
bare `--color-coral` name. `--color-accent`, `--color-card`, `--color-border`
already exist there as shadcn neutral pointers — adding admin entries under
the same names would silently overwrite them. Hence `--color-admin-*`.

### 2.1 Bridge pattern for shared semantic concepts

Where two systems happen to express the same concept with different hex
values, **they stay separate** — the values are correct for their surface,
not "drift to be reconciled":

| Concept | Admin | Storefront | Marketing | Why different |
|---|---|---|---|---|
| Ink (body text) | `#0B0B0D` | `var(--token-color-ink)` (tenant-set, default `#111111`) | `#161a16` (subtle warm-cool offset against bone) | Bone-cream marketing background; pure black admin |
| Accent / brand | `#0F4F3E` (forest) | `var(--token-color-accent)` (tenant-set, default `#0ea5e9`) | `#1e3a2d` (Tulala forest, deeper) | Each surface advertises a different brand |
| Surface (page bg) | `#FAFAF7` (warm white) | `var(--token-color-background)` (tenant-set) | `#faf6ee` (bone) | Admin needs SaaS-neutral; storefront tenant-driven; marketing editorial |
| Success / positive | `#2E7D5B` (sage) | — | `#2e6b52` (forest-positive) | Admin keeps a hue distinct from accent; marketing reuses forest family |
| Error / critical | `#B0303A` (red) | — | `#8e3f2e` (clay-red, less alarmist) | Marketing tone is softer than dashboard alerting |

**The bridge is naming-level, not hex-level.** A future codemod that wants
to substitute one for another at a given call-site must pass through this
doc's review — there is no automatic equivalence.

## 3. The full admin token map (the binding table)

Every entry in `COLORS / RADIUS / SPACE / TRANSITION` from
`web/src/components/admin/shell/internal/state/fixtures.ts` and its
mirror in `web/src/styles/admin-color-bridge.css`. Y2 codemod uses
this table verbatim.

### 3.1 COLORS — 41 entries

| # | JS access | Hex / value | Canonical CSS var | Tailwind utility (Y2 target) | Storefront equiv | Marketing equiv |
|---:|---|---|---|---|---|---|
| 1 | `COLORS.surface` | `#FAFAF7` | `--color-admin-surface` | `bg-admin-surface` / `text-admin-surface` | admin-only | `--tl-surface` (#faf6ee) — similar concept, different hue |
| 2 | `COLORS.surfaceAlt` | `#F2F2EE` | `--color-admin-surface-alt` | `bg-admin-surface-alt` | admin-only | `--tl-surface-deep` (#ebe4d5) |
| 3 | `COLORS.card` | `#FFFFFF` | `--color-admin-card` | `bg-admin-card` | admin-only | `--tl-surface-raised` (#ffffff) |
| 4 | `COLORS.ink` | `#0B0B0D` | `--color-admin-ink` | `text-admin-ink` | `--token-color-ink` (#111111) — similar | `--tl-ink` (#161a16) |
| 5 | `COLORS.inkMuted` | `rgba(11,11,13,0.72)` | `--color-admin-ink-muted` | `text-admin-ink-muted` | admin-only | `--tl-ink-soft` (#3e4640) — similar role |
| 6 | `COLORS.inkDim` | `rgba(11,11,13,0.38)` | `--color-admin-ink-dim` | `text-admin-ink-dim` | admin-only | `--tl-muted-soft` (#8e938a) |
| 7 | `COLORS.border` | `rgba(24,24,27,0.10)` | `--color-admin-border` | `border-admin-border` | admin-only | `--tl-hairline` (#e0d8c8) |
| 8 | `COLORS.borderSoft` | `rgba(24,24,27,0.06)` | `--color-admin-border-soft` | `border-admin-border-soft` | admin-only | admin-only |
| 9 | `COLORS.borderStrong` | `rgba(24,24,27,0.20)` | `--color-admin-border-strong` | `border-admin-border-strong` | admin-only | `--tl-hairline-strong` (#c7beac) |
| 10 | `COLORS.accent` | `#0F4F3E` | `--color-admin-accent` | `bg-admin-accent` / `text-admin-accent` | `--token-color-accent` (#0ea5e9 default — tenant-overridable) | `--tl-forest` (#1e3a2d) |
| 11 | `COLORS.accentDeep` | `#093328` | `--color-admin-accent-deep` | `bg-admin-accent-deep` | admin-only | `--tl-forest-deep` (#132419) |
| 12 | `COLORS.accentSoft` | `rgba(15,79,62,0.10)` | `--color-admin-accent-soft` | `bg-admin-accent-soft` | admin-only | `--tl-forest-soft` |
| 13 | `COLORS.green` | `#2E7D5B` | `--color-admin-green` | `text-admin-green` | admin-only | `--tl-positive` (#2e6b52) |
| 14 | `COLORS.amber` | `#52606D` | `--color-admin-amber` | `text-admin-amber` | admin-only | `--tl-warning` (#9c7b2e) — DIFFERENT hue |
| 15 | `COLORS.amberSoft` | `rgba(82,96,109,0.10)` | `--color-admin-amber-soft` | `bg-admin-amber-soft` | admin-only | `--tl-warning-bg` |
| 16 | `COLORS.amberDeep` | `#3A4651` | `--color-admin-amber-deep` | `text-admin-amber-deep` | admin-only | admin-only |
| 17 | `COLORS.red` | `#B0303A` | `--color-admin-red` | `text-admin-red` | admin-only | `--tl-error` (#8e3f2e) |
| 18 | `COLORS.coral` | `#C26A45` | `--color-admin-coral` | `text-admin-coral` | admin-only | `--tl-clay` (#b3886b) — similar concept |
| 19 | `COLORS.coralSoft` | `rgba(194,106,69,0.10)` | `--color-admin-coral-soft` | `bg-admin-coral-soft` | admin-only | `--tl-clay-soft` |
| 20 | `COLORS.coralDeep` | `#7A4128` | `--color-admin-coral-deep` | `text-admin-coral-deep` | admin-only | admin-only |
| 21 | `COLORS.indigo` | `#5B6BA0` | `--color-admin-indigo` | `text-admin-indigo` | admin-only | `--tl-info` (#2b4f7a) |
| 22 | `COLORS.indigoSoft` | `rgba(91,107,160,0.10)` | `--color-admin-indigo-soft` | `bg-admin-indigo-soft` | admin-only | `--tl-info-bg` |
| 23 | `COLORS.indigoDeep` | `#3F4870` | `--color-admin-indigo-deep` | `text-admin-indigo-deep` | admin-only | admin-only |
| 24 | `COLORS.brand` | `#0F4F3E` | `--color-admin-brand` | `bg-admin-brand` | (same hex as accent — semantic alias) | `--tl-forest` |
| 25 | `COLORS.brandSoft` | `rgba(15,79,62,0.10)` | `--color-admin-brand-soft` | `bg-admin-brand-soft` | admin-only | `--tl-forest-soft` |
| 26 | `COLORS.brandDeep` | `#093328` | `--color-admin-brand-deep` | `bg-admin-brand-deep` | admin-only | `--tl-forest-deep` |
| 27 | `COLORS.success` | `#2E7D5B` | `--color-admin-success` | `text-admin-success` | admin-only | `--tl-positive` |
| 28 | `COLORS.successSoft` | `rgba(46,125,91,0.10)` | `--color-admin-success-soft` | `bg-admin-success-soft` | admin-only | `--tl-positive-bg` |
| 29 | `COLORS.successDeep` | `#1F5D43` | `--color-admin-success-deep` | `text-admin-success-deep` | admin-only | admin-only |
| 30 | `COLORS.critical` | `#B0303A` | `--color-admin-critical` | `text-admin-critical` | admin-only | `--tl-error` |
| 31 | `COLORS.criticalSoft` | `rgba(176,48,58,0.10)` | `--color-admin-critical-soft` | `bg-admin-critical-soft` | admin-only | `--tl-error-bg` |
| 32 | `COLORS.criticalDeep` | `#7E1F26` | `--color-admin-critical-deep` | `text-admin-critical-deep` | admin-only | admin-only |
| 33 | `COLORS.royal` | `#5F4B8B` | `--color-admin-royal` | `text-admin-royal` | admin-only | admin-only |
| 34 | `COLORS.royalSoft` | `rgba(95,75,139,0.10)` | `--color-admin-royal-soft` | `bg-admin-royal-soft` | admin-only | admin-only |
| 35 | `COLORS.royalDeep` | `#3D2F61` | `--color-admin-royal-deep` | `text-admin-royal-deep` | admin-only | admin-only |
| 36 | `COLORS.fill` | `#4D4855` | `--color-admin-fill` | `bg-admin-fill` / `text-admin-fill` | admin-only | admin-only |
| 37 | `COLORS.fillSoft` | `rgba(77,72,85,0.10)` | `--color-admin-fill-soft` | `bg-admin-fill-soft` | admin-only | admin-only |
| 38 | `COLORS.fillDeep` | `#33303A` | `--color-admin-fill-deep` | `bg-admin-fill-deep` | admin-only | admin-only |
| 39 | `COLORS.navyBg` | `#0B0B0D` | `--color-admin-navy-bg` | `bg-admin-navy-bg` | admin-only | `--tl-surface-inverse` (#111612) — similar concept |
| 40 | `COLORS.shadow` | `0 1px 2px rgba(11,11,13,0.04)` | `--shadow-admin-rest` | `shadow-admin-rest` | admin-only | `--tl-shadow-sm` |
| 41 | `COLORS.shadowHover` | `0 6px 18px rgba(11,11,13,0.08)` | `--shadow-admin-hover` | `shadow-admin-hover` | admin-only | `--tl-shadow-md` |

**Coverage:** 41 / 41 (every `COLORS.*` key). No deferred entries.

### 3.2 RADIUS — 4 entries

| # | JS access | Value | Canonical CSS var | Tailwind utility | Marketing equiv |
|---:|---|---|---|---|---|
| 1 | `RADIUS.sm` | `7` (px) | `--radius-admin-sm` | `rounded-admin-sm` | `--tl-radius-sm` (8px — DIFFERENT) |
| 2 | `RADIUS.md` | `10` | `--radius-admin-md` | `rounded-admin-md` | `--tl-radius-md` (14px) |
| 3 | `RADIUS.lg` | `12` | `--radius-admin-lg` | `rounded-admin-lg` | `--tl-radius-lg` (22px) |
| 4 | `RADIUS.xl` | `16` | `--radius-admin-xl` | `rounded-admin-xl` | `--tl-radius-xl` (32px) |

The admin radius scale is **deliberately tighter** than marketing. Admin is
a dense, functional surface; marketing is an editorial showcase. Codemod
must NOT cross-substitute.

### 3.3 SPACE — 4 entries (no Tailwind utility — named rhythm slots)

| # | JS access | Value | Canonical CSS var | How to consume |
|---:|---|---|---|---|
| 1 | `SPACE.tight` | `8` (px) | `--space-admin-tight` | `style={{ gap: 'var(--space-admin-tight)' }}` OR Tailwind arbitrary `gap-[var(--space-admin-tight)]` |
| 2 | `SPACE.block` | `12` | `--space-admin-block` | `gap-[var(--space-admin-block)]` |
| 3 | `SPACE.group` | `24` | `--space-admin-group` | `gap-[var(--space-admin-group)]` |
| 4 | `SPACE.section` | `32` | `--space-admin-section` | `gap-[var(--space-admin-section)]` |

**Why not extend Tailwind `--spacing-*`:** SPACE is a 4-slot NAMED rhythm
scale (vertical-rhythm semantics), not a fluid spacing grid. Adding
`--spacing-tight: 8px` to `@theme` would generate `p-tight`, `gap-tight`,
`m-tight`, `mx-tight`, `mt-tight`, ..., 30+ utilities per slot — and the
names `tight`, `block`, `group`, `section` would collide with future
Tailwind keys. Cleaner to use them as raw CSS vars with arbitrary-value
syntax when needed. The 4 values (8, 12, 24, 32) also happen to align with
Tailwind's native scale (`gap-2`, `gap-3`, `gap-6`, `gap-8`); the Y1
codemod already handles those.

### 3.4 TRANSITION — 5 entries (no Tailwind utility — full timing strings)

| # | JS access | Value | Canonical CSS var |
|---:|---|---|---|
| 1 | `TRANSITION.micro` | `.12s` | `--transition-admin-micro` |
| 2 | `TRANSITION.sm` | `.15s ease` | `--transition-admin-sm` |
| 3 | `TRANSITION.md` | `.18s ease` | `--transition-admin-md` |
| 4 | `TRANSITION.layout` | `.22s ease-out` | `--transition-admin-layout` |
| 5 | `TRANSITION.drawer` | `.26s cubic-bezier(.4,0,.2,1)` | `--transition-admin-drawer` |

These are **full transition values** (duration + easing, sometimes
cubic-bezier), not bare durations — Tailwind's `--default-transition-*`
namespace only handles duration and timing-function as separate axes. Use
via inline style `style={{ transition: \`background var(--transition-admin-micro)\` }}`
or class `transition-[background] duration-[var(--transition-admin-md)]`
when the easing is the default `ease`. The drawer cubic-bezier and the
ease-out layout entries have no clean Tailwind utility shorthand — leave
those as inline `transition` declarations.

### 3.5 Z, FONTS — out of scope for Y4

`Z` (z-index ladder) is referenced numerically; it's already a small typed
JS object with no inline-style codemod implications. `FONTS` is already
wired via `--font-*` next/font tokens in `globals.css` `@theme inline`.
Neither needs a bridge layer right now. Revisit when a concrete need
arises.

## 4. Y2 codemod readiness — what unlocked

With this bridge in place, the Y2 colour-class codemod can run safely.
The exact transforms it should perform (encoded into
`scripts/phase3-token-codemod.py` as a future patch):

**4.1 JS-access → utility**
```
style={{ color: COLORS.coral }}              → className="text-admin-coral"
style={{ color: COLORS.ink }}                → className="text-admin-ink"
style={{ background: COLORS.surface }}       → className="bg-admin-surface"
style={{ borderColor: COLORS.borderStrong }} → className="border-admin-border-strong"
style={{ boxShadow: COLORS.shadow }}         → className="shadow-admin-rest"
style={{ borderRadius: RADIUS.md }}          → className="rounded-admin-md"
```

**4.2 Hex-literal → utility (only where literal matches a canonical hex)**
```
style={{ color: '#C26A45' }}                 → className="text-admin-coral"
style={{ color: '#0F4F3E' }}                 → className="text-admin-accent"  (or -brand; pick by call-site context)
```
Hex-literal substitution requires care: `#0F4F3E` maps to two semantic
roles (`accent` AND `brand` — same hex, different intent). The codemod
should prefer the role hinted by the surrounding code, or leave it inline
when ambiguous. Honest tail.

**4.3 Boundaries the codemod must respect**
- Skip storefront / marketing files (`--token-*` and `--tl-*` are theirs).
  Codemod target list: `admin/**`, `talent/**`, `client/**` (the admin-side
  dashboards), NOT `app/(public)/**` nor `marketing/**`.
- Skip any file currently in Phase 1 extraction (per remediation §4 Phase 3 rule).
- Hex-literal substitution requires `style` to be the sole attribute (same
  rule the existing layout codemod follows). Mixed `style={{ color: ..., width: x }}`
  is left untouched — partial conversion creates noise.

## 5. Honest imperfections

Called out openly so the next agent doesn't think these were missed:

1. **Two `--color-admin-accent` aliases hold the same hex** as
   `--color-admin-brand` (and likewise `green`/`success`, `red`/`critical`).
   This mirrors the source file's intentional semantic-aliasing — see the
   long comment block at `state/fixtures.ts:4171-4188`. The codemod will
   sometimes have to pick which alias to write; pick by call-site context
   or leave inline.
2. **No automatic equivalence to storefront / marketing tokens.** Even
   where the concept matches (admin `ink` ≈ marketing `--tl-ink`), the
   hex values differ deliberately. This doc lists the cross-references
   for human review; it does NOT enable substitution by codemod.
3. **`COLORS.amber` is actually slate blue** (`#52606D`), not amber.
   Renaming the JS key was rejected when the colour shifted because ~200
   call-sites already use the name. The canonical custom-property
   `--color-admin-amber` carries the same misnamed-but-stable identity.
   The semantic alias `caution` (planned but not in `COLORS`) would be a
   better long-term name — for Y5+, not Y4.
4. **The bridge file `@theme inline` block declares `var(--color-admin-*)`
   pointing at itself.** Tailwind v4 needs the `@theme` declaration to
   register the utility name; the `inline` form serialises the var-ref
   into the generated CSS so future per-tenant or per-mode overrides at
   `:root` would propagate. Currently no such override is wired — the
   admin shell is intentionally not tenant-skinnable — so the indirection
   is future-proofing, not a runtime cost beyond one extra CSS hop.
5. **SPACE + TRANSITION generate no Tailwind utility classes.** They live
   only as raw `--space-admin-*` / `--transition-admin-*` CSS vars. Y2
   codemod for these requires arbitrary-value syntax
   (`gap-[var(--space-admin-block)]`) which is uglier than `gap-3`. For
   the 4 SPACE values the native Tailwind scale (`gap-2/3/6/8`) is the
   cleaner target — the existing Y1 codemod already handles those. So
   the bridge here is mostly for hand-written code wanting the semantic
   name.

## 6. Files touched in this lane

| Path | Change | Lines |
|---|---|---|
| `web/styles/admin-color-bridge.css` | NEW — `:root` raw vars + `@theme inline` Tailwind block | ~155 |
| `web/src/app/globals.css` | `@import "../styles/admin-color-bridge.css";` after the existing `token-presets.css` import | +7 |
| `web/docs/design-tokens-canonical-2026-05-19.md` | NEW — this doc | ~280 |
| `web/docs/improvement-plan-2026-05-19-weak-dimensions.md` | §"Phase Y4" amended to point at this canonical | +2 |

NO `COLORS.*` value was touched. NO inline `style` was rewritten. NO
existing utility was redefined. The bridge is additive infrastructure.

## 7. Score delta

Per the improvement plan: **Y4 = +3 to Style System** (35 → 38). The bigger
unlock is Y2's +18, which depended on this map existing — those points
land when the codemod replays.
