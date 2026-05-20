// test/setup.ts — global vitest setup.
//
// Pulls in @testing-library/jest-dom matchers (so `expect(node).toBeInTheDocument()`
// etc. work) and stubs the jsdom gaps our god-files trip over.
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// React Testing Library doesn't auto-cleanup when `globals: false`.
afterEach(() => {
  cleanup();
});

// ── jsdom shims ────────────────────────────────────────────────────────────
// jsdom doesn't implement these APIs; several admin-shell primitives
// (StatusStrip, Card hover state, drawer scroll-locks) read them
// during render. Stubbing returns a safe no-op so smoke renders don't
// blow up before we get to the assertion.

if (typeof window !== "undefined") {
  // matchMedia — used by useViewport() in primitives.tsx
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }

  // ResizeObserver — used by Radix popovers + virtuoso lists
  if (!("ResizeObserver" in window)) {
    (window as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      } as unknown as typeof ResizeObserver;
  }

  // IntersectionObserver — used by react-virtuoso and lazy image loaders
  if (!("IntersectionObserver" in window)) {
    (window as unknown as { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver =
      class {
        root = null;
        rootMargin = "";
        thresholds = [];
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return [];
        }
      } as unknown as typeof IntersectionObserver;
  }

  // scrollTo — drawers call this on open
  if (!window.HTMLElement.prototype.scrollTo) {
    window.HTMLElement.prototype.scrollTo = () => {};
  }
}

// ── Server-side env guards ─────────────────────────────────────────────────
// Some shell modules read `process.env.NEXT_PUBLIC_*` at import time; stub
// the minimum so import doesn't throw before we ever render.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";

// Silence noisy console.error in tests UNLESS the test inspects it. Most
// React act() warnings during smoke tests are from intentional partial
// renders; we don't want them drowning real failures.
const originalError = console.error;
vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
  const first = args[0];
  if (typeof first === "string") {
    // Always show real failures (these break the test anyway).
    if (first.includes("Warning: An error occurred in")) {
      originalError(...args);
    }
  }
});
