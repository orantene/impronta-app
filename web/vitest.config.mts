// vitest.config.mts — component test runner (Next 15 + React 19)
//
// Coexists with the engine tests that run under `tsx --test` (see the
// test:phase1-i18n / test:builder-* / test:tenant-isolation scripts in
// package.json). Those test files live next to their source under names
// like `*.test.ts` and import from `node:test` + `node:assert/strict`.
//
// Vitest picks up a different glob — see `test.include` below — so the
// two runners never collide on the same file. Engine tests stay on
// tsx (lightweight, no DOM); only component tests that need React DOM
// rendering run through vitest + @testing-library/react + jsdom.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Vite 6+ resolves tsconfig paths natively — no vite-tsconfig-paths
    // plugin needed. `@/*` -> `./src/*` is picked up from tsconfig.json.
    tsconfigPaths: true,
    alias: [
      // `server-only` is a compile-time barrier in Next.js builds; in
      // tests we resolve it to an empty module so server-utility files
      // imported transitively by client components still load. The
      // shim doesn't *make* code work in jsdom — if a test renders a
      // path that actually executes server code (db, fs, sharp), it'll
      // still fail at runtime. The shim just lets the import graph
      // resolve so the test harness gets to the assertion.
      { find: "server-only", replacement: here("./test/helpers/server-only-shim.ts") },
      // `sharp` is a native module (no WASM build) — never callable in
      // jsdom. Smoke tests should never reach a code path that calls
      // it, but stubbing the import keeps the module graph resolvable.
      { find: "sharp", replacement: here("./test/helpers/server-only-shim.ts") },
    ],
  },
  test: {
    environment: "jsdom",
    // Only `.test.tsx` files in `test/` are component tests. Engine tests
    // (`src/**/*.test.ts`) continue to run via `tsx --test`.
    include: ["test/**/*.test.tsx"],
    setupFiles: ["./test/setup.ts"],
    globals: false,
    // jsdom is heavier than happy-dom, but Next 15's official testing
    // guide standardises on jsdom and it has fewer behavioural quirks
    // around `getComputedStyle`, `ResizeObserver`, and pointer events
    // — all of which our god-files exercise.
    css: false,
  },
});
