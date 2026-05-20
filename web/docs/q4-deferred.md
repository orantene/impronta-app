# Q4 — Deferred items (compiler-debt lane)

Items out of scope for this Q4 lane but worth tracking for follow-up.

## A. Real react-hooks violations that need different-pattern fixes — 27 sites across 12 files

Initial Q4 probe (using `eslint --format json` reading `messages`)
under-counted by missing the `suppressedMessages` array. Live lint
DOES fire `react-hooks/{purity,refs,immutability,rules-of-hooks,preserve-manual-memoization}`
on these files — they show up under `suppressedMessages` because the
suppressions baseline hides them. They are **real** violations that
the static-components hoist work in this lane does not address.

Each rule needs its own per-site playbook (per the Q4 brief's "THE 4
VIOLATION CLASSES" section). Hoisting an inner component does nothing
for them.

| Rule | Sites | Files |
|---|---|---|
| `react-hooks/purity` | 14 | profile-shell-internal (5), OverviewPage (4), work/[id]/page (1), drawer-shared (1), light-05 (1), light-22 (1), pitch-compose (1) |
| `react-hooks/refs` | 7 | profile-shell-internal (2), InboxPage (2), admin-shell-client (1), drawer-shared (1), primitives (1) |
| `react-hooks/rules-of-hooks` | 3 | light-03 (2), BillingPage (1) |
| `react-hooks/preserve-manual-memoization` | 2 | EditorSections (1), media-page (1) |
| `react-hooks/immutability` | 1 | IdentityBar-2 (1) |
| **Total** | **27** | **12 files** |

**Recommended Q4-follow-up lane scope:**
- One sub-lane per rule, since each needs different surgery:
  - **purity** — move render-time side effects into `useEffect` or
    event handlers. Never delete; understand intent first.
  - **refs** — move ref read/mutation out of render into `useEffect`
    or callback. Use functional state updates if a stale-closure
    bug is the underlying cause.
  - **rules-of-hooks** — hoist conditional hook calls; usually split
    the component along the condition boundary.
  - **preserve-manual-memoization** — verify dep arrays; sometimes
    the fix is wrapping the value in `useMemo`, sometimes pulling
    the computation out of memo entirely.
  - **immutability** — replace `arr.push(x)` / `obj.foo = x` style
    mutations with spread / structuredClone updates.

Each site can be read cold + fixed individually. No codemod.

## B. Style / animation cleanup deferred to Y3

`WorkspacePageView.tsx` — inline `<style>{@keyframes …}</style>`
inside the `AccordionItem` body re-injects the keyframe element on
every accordion expand. Not a hooks-rule violation; out of Q4 scope.
Recommended fix: move keyframes to a CSS module / shared admin
animations stylesheet and reference by className. Belongs in the
dynamic-styles lane (Y3) when it runs.

## C. Plugin upgrade — recommended follow-up lane

Bundled `eslint-plugin-react-hooks@7.0.1` (vendored under
`node_modules/eslint-config-next/node_modules/`) does not fire
`react-hooks/static-components` on **arrow-const** inner components
— only on `function Foo()` declarations. (Phase A's WorkspacePageView
hits proved the rule works on the `function` form: 58 → 0 deltas
were live and observable in `npm run lint`.)

A scratch install of plugin **7.1.1** (one minor bump above what's
bundled) flagged **33 violations on `media-page.tsx` alone** before
our hoists. Extrapolating across the 16 Q4-target files plus the
rest of the admin shell, a plugin bump would likely surface
**200+ additional `react-hooks/static-components` violations** that
are currently invisible.

Recommended follow-up:
1. Audit whether `eslint-config-next` can be bumped or whether
   `eslint-plugin-react-hooks@7.1.1` should be installed
   side-by-side at the top level (overriding the bundled vendored
   copy).
2. Lock the version explicitly in `package.json` so future
   `eslint-config-next` updates can't silently downgrade the rules.
3. Re-baseline with `npm run lint:refresh-baseline` and process the
   resulting real violations as Q5.

## D. Pre-existing TSC baseline drift

When the Q4 brief was written, `TSC_BASE` was 4. It was raised to
**6** during Q4 (commit `4cc4ace53 ci(t2a): raise TSC_BASE 4 → 6`)
because Q1's no-explicit-any work surfaced 2 latent errors. The six
baseline errors as of `q4/compiler-debt` HEAD:

- `drawers/light-01.tsx(146,23)` TS2322
- `drawers/profile-shell/profile-shell-internal.tsx(244,30)` TS2339
- `drawers/profile-shell/profile-shell-internal.tsx(332,22)` TS2339
- `drawers/profile-shell/profile-shell-internal.tsx(451,13)` TS2339
- `drawers/profile-shell/profile-shell-internal.tsx(452,13)` TS2339
- `page-modules/WorkspaceTopbar.tsx(545,28)` TS2345

None of Q4's commits introduced new errors.

## E. ESLint flag incompatibility — `--suppress-all` vs `--prune-suppressions`

ESLint refuses to accept both flags in one invocation:

> `The --suppress-all option and the --prune-suppressions option cannot be used together.`

The Q4 fix to `lint:refresh-baseline` therefore chains them with
`&&` so they run sequentially: prune first (drops entries whose
underlying violations were truly removed), then suppress-all
(captures any newly-suppressible warnings). The two-step pipeline
keeps `eslint-suppressions.json` honest in both directions.
