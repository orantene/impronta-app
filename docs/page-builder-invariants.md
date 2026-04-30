# Page Builder Invariants — Binding Constraints for SaaS / Dashboard Refactor

**Status:** Binding invariants. Author: page-builder author (handover notes). Date: 2026-04-25.

This document captures the invariants of the existing page-builder subsystem at `web/src/components/edit-chrome/` that the SaaS dashboard refactor (Track B.5) and any future shell, surface, or inspector work **MUST NOT BREAK**. These aren't suggestions; they're contracts that took real iteration to land. Violating them is the kind of mistake that's hard to detect (cache desync, version conflicts not surfacing, tokens leaking past validation) and expensive to fix.

This doc is part of the locked-product-logic set referenced from `OPERATING.md` §12. It complements:
- [`docs/talent-relationship-model.md`](talent-relationship-model.md)
- [`docs/transaction-architecture.md`](transaction-architecture.md)
- [`docs/talent-monetization.md`](talent-monetization.md)
- [`docs/client-trust-and-contact-controls.md`](client-trust-and-contact-controls.md)

Where those docs are **product direction**, this doc is **subsystem reality** — what the working code requires to keep working.

---

## 0. Why this matters

The page builder is **mature**. The recent commit history shows active iteration (Phase A bug-fix pass, Phase B inspector rebuild, locale + OG/canonical/noindex on in-place editor, comments staff loop, scheduled publish, share-link viewer). It's the strongest subsystem in the app and one of the most-touched per week.

Track B.5 (shell rebuild) and the architectural docs above all change surfaces *around* the page builder. They must wrap it, host it, preserve its hooks — never replace, never silently bypass it. The 8 invariants below define what that means concretely.

---

## 1. Token registry is the only door for design knobs

**File:** `web/src/lib/site-admin/tokens/registry.ts`

This is the **closed contract** for every design knob the operator can edit. Every editable knob is a token entry with:
- A unique key
- `agencyConfigurable: true` (or `false` for platform-only knobs)
- A Zod validator
- A default value

### Two projection paths

Reads from the registry project in one of two ways:

| Token kind | Projection | Live-update behavior |
|---|---|---|
| Color / free-form values | `--token-*` CSS variables, sprayed on `<html style>` + element-local `style` for optimistic updates | CSS vars paint instantly; no `router.refresh()` needed |
| Enum values | `data-token-*` attributes; CSS rules in `web/src/app/token-presets.css` switch on these | Attribute changes paint instantly; structural enums may need `router.refresh()` if they affect SSR'd structure |

### Hard rules

- **Never write directly to `agency_branding.theme_json`.** That column exists, but it's the storage; the registry is the API. Direct writes bypass validation.
- **Adding a new operator-editable knob = adding a token to the registry**, with `agencyConfigurable: true`, a Zod validator, and a default. Then the save action validates against the registry; unknown keys are rejected at the boundary.
- **Don't fork the system for new product surfaces.** When the talent-monetization premium page (Pro/Portfolio per `talent-monetization.md`) needs new theming knobs, they go in the same registry. Plan-tier gating layers on top via the access module's `plan_capabilities` (Track C); the registry doesn't need a separate "talent_pro tokens" branch.

### Free-form color pattern (just shipped — the precedent)

Any color token can now take a free-form CSS value (hex / rgba / hsla / oklch). When adding new "operator can pick anything" knobs (custom radius, custom font sizes, custom spacing):
- Registry validator: `z.string().max(64)` (or tighter where appropriate)
- Project to CSS variable
- Fallback chain in CSS: `var(--token-x, fallback)`

This is the pattern. Reuse it.

---

## 2. Cache tags are a closed set

**File:** `web/src/lib/site-admin/cache-tags.ts`

The cache-tag surfaces are an enumerated list:

```
identity | branding | navigation | pages | pages-all | sections | sections-all | homepage | storefront
```

### Hard rules

- **Bare-string cache tags are ESLint-banned.** The `tagFor(tenantId, surface, qualifier?)` helper is the only path.
- **Adding a new SaaS surface that needs cache invalidation = adding it to this file.** New surfaces likely from the locked-product-logic docs:
  - `talent-page` (talent monetization)
  - `client-trust-state` (client trust ladder)
  - `payment` / `payout` (transaction architecture)
  - `agency-policy` (deferred workspace client policy)
  Each gets a named entry; bare strings are still banned.
- **`updateTag` (Next.js) inside Server Actions** is the bust mechanism. Paired with `unstable_cache` reads. Don't break the pairing — invalidating without re-tagging the read, or vice versa, leaves stale data live.

