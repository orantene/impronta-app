// The `/template-preview/[key]?kind=db-template` route, driven through the REAL
// route function — because the bug was a lie the route told, not a broken helper.
//
// WHAT WAS WRONG
// ──────────────
// The db-template branch hardcoded `siteKind: "talent_personal"`, hydrated the
// tree with TALENT tokens, and handed it to `TalentSiteRenderer` with a demo
// persona and NO tenant id — for EVERY persisted row, including the
// workspace-targeted ones. A platform Default Storefront is a workspace-targeted
// template by definition, so the one preview an operator would use to vet the
// platform's default site rendered it through the wrong pipeline: the
// workspace-scoped connected nodes (featured talent, discipline grid, roster
// repeaters) resolve through tenant-scoped loaders, found no tenant, and
// rendered nothing. Silently. The operator read the empty result as the design.
//
// WHY THIS TEST CALLS THE PAGE FUNCTION
// ─────────────────────────────────────
// Every helper involved was already correct in isolation. The defect was WHICH
// pipeline the route picked, so the assertion has to be about the route's own
// branch. `TemplatePreviewPage` is an async server component: awaiting it yields
// the element it chose, which is exactly the decision under test. The chosen
// component is then awaited and rendered too, so "it returned the right element"
// is backed up by "and that element really asks HomepageCmsSections for a
// tenant-scoped render".
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// ── Hoisted spies (vi.mock factories are hoisted above every const) ──────────
const {
  getTemplateById,
  resolvePreviewHydration,
  resolveWorkspacePreviewContext,
  loadPublicBranding,
  homepageCmsSections,
  talentSiteRenderer,
  notFound,
} = vi.hoisted(() => ({
  getTemplateById: vi.fn(),
  resolvePreviewHydration: vi.fn(),
  resolveWorkspacePreviewContext: vi.fn(),
  loadPublicBranding: vi.fn(),
  homepageCmsSections: vi.fn(),
  talentSiteRenderer: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound }));

vi.mock(
  "@/lib/site-admin/builder-core/templates/registry-admin-actions",
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    getTemplateById,
  }),
);

vi.mock("@/lib/talent-site/server/preview-data", () => ({
  resolvePreviewHydration,
}));

vi.mock("@/lib/site-admin/server/preview-workspace-context", () => ({
  resolveWorkspacePreviewContext,
}));

vi.mock("@/lib/site-admin/server/reads", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadPublicBranding,
}));

// Marker renderers — the identity of the pipeline is what is being asserted, and
// the real ones need a live database.
vi.mock("@/components/home/homepage-cms-sections", () => ({
  HomepageCmsSections: (props: Record<string, unknown>) => {
    homepageCmsSections(props);
    return <div data-testid="storefront-pipeline" />;
  },
}));

vi.mock("@/components/talent/site/TalentSiteRenderer", () => ({
  TalentSiteRenderer: (props: Record<string, unknown>) => {
    talentSiteRenderer(props);
    return <div data-testid="talent-pipeline" />;
  },
}));

import TemplatePreviewPage from "@/app/template-preview/[key]/page";
import { WorkspaceTemplatePreview } from "@/app/template-preview/[key]/workspace-template-preview";

// ── Fixtures ────────────────────────────────────────────────────────────────

const TREE = [
  {
    id: "n1",
    kind: "talent_type_grid",
    props: { layerLabel: "Disciplines" },
  },
];

function templateRow(target: "workspace" | "talent" | "both") {
  return {
    id: "tpl-1",
    slug: "builtin-studio-one",
    title: "Studio One",
    description: "A storefront starter.",
    target_context: target,
    status: "published",
    builder_tree: TREE,
  };
}

const TENANT = {
  tenantId: "tenant-uuid-1",
  slug: "impronta",
  displayName: "Impronta",
  source: "hub" as const,
};

