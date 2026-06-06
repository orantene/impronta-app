# Marathon Plan — Sequencing & Regression-Safety Challenge (2026-06-05)

Scope: challenge the SEQUENCING + regression safety of `web/docs/builder-marathon-plan-2026-06-05.md`.
Questions: (1) does any wave begin surgery before the regression test harness exists? (2) where could a task
break the flag-OFF server-render safety net or the published (non-edit) render path? (3) single most likely
regression + does the plan guard it?

All claims verified against the canonical worktree `/Users/oranpersonal/Desktop/impronta-builder-marathon`.

---

## VERDICT (one line)

The wave ORDER is sound (seatbelt → trust → fast → feel → clean → capability; no surgery wave is scheduled
before Wave 0). **But the Wave-0 seatbelt itself has a fatal path defect: the test files it prescribes are
written to a directory the test runner does not scan, so they would never execute — manufacturing false green
and letting every later wave operate the most dangerous file (`edit-context.tsx`) with no real guard.** That,
not any runtime task, is the single most likely regression.

---

## 1. Does any wave begin surgery before the harness exists? — NO (ordering is correct)

- Every file that mutates a shared-core file in W1/W2/W3 has an explicit `Deps` on a Wave-0 seatbelt:
  - W1-T4 (undo for visibility/rename) deps **W0-T4**; W1-T5 deps **W0-T4, W1-T4**.
  - W2-T1 (instant-paint memo) deps **W0-T3 + W0-T7**.
  - W3-T2 / W3-T8 (conflict recovery / selection-restore) dep **W0-T4**.
- W1-T2 (classes publish) deps **W0-T5**, and the published-parity test it must extend
  (`builder-node-editor-published-parity.test.ts`) is **already wired into CI** (see §2), so the
  non-edit render path is genuinely fenced before that change.
- The §3 GO/NO-GO framework correctly forbids the context split until the W0-T7 baseline + post-cheap-win
  re-profile produce numbers. "Profile before you cut" is honored.

So on paper the dependency graph never starts surgery before the seatbelt. **The defect is that the seatbelt,
as specified, does not run.**

---

## 2. The seatbelt path defect (THE finding) — Wave 0 lands non-running tests

### What's true about the test infra
- `vitest.config.mts` `test.include = ["test/**/*.test.tsx"]`. Vitest (the `test:components` runner, which is
  the ONLY runner that does React-DOM/jsdom rendering) collects **only** `.test.tsx` files under the top-level
  `web/test/` tree. There are **0** `.test.tsx` files under `web/src` (verified: `find src -name "*.test.tsx"`
  → empty).
- The engine runner (`tsx --test`) runs `*.test.ts` files and has **no DOM** — it cannot render `EditProvider`
  via `@testing-library/react`.
- An EditProvider seatbelt ALREADY EXISTS at `web/test/components/edit-chrome/edit-context.test.tsx` (correct
  location). It is a 3-assertion smoke test only: provider mounts, context delivers `tenantId`, escape-hatch
  returns null. It does NOT cover render-count probes, drawer mutex, undo-stack depth, or CAS recovery.

### What the plan prescribes (the bug)
- W0-T2: "New `web/src/components/edit-chrome/edit-context.test.tsx`" — **wrong dir** (`src/`, not `test/`),
  and **collides in name** with the existing `test/.../edit-context.test.tsx`.
- W0-T3: "New `web/src/components/edit-chrome/edit-context.render-tax.test.tsx`" — wrong dir.
- W0-T4: "New `web/src/components/edit-chrome/edit-context.undo.test.tsx`" — wrong dir.
- W0-T2's own note ("vitest files folded into `test:components`") is incompatible with putting the file in
  `src/`: `test:components` (vitest) will not glob `src/**`, and `tsx --test` (the only thing that runs `src`
  files) has no jsdom to render the provider.

### Consequence
An agent following the file paths literally writes three `.tsx` files under `src/`. They are **silently not
collected**. `npm run test:components` still passes (it runs the OTHER, pre-existing `test/**` files). CI is
green. The agent concludes "seatbelt in place" and proceeds to Wave 1/2/3 surgery on `edit-context.tsx`
(6,437 LOC) — the exact file the seatbelt was meant to protect — with **no behavioral guard at all**. This is
strictly worse than having no plan, because it produces false confidence. It is also a perfect re-enactment of
the W0-T1 orphaned-test bug the plan is otherwise trying to eliminate.

