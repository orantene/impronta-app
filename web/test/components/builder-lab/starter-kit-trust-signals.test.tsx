// Builder Lab → Site Starter Kit: the two truths the tab was not telling.
//
// WHY THE REAL VIEW IS MOUNTED
// ────────────────────────────
// This repo's signature failure is a feature that ships DEAD while its unit
// tests pass — most recently an upgrade modal whose CTA had never rendered in
// production. Both features here are made of components that would pass a
// props-in/DOM-out test forever while being mounted nowhere. So this file
// renders `SiteStarterKitView` — the actual tab — and stubs only the server
// actions. If the drift banner or the "Set as platform default" cell is ever
// unhooked from the view, these tests go red.
//
// THE TWO TRUTHS
// ──────────────
//  1. STALENESS. The 11 published built-in rows are a manual, one-way import of
//     the code registry. Nothing re-runs it and nothing said so, so pointing the
//     platform Default Storefront at one shipped known-old content to every new
//     tenant. The banner names the stale rows.
//  2. THE UNCLAIMED SLOT. `platform_settings.default_storefront_template_id` was
//     NULL while the UI called that "Using the built-in default" — which reads as
//     a decision. It is not one, and the warning now says the consequence.
//     Claiming the slot is a per-row action that reuses the SAME writer the
//     Default surfaces panel uses; there is deliberately no second writer.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const {
  listStarterTemplatesAction,
  checkBuiltinStarterDriftAction,
  syncBuiltinStartersAction,
  resolveLabMediaTenantId,
  resolveTemplateThumbnails,
  loadPlatformDefaultTemplatesAction,
  savePlatformDefaultTemplatePointerAction,
} = vi.hoisted(() => ({
  listStarterTemplatesAction: vi.fn(),
  checkBuiltinStarterDriftAction: vi.fn(),
  syncBuiltinStartersAction: vi.fn(),
  resolveLabMediaTenantId: vi.fn(async () => ({ ok: false as const, error: "n/a" })),
  resolveTemplateThumbnails: vi.fn(async () => ({ ok: true as const, data: {} })),
  loadPlatformDefaultTemplatesAction: vi.fn(),
  savePlatformDefaultTemplatePointerAction: vi.fn(),
}));

vi.mock(
  "@/lib/site-admin/builder-core/templates/import-builtin-starters",
  () => ({
    listStarterTemplatesAction,
    checkBuiltinStarterDriftAction,
    syncBuiltinStartersAction,
  }),
);

vi.mock(
  "@/lib/site-admin/builder-core/templates/registry-admin-actions",
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    resolveLabMediaTenantId,
    resolveTemplateThumbnails,
  }),
);

vi.mock("@/lib/server-actions/admin-platform-default-templates", () => ({
  loadPlatformDefaultTemplatesAction,
  savePlatformDefaultTemplatePointerAction,
}));

import { SiteStarterKitView } from "@/components/builder-lab/catalog-starter-kit";

// ── Fixtures ────────────────────────────────────────────────────────────────

const PUBLISHED_ID = "tpl-published";
const DRAFT_ID = "tpl-draft";

function starterRow(over: Record<string, unknown> = {}) {
  return {
    id: PUBLISHED_ID,
    kind: "page_template",
    status: "published",
    target_context: "workspace",
    title: "Studio One",
    slug: "builtin-studio-one",
    description: null,
    category: "Storefront",
    gallery_tab: "page_templates",
    tags: [],
    thumbnail_asset_id: null,
    hero_asset_id: null,
    required_plan: "free",
    required_talent_tier: null,
    builder_tree: [],
    theme_tokens: null,
    data_binding_requirements: [],
    schema_version: 1,
    version: 2,
    published_at: "2026-06-18T00:00:00Z",
    source_tenant_id: null,
    created_by: null,
    created_at: "2026-06-18T00:00:00Z",
    updated_at: "2026-06-18T00:00:00Z",
    ...over,
  };
}

