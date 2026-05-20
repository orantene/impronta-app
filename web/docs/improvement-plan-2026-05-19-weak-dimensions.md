# Improvement Plan — climb the 4 weak dimensions

**Date:** 2026-05-19 · **Companion to:** `audit-2026-05-19-post-structural.md` ·
**origin/phase-1 at draft time:** `954380d4d`

> The four dimensions that didn't fully move during the structural runway —
> the *real* remaining surface area for an honest climb from 74 toward 85.
> Concrete tasks, sequenced, with realistic effort + expected score delta.

## Honest target setting (read this first)

| Dimension | Current | Realistic | Stretch (with Tier-3) |
|---|---:|---:|---:|
| Security | 65 | **80** | 88 (with RSC) |
| Code Quality / Lint | 50 | **75** | 82 |
| Frontend Architecture | 38 | **70** | 85 (real RSC rework) |
| Style System | 35 | **78** | 85 (full token system) |

**Realistic** = a few focused weeks of work, scoped lanes, the discipline
this session demonstrated. **Stretch** requires Tier-3 (RSC migration, full
design-token system) — months of sustained work, not lanes. **All four to
90+ simultaneously is a 6-month roadmap**, not a plan I'll pretend is a
plan.

---

## Dimension 1 — Security 65 → 80

### The actual problem (not the symptom)

The 3 HIGH holes hardened this session were *symptoms*. The structural
risk is **537 raw `.from()` calls in `src/lib/server-actions/`** scoping
tenants by hand, plus 4 still-pinned MED/LOW flags. Each hand-scoped query
is a potential RLS bypass / cross-tenant leak; statistical odds say more
HIGHs are hiding in those 530 sites.

### Plan (sequenced, dependency-ordered)

