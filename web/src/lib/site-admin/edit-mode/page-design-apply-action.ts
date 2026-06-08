"use server";

/**
 * One-click full-page design apply.
 *
 * Slice 2 of the 2026 builder redesign: a tenant on a blank homepage picks one
 * of the productised world-class page designs (Editorial / SaaS / Store /
 * Festival / Agency) and the WHOLE page is filled in one click — no
 * section-by-section building.
 *
 * Mechanism: the design is a self-contained freeform BuilderNode tree. We bake
 * it (repeaters → static children, fresh ids) and persist it as the homepage's
 * draft `builderTree` with EMPTY curated slots. A homepage draft save explicitly
 * allows empty slots and persists a non-empty builderTree (server/homepage.ts),
 * so the page renders the design directly. Nothing publishes until the operator
 * clicks Publish — they're editing a draft they can restyle or replace.
 */

import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { DEFAULT_PLATFORM_LOCALE } from "@/lib/site-admin";
import {
  ensureHomepageRow,
  loadHomepageForStaff,
  saveHomepageDraftComposition,
} from "@/lib/site-admin/server/homepage";
import {
  bakePageDesignTree,
  getPageDesign,
} from "@/lib/site-admin/builder-node/page-designs";
import { saveHomepageCompositionAction } from "./composition-actions";

export type ApplyPageDesignState =
  | { ok: true; designId: string }
  | { ok: false; error: string; code?: string }
  | undefined;

export async function applyPageDesignToHomepage(
  _prev: ApplyPageDesignState,
  formData: FormData,
): Promise<ApplyPageDesignState> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return { ok: false, error: "Select an agency workspace first." };
  }

  const designId = String(formData.get("designId") ?? "");
  const design = getPageDesign(designId);
  if (!design) {
    return { ok: false, error: `Unknown design "${designId}".` };
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return { ok: false, error: "Server is missing service-role credentials." };
  }

  // Ensure the homepage row exists so we have a version to CAS against.
  const ensure = await ensureHomepageRow(admin, {
    tenantId: scope.tenantId,
    locale: DEFAULT_PLATFORM_LOCALE,
    actorProfileId: auth.user.id,
  });
  if (!ensure.ok) {
    return {
      ok: false,
      error: ensure.message ?? "Could not initialise the homepage.",
      code: ensure.code,
    };
  }

  const state = await loadHomepageForStaff(
    admin,
    scope.tenantId,
    DEFAULT_PLATFORM_LOCALE,
  );
  if (!state) {
    return {
      ok: false,
      error: "Homepage row missing after initialise — try again.",
    };
  }

  // Bake the design into a self-contained, insert-ready freeform tree.
  const builderTree = bakePageDesignTree(design.tree, design.dataSources);

  const composition = await saveHomepageDraftComposition(admin, {
    tenantId: scope.tenantId,
    values: {
      tenantId: scope.tenantId,
      locale: DEFAULT_PLATFORM_LOCALE,
      expectedVersion: state.page.version,
      metadata: {
        title: state.page.title ?? "Homepage",
        metaDescription: state.page.meta_description ?? undefined,
        introTagline: undefined,
      },
      // Pure freeform: the design IS the page. No curated section slots.
      slots: {},
      builderTree,
    },
    actorProfileId: auth.user.id,
    // First-party curated starter layout — the free on-ramp. Exempt from the
    // Free-plan nested-builder draft guard (same as the curated section recipes);
    // the design is validated against the fixed getPageDesign registry above.
    seedCuratedDesign: true,
  });
  if (!composition.ok) {
    return {
      ok: false,
      error: composition.message ?? "Could not apply the design — try again.",
      code: composition.code,
    };
  }

  return { ok: true, designId: design.id };
}

/** Apply a curated page design to any cms_page (not just homepage). */
export async function applyPageDesignToPage(
  pageId: string,
  designId: string,
  expectedVersion: number,
): Promise<ApplyPageDesignState> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return { ok: false, error: "Select an agency workspace first." };
  }
  const design = getPageDesign(designId);
  if (!design) {
    return { ok: false, error: `Unknown design "${designId}".` };
  }
  const admin = createServiceRoleClient();
  if (!admin) {
    return { ok: false, error: "Server is missing service-role credentials." };
  }
  const { data: pageRow } = await admin
    .from("cms_pages")
    .select("id, title, meta_description, version")
    .eq("id", pageId)
    .eq("tenant_id", scope.tenantId)
    .maybeSingle();
  if (!pageRow) return { ok: false, error: "Page not found." };

  const builderTree = bakePageDesignTree(design.tree, design.dataSources);
  const save = await saveHomepageCompositionAction({
    locale: DEFAULT_PLATFORM_LOCALE,
    pageId,
    expectedVersion,
    metadata: {
      title: pageRow.title ?? "Untitled page",
      metaDescription: pageRow.meta_description,
    },
    slots: {},
    builderTree,
  });
  if (!save.ok) {
    return { ok: false, error: save.error, code: save.code };
  }
  return { ok: true, designId: design.id };
}