const ROWS = [
  starterRow(),
  starterRow({
    id: DRAFT_ID,
    status: "draft",
    title: "Half Finished",
    slug: "builtin-half-finished",
  }),
];

/** A drift report with one stale row and one that was never imported. */
const DRIFTED_REPORT = {
  entries: [
    {
      designId: "studio-one",
      slug: "builtin-studio-one",
      label: "Studio One",
      templateId: PUBLISHED_ID,
      state: "stale" as const,
    },
    {
      designId: "atelier",
      slug: "builtin-atelier",
      label: "Atelier",
      templateId: null,
      state: "missing" as const,
    },
  ],
  outOfSyncCount: 2,
  staleTemplateIds: [PUBLISHED_ID],
};

const CLEAN_REPORT = {
  entries: [
    {
      designId: "studio-one",
      slug: "builtin-studio-one",
      label: "Studio One",
      templateId: PUBLISHED_ID,
      state: "in_sync" as const,
    },
  ],
  outOfSyncCount: 0,
  staleTemplateIds: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  listStarterTemplatesAction.mockResolvedValue({ ok: true, data: ROWS });
  resolveLabMediaTenantId.mockResolvedValue({ ok: false, error: "n/a" });
  resolveTemplateThumbnails.mockResolvedValue({ ok: true, data: {} });
  checkBuiltinStarterDriftAction.mockResolvedValue({
    ok: true,
    data: DRIFTED_REPORT,
  });
  // The state that shipped for months: no platform default at all.
  loadPlatformDefaultTemplatesAction.mockResolvedValue({
    ok: true,
    pointers: {
      storefrontTemplateId: null,
      talentTemplateId: null,
      talentFreeformEnabled: false,
    },
    options: [],
  });
  savePlatformDefaultTemplatePointerAction.mockResolvedValue({ ok: true });
});

afterEach(() => cleanup());

// ── 1. Staleness is visible ─────────────────────────────────────────────────