### Pairing rule (invariant 4 cross-reference)

`unstable_cache` is the cache layer. `updateTag` is the bust mechanism. They're **paired correctly today**; that pairing is part of the canvas-is-storefront contract (§4 below). When adding new readers, both sides update together.

---

## 3. Multi-tenant CAS (Compare-And-Swap) is real

These tables carry a `version` integer column and require optimistic-concurrency saves:

- `agency_branding`
- `agency_business_identity`
- `cms_navigation_items`
- `cms_sections`

### The protocol

Every save:
1. Client passes `expectedVersion` (the version it last read).
2. Server checks `WHERE version = expectedVersion` in the UPDATE.
3. On match: writes new row with `version = expectedVersion + 1`. Returns success.
4. On mismatch: returns `VERSION_CONFLICT`. Client refetches and re-reconciles.

**Reference implementation:** `web/src/lib/site-admin/server/sections.ts`. New tables that mutate operator-edited state must follow the same pattern.

### Implications for new tables (locked product docs)

The deferred migrations from the four product-logic docs add new tables. Several of them mutate operator-controlled state and **must** carry the CAS protocol:

| New table (deferred) | Source doc | CAS required? |
|---|---|---|
| `booking_transactions` | `transaction-architecture.md` | Yes — state transitions are sensitive; concurrent ops on the same booking would corrupt state. |
| `payout_accounts` | `transaction-architecture.md` | Yes — provider sync vs operator edit could clash. |
| `client_trust_state` | `client-trust-and-contact-controls.md` | No — writes are system-driven (evaluator); concurrent updates resolve via "last-write-wins on derived state." |
| `talent_contact_preferences` | `client-trust-and-contact-controls.md` | Yes — operator-edited; needs CAS. |
| `agency_capability_overrides` (deferred) | architecture brief | Yes — operator-edited. |

When these migrations are written, version columns + CAS triggers come with them. Don't skip.

---

## 4. The canvas IS the public storefront, in edit mode

**Files:**
- `web/src/components/agency-home-storefront.tsx` (storefront server component)
- `web/src/components/public-header.tsx` (header server component)
- `web/src/components/edit-chrome/edit-shell.tsx` (edit-mode wrapper)

### The contract

There is **no separate "preview" iframe**. The storefront is rendered server-side using live tokens. Edit mode is a **flag on the same render**. Two consequences:

1. **Anything that affects SSR'd structure needs `router.refresh()` to be visible.** The site-header inspector does this only for **structural** tokens (layout enums, navigation tree, etc.). For **color tokens** it skips the refresh — CSS variables paint instantly via the optimistic update path.
2. **`unstable_cache` + `updateTag` are paired correctly today.** Don't break that pairing. Adding a cache layer that reads from `unstable_cache` without registering for `updateTag` invalidation = stale-data bugs that surface only after a save.

### What this means for Track B.5

The new shell **wraps** the public storefront in edit mode; it does not replace it. There is no "preview pane" inside the new dashboard. The edit-chrome subsystem (pill, topbar, inspector dock, command palette, comments drawer, publish drawer, share-link, scheduled publish, etc.) lives **inside** the public storefront render.

**Critical:** the new admin shell's chrome (sidebar, top bar, layouts) renders on `/(workspace)/[tenantSlug]/admin/*` routes. The edit-chrome lives on the public storefront route (`/`, `/p/<slug>`, etc.) when accessed by an authenticated operator. **These are two different layouts.** Track B.5 must not unify them or strip the edit-chrome's hooks.

---

## 5. Site-header inspector IA — currently 3 tabs; section inspectors are 5

**Current state (just compressed in the recent commit):**
- **Site-header inspector:** 6 tabs → **3 tabs** (Brand / Layout / Navigation). Mobile + Behavior + Style folded into Layout as collapsible sub-sections.
- **Section inspectors** (Hero / CTA Banner / etc.): still **5 tabs** (Content / Layout / Style / Responsive / Motion) via `inspector-dock.tsx`.

### Convergence question

The two patterns will likely converge over time. **If Track B.5 (or any future inspector work) wants to unify them, that's a coordinated change.** Don't unilaterally compress section inspectors to 3 tabs without raising it — there are real reasons section inspectors carry more tabs (more knobs per section, more layout/responsive complexity).

### What this means for new product surfaces

When the four locked product docs introduce new inspector surfaces (talent-page editor, payment receiver selector, trust contact-preferences, etc.), each new inspector should:
- Use the **5-tab pattern** if it has Layout/Style/Responsive/Motion concerns
- Use the **3-tab compression** if its sub-sections are best collapsed under fewer top-level tabs
- Use the **inspector kit primitives** either way (§6)

