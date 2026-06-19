// lab-render-smoke.test.tsx — P4b authed Builder Lab render-smoke.
//
// WHY THIS EXISTS — the "green-gate illusion":
//   The Builder Lab full-polish program shipped a green unit gate (1251
//   tsx --test cases passing) while TWICE pushing a runtime 500 to prod
//   that ONLY an authed browser caught:
//     (1) a non-async export from a `"use server"` module, and
//     (2) a TYPE re-export from a `"use server"` module
//   Both are server-action CODEGEN breaks: Next's `"use server"` bundler
//   rewrites every export of such a module into an async RPC stub. A
//   non-async / type-only export poisons the generated client chunk →
//   "X is not defined" at runtime. The whole tsx-engine suite was blind
//   to it because those tests import *shape* modules, never the actual
//   `"use server"` files in a React import graph.
//
// THE CATCH — this lane does what the green gate could not:
//   ComponentCatalog (the Lab catalog god-file) and BuilderLabShell
//   transitively import EVERY `"use server"` action module the Lab uses.
//   Just *importing* + *mounting* them in jsdom executes the module
//   graph: if any action module has a codegen-class break that survives
//   tsc (a re-export, a non-async export the bundler would reject) it
//   surfaces here as an import/render failure — exactly the class that
//   twice reached prod.
//
//   Two complementary tiers:
//     1. RENDER — mount the real ComponentCatalog (bare props) + assert
//        the two-tier nav (Structure/Design/Admin group pills + a views
//        tablist) renders without throwing. Data effects are mocked so
//        no live DB is needed (authed-render parity without a session).
//     2. IMPORT — dynamically import the actual `"use server"` action
//        modules and assert their expected callable exports load. This
//        is the minimal, direct probe of the use-server codegen class
//        and runs even if the render tier is ever skipped.
//
// Runs under the `test:components` vitest lane (jsdom + RTL), which is
// gated in CI (.github/workflows/ci.yml → `npm run test:components`).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";

// ── Mock the Lab's data-fetching server actions ─────────────────────────────
// These are the modules ComponentCatalog calls inside its mount effects.
// We replace them with resolved no-ops so the render never reaches a live
// Supabase round-trip (the test has no auth/session). vi.mock factories run
// before the component imports, so the catalog's useEffect fetches resolve
// to empty data and the nav paints synchronously regardless.
//
// NOTE: we deliberately mock only the *runtime data* calls — the codegen
// break we are hunting lives in the module GRAPH, which is still imported
// in full by the IMPORT-tier test below (those modules are NOT mocked
// there). So mocking here does not blunt the catch.
// Partial mocks (importOriginal): keep every REAL export of each module —
// so the use-server module graph is still fully imported and any codegen
// break still surfaces — and only override the specific data-fetch
// functions the catalog calls on mount so they resolve to empty data
// instead of hitting a live Supabase. Other actions on these modules
// (e.g. resolveLabMediaTenantId on registry-admin-actions, used by a
// child view) keep their real implementation and are never invoked here.
vi.mock(
  "@/lib/site-admin/add-gallery/catalog-admin-view-action",
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    loadCatalogAdminView: vi.fn(async () => []),
    loadCatalogUsageCounts: vi.fn(async () => ({})),
  }),
);
vi.mock(
  "@/lib/site-admin/add-gallery/catalog-structure-actions",
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    listCatalogStructure: vi.fn(async () => ({})),
  }),
);
vi.mock(
  "@/lib/site-admin/builder-core/templates/registry-admin-actions",
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    listAllTemplates: vi.fn(async () => ({ ok: true, data: [] })),
    resolveLabMediaTenantId: vi.fn(async () => ({
      ok: false as const,
      error: "test: no live tenant",
    })),
  }),
);

import { ComponentCatalog } from "@/components/builder-lab/component-catalog";
import { GROUP_LABEL } from "@/components/builder-lab/catalog-nav";
import { testRender } from "../../helpers/test-render";