### Fix (cheap, mandatory before any Wave-0 work)
1. Re-target W0-T2/T3/T4 to `web/test/components/edit-chrome/...` (the dir vitest scans), and EXTEND the
   existing `test/components/edit-chrome/edit-context.test.tsx` rather than creating a colliding file.
2. Pure-logic seatbelts that don't render React (W0-T5 characterization, W4-T1 bridge) are fine as `src/**
   *.test.ts` only if added to a `tsx --test` script that `ci` calls — but the undo/render-tax/provider ones
   MUST be `.test.tsx` under `test/`.
3. Add an explicit Wave-0 exit check: a NEW test asserts the assertion runs (e.g. an intentional
   `expect(true).toBe(false)` committed momentarily, or a count check) so a silently-skipped file can't pass
   as green. At minimum, the W0 gate must require the new tests to FAIL when reverted — proving they execute.

---

## 3. W0-T1 premise is slightly overstated but the conclusion holds

The plan says the 23 builder tests are "referenced 0× in package.json." Reality (verified):
- **Already wired into `ci`** via `test:builder-node-bindings` + `test:node-presentation` (both in the `ci`
  aggregate, line 38): `render.test.ts`, `render-output.test.ts`, `builder-node-undo-transaction.test.ts`,
  **`builder-node-editor-published-parity.test.ts`**, `node-presentation*.test.ts`. Good news: the
  published-render parity net W1-T2 extends is ALREADY green-gated.
- **Genuinely orphaned (0 refs)**: `style-classes.test.ts`, `multi-node-selection.test.ts`,
  `multi-node-transforms.test.ts`, `canvas-align-guides.test.ts`, `section-eject.test.ts`,
  `visibility-render.test.ts`. These cover exactly the surfaces Wave 1 (classes), Wave 2 (multi-node/align/
  drag), and Wave 4 (eject) mutate. So W0-T1 is correct in spirit and still required — but the plan should
  NOT claim the parity/undo/render tests are orphaned; they're load-bearing AND already in CI. Mis-stating
  this risks an agent "re-wiring" already-wired tests or, worse, assuming the orphan set is larger/safer than
  it is.

---

## 4. Where a task could break the flag-OFF server-render net or the published path

The dual path lives in `homepage-cms-sections.tsx`: flag-ON → `<ClientBuilderCanvas>` (`:305`); flag-OFF →
`renderBuilderNodes(freeform.tree, …)` (`:321`) "byte-identical to today." Published (non-edit) path →
`renderBuilderNodes` at `:601` and `PublishedShell.tsx:326`. The 4 `renderBuilderNodes` call sites are the
shared seam. Risk inventory:

| Task | Risk to flag-OFF / published path | Guarded? |
|---|---|---|
| **W2-T1** memoize options + `React.memo(ClientBuilderCanvas)` | Touches ONLY `client-builder-canvas.tsx` (the flag-ON client component). Does NOT touch `:321`/`:601`/`PublishedShell`. Flag-OFF + published paths are server renders that don't re-render per edit, so the memo is irrelevant to them. **Low cross-path risk.** The real W2-T1 hazard is intra-path (see §5). | Partially — see §5 |
| **W1-T2** thread `styleClasses` into all 4 call sites + bake at publish | This DOES touch `:321` (flag-OFF), `:601` (published children), `PublishedShell:326`, AND `client-builder-canvas:101`. If `resolveBuilderTreeClassRefs` mutates/normalizes the tree differently from the live editor registry, the published snapshot could diverge from the editor preview → "looks right in editor, wrong when published." | Yes, IF the parity test is actually extended: `builder-node-editor-published-parity.test.ts` is already in CI; W1-T2 gate requires a linked-class case added to it. Keep the 4-site edit in ONE PR (plan §4 hazard note). |
| **W2-T2** `hasLiveData` refresh-skip | Behavioral change to when `router.refresh()` fires after a curated section-prop save. The add/remove/undo paths already gate on `mutationTouchesSectionEmbedIslandSet` (verified at `edit-context.tsx:4072,4165`) and are untouched. Skipping refresh on a section MIS-tagged `hasLiveData:false` that actually derives server data → stale curated island until next full refresh. Only affects the flag-ON edit surface, NOT the published output. | Partially — correctness depends on the 9-vs-37 tagging being exactly right; one mistag = silent staleness. Plan should require a test that every section with a server data-loader is tagged `hasLiveData:true`. |
| **W4-T4(b)** bake canvas flag → delete server-canvas fallback (`:317-332`) | DELETES the flag-OFF safety net entirely. After this, there is no server-render fallback for the edit surface. | Yes — gated on "one prod release cycle with the canvas flag confirmed ON." Correct, but this is the point of no return; the W0-T7 flag-OFF/ON delta capture must happen BEFORE this or the safety-net baseline is lost forever. |

Net: the published/non-edit path is genuinely fenced by the already-in-CI parity test, PROVIDED W1-T2 extends
it as the gate says. The flag-OFF net is intact until W4-T4(b) deliberately removes it (correctly gated).

---

## 5. SINGLE MOST LIKELY REGRESSION

**Primary (process-level): the silent Wave-0 seatbelt — non-running `.tsx` tests under `src/` (§2).**
Likelihood high (an agent will follow the literal path), blast radius maximal (all later edit-context surgery
goes unguarded under false-green). The plan does NOT guard it: nowhere does Wave 0 assert the new tests
actually execute, and the prescribed paths guarantee they won't. **This is the one to fix first.**

**Secondary (runtime): W2-T1 `React.memo(ClientBuilderCanvas)` freezing the live canvas.**
`ClientBuilderCanvas` re-renders today on EVERY parent commit; that is currently what pulls the freshly
published tree out of the `useSyncExternalStore` bridge into view (`client-builder-canvas.tsx:94-99`,
`tree = bridgedTree ?? initialTree`). `useSyncExternalStore` will itself force a re-render when the store
emits, so `React.memo` is *probably* safe — but ONLY if the memo's prop comparator doesn't also need to let
through changes to `dataSources` / `sectionEmbedIslands` / `components` (all fresh objects from the server
parent on a real RSC refresh). If `React.memo` uses default shallow compare, a new `sectionEmbedIslands` object
identity (which IS produced fresh on every server render of `homepage-cms-sections`) will still let it through
— fine. The trap is a HAND-WRITTEN comparator (to "stop churn") that omits one of these props → a published
hero/island edit that goes through the server refresh path stops repainting. **Is it guarded?** Only if W0-T3's
render-tax test actually runs (it won't, per §2) AND a NEW test pins "store emit → canvas re-renders with the
new tree" — which NO test covers today (verified: 0 test files reference `client-builder-canvas`,
`publishBuilderCanvasTree`, or `subscribeBuilderCanvasTree`). So the secondary regression is currently
UNGUARDED, and W2-T1's named seatbelt (W0-T3) is exactly one of the files that the §2 path defect neutralizes.

The two findings compound: the most leverage-y runtime change (W2-T1) is "protected" by the one class of test
the plan accidentally disables.

---

## 6. Recommended plan amendments (minimal)

1. **Block label on Wave 0:** retarget ALL new React-rendering tests to `web/test/components/edit-chrome/…`
   (`.test.tsx`), extend the existing `edit-context.test.tsx`, and add a gate that proves each new test runs
   (fails on revert). Fix the W0-T1 wording to distinguish "already-in-CI parity/undo/render tests" from the
   6 truly-orphaned files.
2. **Add a client-canvas re-render contract test** (`test/components/edit-chrome/client-builder-canvas.test.tsx`):
   bridge emit → canvas paints the new tree; new `dataSources`/`sectionEmbedIslands` identity still propagates.
   Make it a hard dep of W2-T1 (replacing/augmenting the W0-T3 dep, which targets the wrong file type).
3. **W2-T2:** add a meta-registry test asserting `hasLiveData:true` for every section that registers a server
   data-loader, so a mistag can't silently ship stale curated islands.
4. **W4-T4(b):** make "W0-T7 flag-OFF/ON delta captured" an explicit precondition, since deleting the fallback
   destroys the ability to ever re-measure it.