describe("built-in staleness surfaces on the tab that owns the Sync button", () => {
  it("renders the drift banner and NAMES each out-of-sync row", async () => {
    render(<SiteStarterKitView />);

    const banner = await screen.findByTestId("lab-starter-drift-banner");
    // A count alone was the old tribal knowledge. The rows are named.
    expect(
      screen.getByTestId("lab-starter-drift-row-builtin-studio-one"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("lab-starter-drift-row-builtin-atelier"),
    ).toBeTruthy();
    expect(banner.textContent).toContain("Studio One");
    expect(banner.textContent).toContain("Atelier");
    // And it says the consequence, not just the fact.
    expect(banner.textContent).toContain("ships older content");
    // It is an alert, so a screen reader is told without hunting for it.
    expect(banner.getAttribute("role")).toBe("alert");
  });

  it("distinguishes 'content is older' from 'never imported'", async () => {
    render(<SiteStarterKitView />);

    const stale = await screen.findByTestId(
      "lab-starter-drift-row-builtin-studio-one",
    );
    const missing = screen.getByTestId("lab-starter-drift-row-builtin-atelier");
    expect(stale.textContent).toContain("content is older than the code design");
    expect(missing.textContent).toContain("never imported");
  });

  it("marks the stale ROW in the table, next to the design it affects", async () => {
    render(<SiteStarterKitView />);

    const cell = await screen.findByTestId(
      `lab-starter-set-default-${PUBLISHED_ID}`,
    );
    expect(cell.closest("td")?.textContent).toContain("Out of date");
  });

  it("shows a quiet all-clear instead of a warning when nothing has drifted", async () => {
    checkBuiltinStarterDriftAction.mockResolvedValue({
      ok: true,
      data: CLEAN_REPORT,
    });
    render(<SiteStarterKitView />);

    await screen.findByTestId("lab-starter-drift-ok");
    expect(screen.queryByTestId("lab-starter-drift-banner")).toBeNull();
  });

  it("never breaks the tab when the drift check itself fails", async () => {
    // A failed decoration must not take the surface down with it.
    checkBuiltinStarterDriftAction.mockRejectedValue(new Error("boom"));
    render(<SiteStarterKitView />);

    await screen.findByTestId(`lab-starter-row-${PUBLISHED_ID}`);
    expect(screen.queryByTestId("lab-starter-drift-banner")).toBeNull();
    expect(screen.queryByTestId("lab-starter-drift-ok")).toBeNull();
  });
});

// ── 2 + 3. The unset default reads as a warning, and is claimable here ──────

describe("an unset platform default is a warning, not a choice", () => {
  it("warns with the CONSEQUENCE when no default storefront is set", async () => {
    render(<SiteStarterKitView />);

    const warning = await screen.findByTestId(
      "lab-starter-default-unset-workspace",
    );
    expect(warning.getAttribute("role")).toBe("alert");
    // The old copy ("Using the built-in default") read as a deliberate decision.
    expect(warning.textContent).toContain("legacy seeded design");
    expect(warning.textContent).not.toContain("Using the built-in default");
  });

  it("shows no warning once a default is set", async () => {
    loadPlatformDefaultTemplatesAction.mockResolvedValue({
      ok: true,
      pointers: {
        storefrontTemplateId: PUBLISHED_ID,
        talentTemplateId: null,
        talentFreeformEnabled: false,
      },
      options: [],
    });
    render(<SiteStarterKitView />);

    await screen.findByTestId(`lab-starter-is-default-${PUBLISHED_ID}`);
    expect(
      screen.queryByTestId("lab-starter-default-unset-workspace"),
    ).toBeNull();
  });
});

describe("claiming the slot from the row you are already looking at", () => {
  it("calls the REAL pointer writer with the row and surface", async () => {
    render(<SiteStarterKitView />);

    const btn = await screen.findByTestId(
      `lab-starter-set-default-${PUBLISHED_ID}`,
    );
    fireEvent.click(btn);

    await waitFor(() =>
      // The same action the Default surfaces panel calls. A second writer here
      // is exactly how two surfaces end up disagreeing about the default.
      expect(savePlatformDefaultTemplatePointerAction).toHaveBeenCalledWith({
        surface: "storefront",
        templateId: PUBLISHED_ID,
      }),
    );
  });

  it("clears the warning and confirms what just changed", async () => {
    render(<SiteStarterKitView />);

    fireEvent.click(
      await screen.findByTestId(`lab-starter-set-default-${PUBLISHED_ID}`),
    );

    // The row flips to the claimed state…
    await screen.findByTestId(`lab-starter-is-default-${PUBLISHED_ID}`);
    // …the warning goes away…
    await waitFor(() =>
      expect(
        screen.queryByTestId("lab-starter-default-unset-workspace"),
      ).toBeNull(),
    );
    // …and the operator is told what the click actually did.
    const status = screen.getByTestId("lab-starter-default-status");
    expect(status.textContent).toContain("Studio One");
    expect(status.textContent).toContain("platform default storefront");
  });

  it("keeps the warning up and says so when the write fails", async () => {
    savePlatformDefaultTemplatePointerAction.mockResolvedValue({
      ok: false,
      error: "Could not update.",
    });
    render(<SiteStarterKitView />);

    fireEvent.click(
      await screen.findByTestId(`lab-starter-set-default-${PUBLISHED_ID}`),
    );

    const status = await screen.findByTestId("lab-starter-default-status");
    expect(status.textContent).toContain("Could not set the default");
    // Nothing was claimed, so the unclaimed-slot warning must still be up.
    expect(
      screen.getByTestId("lab-starter-default-unset-workspace"),
    ).toBeTruthy();
  });

  it("offers no button on a draft row — pointing at one silently does nothing", async () => {
    render(<SiteStarterKitView />);

    await screen.findByTestId(`lab-starter-row-${DRAFT_ID}`);
    expect(screen.queryByTestId(`lab-starter-set-default-${DRAFT_ID}`)).toBeNull();
    expect(
      screen.getByTestId(`lab-starter-row-${DRAFT_ID}`).textContent,
    ).toContain("Publish it first");
  });
});