async function runRoute(key: string, sp: Record<string, string>) {
  return TemplatePreviewPage({
    params: Promise.resolve({ key }),
    searchParams: Promise.resolve(sp),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resolvePreviewHydration.mockResolvedValue({
    profile: null,
    media: [],
    // The demo-persona token bag `hydrateTalentTree` reads on the talent branch.
    tokens: { displayName: "Demo Talent", tagline: "", gallery: [] },
  });
  resolveWorkspacePreviewContext.mockResolvedValue(TENANT);
  loadPublicBranding.mockResolvedValue(null);
});

afterEach(() => cleanup());

// ── The branch ──────────────────────────────────────────────────────────────

describe("db-template preview picks its pipeline from target_context", () => {
  it("sends a WORKSPACE-targeted row to the storefront preview", async () => {
    getTemplateById.mockResolvedValue({ ok: true, data: templateRow("workspace") });

    const element = await runRoute("tpl-1", { kind: "db-template" });

    expect(element.type).toBe(WorkspaceTemplatePreview);
    expect(element.props.builderTree).toEqual(TREE);
    expect(element.props.tenant).toEqual(TENANT);
  });

  it("sends a BOTH-targeted row to the storefront preview too", async () => {
    // `both` resolves to the storefront path on purpose: it is the strictly
    // harder context to fake, so a design that reads correctly there is the one
    // worth pointing a platform default at.
    getTemplateById.mockResolvedValue({ ok: true, data: templateRow("both") });

    const element = await runRoute("tpl-1", { kind: "db-template" });

    expect(element.type).toBe(WorkspaceTemplatePreview);
  });

  it("leaves a TALENT-targeted row on the untouched talent pipeline", async () => {
    // The regression guard for the other direction: fixing the workspace lie
    // must not move talent templates off the renderer they already had.
    getTemplateById.mockResolvedValue({ ok: true, data: templateRow("talent") });

    render(await runRoute("tpl-1", { kind: "db-template" }));

    expect(screen.getByTestId("talent-pipeline")).toBeTruthy();
    expect(resolveWorkspacePreviewContext).not.toHaveBeenCalled();
    const snapshot = talentSiteRenderer.mock.calls[0][0].snapshot;
    expect(snapshot.siteKind).toBe("talent_personal");
    expect(snapshot.templateKey).toBe("builtin-studio-one");
  });

  it("forwards ?tenant= so a preview URL is reproducible", async () => {
    getTemplateById.mockResolvedValue({ ok: true, data: templateRow("workspace") });

    await runRoute("tpl-1", { kind: "db-template", tenant: "acme" });

    expect(resolveWorkspacePreviewContext).toHaveBeenCalledWith("acme");
  });

  it("passes null (not undefined) when no tenant is requested", async () => {
    getTemplateById.mockResolvedValue({ ok: true, data: templateRow("both") });

    await runRoute("tpl-1", { kind: "db-template" });

    expect(resolveWorkspacePreviewContext).toHaveBeenCalledWith(null);
  });

  it("still 404s an unknown / non-admin row before choosing any pipeline", async () => {
    getTemplateById.mockResolvedValue({ ok: false, error: "Draft not found." });

    await expect(runRoute("ghost", { kind: "db-template" })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(resolveWorkspacePreviewContext).not.toHaveBeenCalled();
  });
});

// ── The storefront preview itself ───────────────────────────────────────────

describe("WorkspaceTemplatePreview renders through the live storefront call", () => {
  it("hands HomepageCmsSections a REAL tenant id and a freeform snapshot", async () => {
    // This is the property the old preview could not have: the same call
    // agency-home-storefront.tsx makes, so connected nodes resolve against a
    // real roster instead of rendering empty and looking deliberate.
    render(
      await WorkspaceTemplatePreview({
        title: "Studio One",
        metaDescription: null,
        builderTree: TREE as never,
        tenant: TENANT,
        locale: "en",
      }),
    );

    expect(screen.getByTestId("storefront-pipeline")).toBeTruthy();
    const props = homepageCmsSections.mock.calls[0][0];
    expect(props.tenantId).toBe(TENANT.tenantId);
    expect(props.snapshot.builderTree).toEqual(TREE);
    // Freeform: tree only, no curated slots — the branch inside
    // HomepageCmsSections that the platform default takes.
    expect(props.snapshot.slots).toEqual([]);
  });

  it("names the workspace it rendered against, so nobody guesses whose data it is", async () => {
    render(
      await WorkspaceTemplatePreview({
        title: "Studio One",
        metaDescription: null,
        builderTree: TREE as never,
        tenant: TENANT,
        locale: "en",
      }),
    );

    const strip = screen.getByTestId("workspace-template-preview-context");
    expect(strip.textContent).toContain("Impronta");
    expect(strip.textContent).toContain("platform hub workspace");
  });

  it("SAYS the connected sections are empty when no workspace resolved", async () => {
    // The failure mode being removed is silence. With no tenant the preview must
    // not render an empty storefront that reads as the design.
    render(
      await WorkspaceTemplatePreview({
        title: "Studio One",
        metaDescription: null,
        builderTree: TREE as never,
        tenant: null,
        locale: "en",
      }),
    );

    expect(homepageCmsSections).not.toHaveBeenCalled();
    const strip = screen.getByTestId("workspace-template-preview-context");
    expect(strip.textContent).toContain("No workspace could be resolved");
    expect(strip.textContent).toContain("a gap in this preview, not in the design");
  });
});