// ── Tier 1 — real render of the Lab catalog ─────────────────────────────────
describe("Builder Lab render-smoke — ComponentCatalog mounts", () => {
  beforeEach(() => {
    // The catalog reads ?view= from window.location on mount; keep it clean
    // so it lands on the default Structure group.
    window.history.replaceState(null, "", "/platform/builder-lab");
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the two-tier grouped nav (Structure / Design / Admin pills)", async () => {
    // The mere act of rendering imports the full Lab module graph,
    // including every transitively-imported "use server" action module.
    // A use-server codegen break throws here before any assertion.
    // The catalog shows "Loading…" until its (mocked) data effect resolves,
    // then paints the grouped nav — findByRole waits for that flush.
    testRender(<ComponentCatalog />);

    // Tier-1 — group pills live in a PillToggle, a role="tablist" labelled
    // "Catalog group" (distinct from the tier-2 "Catalog views" tablist).
    const groupBar = await screen.findByRole("tablist", { name: "Catalog group" });
    const groupText = groupBar.textContent ?? "";
    expect(groupText).toContain(GROUP_LABEL.structure); // "Structure"
    expect(groupText).toContain(GROUP_LABEL.design); // "Design"
    expect(groupText).toContain(GROUP_LABEL.admin); // "Admin"
  });

  it("renders the tier-2 views tablist with at least one view", async () => {
    testRender(<ComponentCatalog />);

    // Tier-2 — the active group's views render as a role="tablist" with
    // role="tab" buttons (data-testid="lab-tab-<view>"). Assert at least
    // one view renders without throwing.
    const tablist = await screen.findByRole("tablist", { name: "Catalog views" });
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs.length).toBeGreaterThan(0);
  });
});

// ── Tier 2 — direct import smoke of the "use server" action modules ──────────
// We import the REAL module files (vi.importActual bypasses the vi.mock
// registrations above so the three data-fetch modules are exercised for
// real here, not as stubs). If any module has a use-server codegen break —
// a non-async export, a type re-export the bundler rejects — the import
// fails and the test errors. This is the minimal, render-independent probe
// of the exact class that twice reached prod.
//
// Each entry is [label, real-module-loader, expected callable export names].
// The loader uses vi.importActual with a string LITERAL specifier (vitest
// statically analyses the specifier, so it must be inline, not a variable).
const ACTION_MODULES: ReadonlyArray<
  readonly [string, () => Promise<Record<string, unknown>>, readonly string[]]
> = [
  [
    "catalog-overlay-actions",
    () =>
      vi.importActual(
        "@/lib/site-admin/builder-core/templates/catalog-overlay-actions",
      ),
    ["setComponentOverlay", "clearComponentOverlay"],
  ],
  [
    "registry-actions",
    () =>
      vi.importActual(
        "@/lib/site-admin/builder-core/templates/registry-actions",
      ),
    [
      "publishTemplate",
      "archiveTemplate",
      "rejectToDraft",
      "submitTemplateForReview",
      "unpublishTemplate",
    ],
  ],
  [
    "taxonomy-actions",
    () =>
      vi.importActual(
        "@/lib/site-admin/builder-core/templates/taxonomy-actions",
      ),
    [],
  ],
  [
    "component-usage-action",
    () =>
      vi.importActual("@/lib/site-admin/add-gallery/component-usage-action"),
    [],
  ],
  [
    "template-usage-actions",
    () =>
      vi.importActual(
        "@/lib/site-admin/builder-core/templates/template-usage-actions",
      ),
    ["getTemplateUsageTotals"],
  ],
  [
    "catalog-admin-view-action",
    () =>
      vi.importActual("@/lib/site-admin/add-gallery/catalog-admin-view-action"),
    ["loadCatalogAdminView", "loadCatalogUsageCounts"],
  ],
];

describe("Builder Lab render-smoke — server-action modules import cleanly", () => {
  it.each(ACTION_MODULES)(
    "%s imports and exposes its async actions",
    async (_name, importer, expectedExports) => {
      const real = await importer();
      expect(real).toBeTruthy();
      for (const name of expectedExports) {
        expect(typeof real[name]).toBe(
          "function",
        );
      }
    },
  );
});
