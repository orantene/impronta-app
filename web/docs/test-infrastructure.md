# Component test infrastructure

**Landed:** 2026-05-20 (lane `infra/component-tests`).
**Status:** Smoke gate live — 5 god-files covered, 13 tests, ~5s end-to-end.

Before this lane the repo had **0 .test.tsx files** and **0 component-level
tests**. Every refactor pass (53 RSC flips, 11 hoists, 4500 codemod
conversions, 28 react-hooks fixes) was verified by static gates only —
typecheck, lint, and module-graph audits. A god-file could lose its
render shape without any signal until QA hit it in the browser. This
infra plugs that hole at the smoke level.

It is **deliberately not high-coverage.** The goal is the safety net,
not the exhaustive test suite — that's a separate multi-month lane.
Five smoke tests across the highest-blast-radius god-files catches
the regressions that matter; padding the test count to look healthy
would slow the gate without proving more.

## Stack

| Layer                       | Choice                          | Why                                                                                                                           |
| --------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Runner                      | **vitest** 4.x                  | Next 15's official testing guide (`node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`) standardises on it.       |
| React renderer              | **@vitejs/plugin-react** 6.x    | Same SWC pipeline Next uses → no JSX transform mismatch between dev and tests.                                                |
| DOM env                     | **jsdom** 29.x                  | Next's official guide recommends jsdom over happy-dom. Heavier, but fewer behavioural quirks around inline-style assertions.  |
| Assertions / DOM matchers   | **@testing-library/react** 16.x + **@testing-library/jest-dom** 6.x | RTL is the React ecosystem default; jest-dom matchers (`toBeInTheDocument`, `toHaveStyle`) work on vitest's `expect`.       |

### Why not the alternatives we considered

- **Jest** — would need an entire separate config (babel.config, transform
  pipeline). Vitest reuses the existing Vite/SWC setup with zero overlap.
- **happy-dom** — lighter, but inline-style queries (used heavily by our
  primitives.tsx tests) hit known happy-dom inconsistencies with computed
  styles. jsdom worth the extra ~100ms.
- **Playwright component tests** — overkill for smoke-level checks; we
  already have full Playwright E2E for end-to-end scenarios.

### Coexistence with `tsx --test`

Engine tests (`src/**/*.test.ts`) keep running under `tsx --test` via the
existing `test:phase1-i18n`, `test:tenant-isolation`, `test:builder-*`
scripts. Vitest only picks up `test/**/*.test.tsx`:

```ts
// vitest.config.mts
include: ["test/**/*.test.tsx"],
```

No file collides between the two runners. Engine tests stay lean
(no DOM, no React); component tests pay the DOM boot cost only when
needed.

## Layout

```
web/
  test/
    setup.ts                                ← global vitest setup (RTL cleanup, jsdom shims)
    helpers/
      test-render.tsx                       ← testRender / testRenderWithShell
      supabase-mock.ts                      ← mockSupabase() — minimal chainable client
      tenant-scope-mock.ts                  ← mockTenantScope() — fixture for @/lib/saas/scope
      server-only-shim.ts                   ← empty module aliased to `server-only` + `sharp`
    components/                             ← mirrors src/components/
      admin/shell/internal/primitives.test.tsx
      admin/shell/internal/drawers/profile-shell/profile-shell-internal.test.tsx
      admin/shell/internal/page-modules/WorkspacePageView.test.tsx
      admin/shell/internal/media-page.test.tsx
      edit-chrome/edit-context.test.tsx
  vitest.config.mts                          ← runner config (jsdom env, plugin-react, alias rules)
```

## Scripts

```jsonc
// package.json
"test:components": "vitest run",        // CI + one-shot local
"test:components:watch": "vitest",      // dev loop
```

`test:components` is wired into the T2a CI workflow as the **10th test
gate**, immediately after `test:publish-preflight`. A red signal means
a recent refactor broke the render shape of a foundational component.

## Writing a new smoke test

1. Create `web/test/components/<mirror-of-src-path>.test.tsx`.
2. Import the component, the helper, and any required mocks.
3. Render and assert one or two cheap things — the title, a key button,
   that `container.firstChild` exists. **Do not** chase exhaustive
   coverage; that's a separate lane.

Template:

```tsx
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { MyComponent } from "@/components/path/to/MyComponent";
import { testRender, testRenderWithShell } from "../../helpers/test-render";

// If the component reaches next/navigation, mock it:
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {}, forward: () => {}, refresh: () => {} }),
  usePathname: () => "/admin/foo",
  useSearchParams: () => new URLSearchParams(),
}));

describe("MyComponent smoke", () => {
  it("renders without throwing", () => {
    // Use testRender for self-contained components.
    // Use testRenderWithShell for components that call useAdminShell().
    testRender(<MyComponent label="hello" />);
    expect(screen.getByText("hello")).toBeInTheDocument();
  });
});
```

## Rules of engagement

1. **Smoke level, not coverage level.** One render + one or two
   assertions per test. If you find yourself writing more than 50 LOC
   for a single component, you're past smoke — open a coverage lane.
2. **Minimal mocking.** Mock `next/navigation` because the App Router
   throws without a context. Mock `@supabase/ssr` only if the module
   wires the client at import time. Let the component render with
   real-ish fixtures from `AdminShellProvider`'s built-in mock mode.
3. **Don't touch component source code in this lane.** This is
   infrastructure work — if a smoke test reveals a bug, file it; don't
   fix it here.
4. **`server-only` is shimmed, not faked.** The alias in
   vitest.config.mts lets the import graph resolve. If a test actually
   reaches code that calls server-only behaviour (DB, fs, sharp),
   you'll still get a runtime error — that's the right signal.

## Honest imperfections

- Tests render against `AdminShellProvider`'s built-in mock fixtures,
  not against a real Supabase. Smoke tests therefore can't assert that
  the DB query path works — that's E2E territory.
- The `console.error` in `test/setup.ts` is silenced unless the message
  matches a React error-boundary signature. If a test surprisingly
  passes when it shouldn't, restore the original `console.error` in
  that file to see what was hidden.
- The `WorkspaceMediaPage` test only asserts "renders SOMETHING." The
  surface branches on plan tier and bridge data, both of which can
  change with the mock fixture; querying specific copy would make this
  test flaky on every fixture tweak.