**Phase S1 — close the 4 remaining auth-isolation MED/LOW (~3 days)**
Each is a specific function with characterization tests pinning current
behavior. Hardenings:
- `scope.getTenantPortalScopeBySlug` — add a caller-relationship proof
  inside the helper (don't rely on every caller to enforce downstream).
- `scope.getPublicTenantScope` — UUID-validate the `x-impronta-tenant-id`
  header at the helper level (defence-in-depth over `proxy.ts`'s strip).
- `scope.resolveTenantFromHost` — explicit null/empty tenant_id guard
  before the `.eq('tenant_id', null)` resolver call.
- `admin-scope.assertRowBelongsToTenant` — `.trim()` + short-circuit on
  whitespace-only ids.
Each lands as a tiny scoped commit; flip the `it.skip` to assert hardened.

**Phase S2 — T2b data-access-layer sweep (~4–6 weeks, single-owner)**
The heavyweight, the elephant. Concrete deliverables:
1. Generate Supabase DB types (`npx supabase gen types`) → wire end-to-end.
2. Migrate the **537 raw `.from()` callsites** in `src/lib/server-actions/`
   to `tenantScopedQuery(supabase, table, tenantId)` in **per-area batches**
   (10–30 sites per commit). Each batch: tsc + lint clean.
3. Add **RLS-policy tests** that prove cross-tenant reads *fail at the DB*
   (the structural proof — the unit-mock tests we have don't catch RLS
   policy regressions).
4. Drop the `ratchet/no-untenanted-from` count from 528 → 0 in
   `eslint-suppressions.json` (one of the biggest baselined-debt rules).

**Phase S3 — integration & defence-in-depth (~1 week)**
- Header validation middleware (validate `x-impronta-tenant-id` / `host`
  shapes at request entry).
- DB-backed cross-tenant integration tests (real Supabase test project, not
  mocks) for the 5 highest-risk routes.
- Audit-log all tenant-scope resolution failures (one structured log line).

### Score math
S1: +3 (MED/LOW closed, characterization upgraded). S2: +10 (the big move
— structural tenant scoping). S3: +2 (defence-in-depth). **65 → 80.**

### To hit 88 (stretch)
Requires the RSC migration (#3) so server components can't accidentally
leak tenant context, plus a formal threat-model + pen-test pass. Not a
single lane.

---

## Dimension 2 — Code Quality / Lint 50 → 75

### Current debt openly recorded (measured 2026-05-19)

| Rule | Baseline count | Disposition |
|---|---:|---|
| `ratchet/no-new-inline-style` | 13,510 | → Dimension 4 (Style System) |
| `ratchet/no-untenanted-from` | 528 | → Dimension 1 / T2b |
| `react/no-unescaped-entities` | 260 | trivially `--fix`-able (90%+) |
| `react-hooks/static-components` | 147 | real Compiler debt → component refactors |
| `max-lines` | 95 | indivisible-by-design, keep grandfathered |
| `ratchet/no-new-hook-deps-disable` | 50 | gated; T2d cleans |
| `react/display-name` | 26 | trivial annotation fixes |
| `react-hooks/purity` | 26 | real Compiler debt |
| `@next/next/no-html-link-for-pages` | 14 | next/link conversions |
| `react-hooks/refs` | 12 | real Compiler debt |
| `@typescript-eslint/no-explicit-any` | 10 | per-site type fixes |
| `react-hooks/rules-of-hooks` | 6 | conditional-hook fixes |
| `console.log/warn/error` in source | 172 | → structured logger |
| `eslint-disable react-hooks/exhaustive-deps` inline | 42 | real latent stale-closure bugs |

### Plan (the existing T2d lane, scoped)

**Phase Q1 — trivial auto-fixes (~2 days)**
- `npm run lint -- --fix` for `no-unescaped-entities` (260) +
  `display-name` (26) + auto-fixable `no-explicit-any` cases.
- Re-baseline; **drop suppressions ~280 → 0** for these rules.
- Net: ~270 violations gone, gate unchanged at 0 errors.

**Phase Q2 — react-hooks/exhaustive-deps the proper way (~1–2 weeks)**
- The 42 inline `eslint-disable` directives are the **real bugs** T2d
  flagged. Fix per-case (reason about each — do not blindly add deps).
- Some need `useCallback`/`useMemo`, some need ref-based memoization, some
  need to be moved out of components entirely.
- Verified behaviour per fix (each gets one reviewable commit).
- Net: 42 latent stale-closure bugs eliminated.

**Phase Q3 — `console.*` → structured logger (~3 days)**
- The codebase has an existing structured logger; replace all 172
  `console.log/warn/error` in `src/` with the typed logger.
- Codemod-driven (matched by file + level + message).
- Net: 172 → 0; observability properly routed; suppressions ratcheted.

**Phase Q4 — React-Compiler debt (`static-components` / `purity` / `refs`
/ `rules-of-hooks`) ~3 weeks**
- 191 combined violations, concentrated in `WorkspacePageView.tsx` (58)
  and the other page-modules.
- These are real anti-patterns (components redeclared in render,
  side-effects in render, mutable state). Each needs the component
  refactored, not just the suppression dropped.
- Highest-leverage targets first: `WorkspacePageView.tsx` (the 838-LOC
  indivisible function — split it now that we know the issues are inside).

**Phase Q5 — `next/link` cleanup (~1 day)**
- 14 `<a href>` → `<Link href>` conversions.

### Score math
Q1: +5 (gate enforces correctly for these rules). Q2: +6 (42 real bug
class eliminated). Q3: +5 (observability + suppressions down). Q4: +8
(the dominant remaining debt). Q5: +1. **50 → 75.**

### To hit 82 (stretch)
Get every baselined rule to ratchet-only (no historical debt expanding;
ratchet count strictly monotone-decreasing on every PR). That requires CI
enforcement (Dimension 8 — T2a).

---

## Dimension 3 — Frontend Architecture 38 → 70

### The honest problem

**588 `"use client"` directives** in `src/`. The admin shell + edit-chrome
are overwhelmingly client-rendered. The original audit's worst critique
was "use-client everywhere, RSC not leveraged" — still true.

The structural decompositions made future RSC migration *possible*
(per-module migration replaces per-god-file rewrite) but no migration has
shipped.

### Plan (the deferred Tier-3, scoped into landable phases)

**Phase F1 — RSC audit + classifier (~1 week)**
Build a static-analysis script that classifies every `"use client"` file:
- **Class A — server-renderable today**: no `useState`/`useEffect`/event
  handlers/refs/`useRouter`/etc. These can flip immediately. (Expected:
  80–150 files.)
- **Class B — interactive but extractable**: small interactivity islands
  inside otherwise-static content. The parent is server, the island stays
  client.
- **Class C — necessarily client**: real interactive surfaces
  (edit-chrome's drag/drop, drawers, live previews). Keep client.

Deliverable: a CSV `rsc-audit.csv` with file + class + estimated effort,
committed for transparency.

**Phase F2 — Class A migration (~2–3 weeks)**
- Remove `"use client"` from Class A files. Each batch: 10–20 files.
- Run the full app in dev + a smoke test per batch. Visual parity
  required.
- Net: drop ~100 `"use client"` directives (from 588 → ~488).

**Phase F3 — Class B island extraction (~4–6 weeks)**
- Per file: identify the interactive piece, extract to a
  `*.client.tsx`, render it as a child of the now-server parent.
- Marketing pages → mostly Class B (interactive nav + content static).
- Admin shell `wave2.tsx` / `workspace.tsx` / `client.tsx` / `help.tsx`
  → mostly Class B (rendering server data + small action menus).
- Net: ~150 more files lose `"use client"` at the parent level (588 →
  ~340).

**Phase F4 — state-management hoisting (~2 weeks)**
- The `state.tsx` slices (1b) are client-side stores. Audit which slices
  drive server-renderable shells vs. genuine client islands.
- Move server-derivable state to RSC + props; keep transient UI state in
  client islands.

**Phase F5 — edit-chrome (keep client, but tighten boundaries) (~1 week)**
- Edit-chrome's drag/drop/live-edit IS client-domain by nature. But its
  data-fetching parents can be server.
- Tighten the client/server boundary at the edit-chrome ingress.

### Score math
F1: +2 (audit clarity is itself architectural progress). F2: +8 (real
"use client" reduction). F3: +15 (the big move — server-first defaults).
F4: +4. F5: +3. **38 → 70.**

### To hit 85 (stretch)
Full RSC migration including rewriting edit-chrome's data flow to be
streaming + suspense-aware. This is ~3 months of one-team work, real
engineering project, not a lane.

---

## Dimension 4 — Style System 35 → 78

### The actual numbers

- **12,916 inline `style={{...}}` occurrences** in source
- **13,510 `ratchet/no-new-inline-style`** baselined suppressions
- Phase 3 codemod **already exists and is committed**
  (`web/scripts/phase3-token-codemod.py`) and only covered the 22
  talent/* modules (~50 conversions).
- Admin shell `COLORS/RADIUS/SPACE/TRANSITION` design tokens live in
  `state/fixtures.ts` (JS objects, not CSS custom properties).
- Storefront tokens (`--token-*`, `--tl-*`) live in `token-presets.css`
  but are scoped to marketing-surface.

### Plan (extend Phase 3 — replay + token bridge)

**Phase Y1 — Phase 3 codemod replay across the rest of the app (~1 week)**
- Run the existing codemod (`phase3-token-codemod.py`) against:
  - `admin/shell/internal/wave2.tsx` (4,985 LOC), `workspace.tsx`,
    `client.tsx`, `help.tsx`
  - `admin/shell/internal/primitives.tsx` (8,855 LOC — wait for T2c so
    the smaller siblings exist first)
  - `client/*` directory (the client storefront surface)
  - `marketing/*` (already partly tokenised via `--tl-*` — sync)
- Net: realistically 2,000–4,000 conversions across the app.

**Phase Y2 — color/token bridge (~2 weeks)**
The deliberately-skipped class: color literals (hex, rgba, named colors)
in inline styles. The blocker has been that admin uses JS `COLORS` and
storefront uses CSS `--token-*` — same value, different access pattern.
- Define a single source of truth: `COLORS` → `:root { --color-* }`
  exposed app-wide.
- Extend Tailwind config to expose `text-color-coral`, `bg-color-coral`,
  etc., as utilities.
- Codemod the colour-literal class: `style={{ color: '#FF6B6B' }}` →
  `className="text-color-coral"`.
- Net: ~1,500–2,500 colour conversions.

**Phase Y3 — dynamic & off-grid styles (~2 weeks)**
The remaining inline styles after Y1+Y2 are mostly:
- Truly dynamic (`style={{ width: \`${x}px\` }}` for measured values).
  These are legitimate; leave them, but route through CSS custom-property
  channels (`style={{ '--w': x + 'px' }}` + Tailwind `w-[var(--w)]`) so
  the ratchet rule can distinguish.
- Off-grid one-offs that should be design-system primitives instead. Lift
  ~50 recurring patterns into shadcn/headless primitives.

**Phase Y4 — design-token amendment to the plan (~2 days) — LANDED 2026-05-19**
- Canonical token map: see [`design-tokens-canonical-2026-05-19.md`](./design-tokens-canonical-2026-05-19.md)
  for the binding mapping of all 41 `COLORS.*` + 4 `RADIUS.*` + 4 `SPACE.*` +
  5 `TRANSITION.*` admin tokens to their canonical CSS-custom-property names
  (`--color-admin-*` / `--radius-admin-*` / `--space-admin-*` /
  `--transition-admin-*`), the Tailwind v4 utilities they auto-generate
  (`bg-admin-coral`, `rounded-admin-md`, …), and the cross-references to
  storefront `--token-color-*` and marketing `--tl-*` (which intentionally
  keep separate prefixes — multi-surface brand independence, not drift).
- Admin bridge file: `web/src/styles/admin-color-bridge.css` (imported once
  via `globals.css`). Additive only; zero pixel changes; visual parity is
  the gate. Y2 colour-class codemod is now unblocked.
- Naming deviation from the original sketch: admin tokens use
  `--color-admin-*` (not the bare `--color-*` the sketch proposed) because
  the bare names collide with shadcn's `@theme inline` entries
  (`--color-accent`, `--color-card`, `--color-border`) already in
  `globals.css`. The infix preserves four independent surfaces. See §2 of
  the canonical doc for the rationale.

### Score math
Y1: +12 (the bulk — codemod replay across the app). Y2: +18 (the
colour-class breakthrough). Y3: +10 (cleaning the remainder properly).
Y4: +3 (documentation). **35 → 78.**

### To hit 85 (stretch)
Full design-token system: theme switching, dark mode, brand-tenant
overrides. Real design-system project, ~6 weeks.

---

## Recommended sequence (dependency-ordered, parallel-where-safe)

The four dimensions have real interdependencies. Recommended landing
order:

```
Week 1-2:   S1 (4 MED/LOW)        ──┐
            Q1 (auto-fixes)         │  parallel; both small/scoped/zero-risk
            Y4 (token amendment)  ──┘
            T2a (CI gate) [SEPARATE]   ← unlocks ratchet enforcement
Week 2-4:   Q3 (console.*)         │
            Y1 (Phase 3 replay)    │  parallel; touch disjoint files
            F1 (RSC audit)         │
Week 4-8:   S2 (T2b data-layer)   ◄── the big single-owner heavyweight
                                      do NOT parallelise; collision-prone
Week 6-10:  F2 (Class A migration) │  starts during/after T2b is well underway
            Y2 (color bridge)      │
Week 8-14:  Q2 (hook-deps fixes)   │
            Q4 (Compiler debt)     │
            F3 (Class B islands)   │
Week 12-16: F4 (state hoisting)    │
            Y3 (dynamic styles)    │
            F5 (edit-chrome bdry)  │
Week 14-16: S3 (DB integration tests + audit log)
```

**Total realistic effort: 14–16 calendar weeks** for one engineer +
agent-assisted lanes (the multi-agent pattern that worked this session).
Faster with more engineers, but T2b and the RSC migration are
single-owner by nature (collision-prone).

## Scoreboard math (combined)

| Dim | Now | After Plan | Δ |
|---|---:|---:|---:|
| Component Structure | 65 | 78 *(side benefit of T2c + Q4 + F3)* | +13 |
| Frontend Architecture | 38 | 70 | +32 |
| Style System | 35 | 78 | +43 |
| Test Coverage | 72 | 76 *(S3 adds DB integration)* | +4 |
| Data Access | 35 | 80 | +45 |
| Security | 65 | 80 | +15 |
| Code Quality / Lint | 50 | 75 | +25 |
| CI / Process | 30 | 75 *(if T2a lands)* | +45 |
| Documentation | 70 | 75 | +5 |
| Engineering Discipline | 88 | 90 | +2 |

**Weighted projected: ~78 → 84.** Honest realistic target after this
plan, end-to-end.

## What this plan deliberately is NOT

- It is **not** a sales pitch for hitting 90+. That requires Tier-3 RSC
  + a real design-system project + a security pen-test pass.
- It is **not** an estimate that assumes everything goes well. T2b
  realistically hits at least one schema-migration surprise (the project
  has Supabase migrations and the data layer touches 537 sites — surprises
  are statistically certain).
- It is **not** trying to be done in one session. Each phase is its own
  lane, single-owner where collision risk is real, parallel where safe.

## Prerequisites this plan assumes

- **T2a (CI gate) lands first or in parallel** — without CI enforcement,
  the ratchet system stays honor-system and the dimension-7 / dimension-8
  gains are notional.
- **The branch-governance discipline from this session continues**:
  FF-only, verify-each on the real gates, never push through conflict.
- **One product-owner decision**: the design-token canonical map
  (Y4) — needs a human call, not a codemod.