Don't invent a new inspector pattern. Pick one of the two.

---

## 6. Inspector kit primitives are shared

**Directory:** `web/src/components/edit-chrome/inspectors/kit/`

Exposes the canonical inspector primitives:
- `KIT.input`, `KIT.label`
- `InspectorGroup`
- `VisualChipGroup`
- `ColorRow` (new)
- (and more — read the directory for the full list)

### Hard rules

- **New inspector surfaces compose these. They don't re-style fields ad-hoc.**
- This keeps the visual rhythm consistent across every inspector.
- Spacing tokens propagate centrally.
- If a new field type is needed (e.g., "talent-roster-picker", "trust-tier-toggles"), add it to the kit and reuse — don't ship one-off styled fields in a single inspector.

### Implications for the locked product docs

Surfaces from the four product-logic docs that introduce inspectors:

| Surface | Inspector lives in | Composes kit primitives |
|---|---|---|
| Talent-page editor (Pro/Portfolio templates) per `talent-monetization.md` | New inspector under `edit-chrome/inspectors/` | Yes |
| Payment receiver-selection drawer per `transaction-architecture.md` | Likely a separate drawer (not an inspector); but its form fields use the kit | Yes |
| Talent contact-preferences per `client-trust-and-contact-controls.md` | Talent surface settings (not an inspector); but field styling reuses kit | Yes |
| Workspace `roster_join_mode` per `talent-relationship-model.md` | Workspace settings inspector or settings page | Yes |

In short: every new operator-editing UI consumes the same primitives. New primitive needed? Add to the kit, then use.

---

## 7. Public storefront CSS hooks — DO NOT STRIP

The public storefront and the edit-chrome selection layer rely on these hooks. They're consumed by:
- `web/src/app/token-presets.css` (for `data-token-*` enum projections)
- The edit-chrome selection / hover / focus layer

### The hooks (preserve verbatim or migrate CSS rules in lockstep)

```
.public-header
.public-cms-footer
[data-cms-section]
[data-section-id]
[data-section-type-key]
data-token-*       (any attribute starting with data-token-)
```

### Hard rules

- **Refactor freely** — change component internals, restructure JSX, rename internal classes.
- **But preserve these hooks** OR migrate the corresponding CSS rules in the same commit.
- Don't strip them assuming they're "just classes." They're load-bearing for:
  - Live token projection (the `data-token-*` attribute switches CSS rules)
  - Edit-chrome selection (the `[data-section-id]` lets the editor target sections)
  - Public-only styling (`.public-header` / `.public-cms-footer` carry the published-render styles)

### Track B.5 implication

When the new shell's public-side renderers ship (the storefront read by anonymous visitors, the talent personal page at `/t/<slug>` per `talent-monetization.md` §3), they preserve these hooks in the same DOM positions, OR the migration includes the corresponding `token-presets.css` updates atomically.

---

## 8. Free-form colors — the new precedent for "operator can pick anything"

Just shipped: any color token can take a free-form CSS value (hex / rgba / hsla / oklch). The pattern:

1. **Registry entry:** validator `z.string().max(64)` (color string lengths are bounded by CSS spec)
2. **Projection:** to `--token-*` CSS variable
3. **Fallback chain in CSS:** `var(--token-x, fallback)` so unset values still render

### When to follow this pattern

Future "operator can pick anything" knobs that follow the same shape:
- Custom radius values (e.g., `8px`, `0.5rem`, `var(--space-md)`)
- Custom font sizes
- Custom spacing
- Any other free-form CSS value the operator should control directly

### When NOT to follow this pattern

If the knob has a **closed set of allowed values** (e.g., "card / list / grid" layout enum), use the **enum data attribute** path instead (`data-token-*` + CSS rule switch). The two paths exist for different use cases; mixing them produces fragile UI.

---

## What Track B.5 (shell rebuild) must do

Concretely, when the new shell starts wiring:

### Reuse, don't rewrite

- **Edit-chrome subsystem** lives on, untouched. The new shell hosts it via the public storefront render path — it does not embed it as a "preview" pane.
- **Token registry** is the source of truth for any new theming knob. New shell tokens go in the registry.
- **Inspector kit primitives** compose every new operator-editing UI.
- **Cache-tag helper** is the only path for cache invalidation. New surfaces register entries.
- **CAS protocol** is honored for every operator-edited table.

### Where new shell touches old

- The new admin shell layout (`(workspace)/[tenantSlug]/admin/layout.tsx`, etc.) is **separate** from the storefront layout. Edit-chrome lives on storefront; admin shell wraps the dashboard surfaces.
- "Open editor" from admin → navigates to the storefront (in edit mode), where edit-chrome takes over. Not an iframe; a navigation.
- "Save draft" / "Publish" inside edit mode runs through existing server actions; the new shell doesn't reimplement the publish path.

### What's safe to refactor

- Admin shell chrome (sidebar, top bar, breadcrumbs, account drawer) — full rebuild scope
- Page surfaces (workspace home, talent list, client list, booking detail) — full rebuild scope
- Marketing pricing / upgrade modal — full rebuild scope
- Any component **outside** `edit-chrome/`, the storefront renderers, the token registry, the cache-tag helper, the inspector kit, and the CAS-protected tables

### What requires coordination

If Track B.5 wants to:
- Unify the 3-tab vs 5-tab inspector patterns → raise it before touching
- Change which tables carry CAS → migration coordinated with the schema change
- Refactor the storefront DOM hooks → migrate `token-presets.css` in lockstep

---

## Common pitfalls

### Pitfall 1: writing to `agency_branding.theme_json` directly

**Symptom:** Operator's saved value doesn't persist or doesn't render.
**Cause:** Bypassed the token registry. Validation skipped. CSS projection didn't fire.
**Fix:** Add a token entry; route through the registry's save action.

### Pitfall 2: bare-string cache tags

**Symptom:** ESLint complains. (You won't get past lint.)
**Cause:** Used a string literal instead of `tagFor(...)`.
**Fix:** Use `tagFor(tenantId, surface, qualifier)`. Add a new surface entry to `cache-tags.ts` if needed.

### Pitfall 3: stale data after save

**Symptom:** Save succeeds; the storefront still shows the old value.
**Cause:** Either (a) the save didn't call `updateTag` for the affected surface, or (b) the structural-token change didn't trigger `router.refresh()`.
**Fix:** Inspect the action — every mutating action paths through `updateTag` for the right surface tag. Structural tokens (enums affecting SSR) also call `router.refresh()`.

### Pitfall 4: VERSION_CONFLICT not surfaced

**Symptom:** Two operators edit simultaneously; one's changes silently win.
**Cause:** The save action didn't pass `expectedVersion`, OR the client didn't refetch on conflict.
**Fix:** Reference `web/src/lib/site-admin/server/sections.ts`. Every operator-edited table goes through this protocol.

### Pitfall 5: re-styled fields breaking visual rhythm

**Symptom:** New inspector looks "off" — spacing / weights don't match the rest.
**Cause:** Composed `<input>` and `<label>` directly instead of `KIT.input` and `KIT.label`.
**Fix:** Refactor to compose kit primitives. If a new primitive is genuinely needed, add it to the kit.

### Pitfall 6: stripping CSS hooks

**Symptom:** Operator selects a section in edit mode → nothing happens. Or color tokens stop applying.
**Cause:** Refactor stripped `[data-section-id]` or `[data-token-*]` attributes.
**Fix:** Restore the hooks, or migrate `token-presets.css` rules to match the new selectors in the same commit.

### Pitfall 7: forking the inspector pattern

**Symptom:** New surface ships with 4 tabs (or 6, or some other invented count).
**Cause:** Designer or developer didn't pick from the established 3 / 5 patterns.
**Fix:** Pick one of the two. If a third pattern is genuinely needed, raise it before shipping — likely the existing two converge instead.

---

## Reference

This doc is binding. The 8 invariants are the source of truth for the page-builder subsystem. Conflicts with this doc are raised as Decision-Log amendments before any code change.

**Files referenced:**
- `web/src/components/edit-chrome/` — page-builder subsystem
- `web/src/lib/site-admin/tokens/registry.ts` — token registry (invariant 1)
- `web/src/lib/site-admin/cache-tags.ts` — cache-tag helper (invariant 2)
- `web/src/lib/site-admin/server/sections.ts` — CAS reference implementation (invariant 3)
- `web/src/components/agency-home-storefront.tsx` — storefront server component (invariant 4)
- `web/src/components/public-header.tsx` — public header (invariant 4 + invariant 7)
- `web/src/app/token-presets.css` — token enum projections (invariant 1 + invariant 7)
- `web/src/components/edit-chrome/inspector-dock.tsx` — inspector dock pattern (invariant 5)
- `web/src/components/edit-chrome/inspectors/kit/` — inspector primitives (invariant 6)

The page-builder author's full handover statement is in the session transcript dated 2026-04-25.
