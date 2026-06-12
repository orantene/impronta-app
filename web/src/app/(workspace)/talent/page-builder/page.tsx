/**
 * Talent freeform Page Builder — Max-tier-gated editor entry.
 *
 * Route: `/talent/page-builder` (app host). Resolves the signed-in talent's own
 * `talent_profiles.id`, plan key / tier, and managing agency `tenantId`
 * server-side, then mounts the ONE Page Builder Core (`TalentMaxBuilderMount`)
 * which persists to `talent_pages.blocks` via the talent-page adapter.
 *
 * Gating (§E): ONLY talents on the Max tier (`talent_plan_key='talent_portfolio'`)
 * may reach the editor. A non-Max talent gets an upsell notice (not a 404 — they
 * should learn the feature exists + how to unlock it). An anonymous / non-talent
 * user is redirected to login by the talent layout's session guard.
 *
 * The talent layout (`(workspace)/talent/layout.tsx`) renders this route bare
 * (no dashboard shell) so the editor owns the full viewport.
 */

import { redirect } from "next/navigation";

import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadTalentSelfProfileByUser } from "@/app/(workspace)/[tenantSlug]/_data-bridge/talent";
import { getActiveTalentAgencyContext } from "@/lib/talent/active-agency-context";
import { getRequestLocale } from "@/i18n/request-locale";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { buildInEditorCanvasRenderData } from "@/lib/site-admin/builder-core/in-editor-canvas-render-data";
import { loadPlatformDefaultTheme } from "@/lib/platform/default-theme";
import { readTalentDesignSlice } from "@/lib/site-admin/edit-mode/talent-design-store";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node";
import { TalentPageBuilderScreen } from "@/components/talent/site/TalentPageBuilderScreen";

export const dynamic = "force-dynamic";

/** The talent_pages slug this editor manages. One freeform page per talent for now. */
const TALENT_PAGE_SLUG = "home";

export default async function TalentPageBuilderRoute() {
  const session = await getCachedActorSession();
  // The talent layout already redirects unauthenticated users; this is a
  // defensive backstop so the page never renders without a user.
  if (!session.supabase || !session.user) {
    redirect("/login?next=/talent/page-builder");
  }

  const profile = await loadTalentSelfProfileByUser(session.user.id);
  // No talent profile for this user → send them home rather than 500.
  if (!profile) {
    redirect("/talent/today");
  }

  const locale = await getRequestLocale();

  // Resolve the managing agency tenant for builder scope + the in-editor
  // section-embed preview. Prefer the active agency context (the scope the
  // dashboard uses); fall back to the profile's owning agency
  // (`created_by_agency_id`) so the editor's section-embed preview matches the
  // PUBLISHED renderer, which scopes embeds to that same tenant.
  const activeAgency = await getActiveTalentAgencyContext(profile.id);
  let tenantId = activeAgency?.tenantId ?? null;
  if (!tenantId) {
    const admin = createServiceRoleClient();
    if (admin) {
      const { data } = await admin
        .from("talent_profiles")
        .select("created_by_agency_id")
        .eq("id", profile.id)
        .maybeSingle();
      tenantId =
        (data as { created_by_agency_id: string | null } | null)
          ?.created_by_agency_id ?? null;
    }
  }

  // Prime the in-editor canvas: assemble data sources + section_embed islands +
  // component-style defaults for the talent's CURRENT draft blocks, scoped to
  // the talent preview subject. The editor's adapter loads/republishes the
  // canonical draft client-side (which repaints the canvas via the bridge); this
  // server-built render data makes the FIRST paint correct (data-bound +
  // section_embed nodes) instead of empty. Best-effort — on any failure the
  // canvas mounts against empty inputs and still paints live inserts.
  let canvasRenderData = null;
  if (tenantId) {
    try {
      const admin = createServiceRoleClient();
      let draftTree: BuilderNodeTree = [];
      let talentComponentStyleDefaults = null;
      let talentDesignTokens: Record<string, string> | null = null;
      if (admin) {
        const { data: pageRow } = await admin
          .from("talent_pages")
          .select("blocks, theme")
          .eq("talent_profile_id", profile.id)
          .eq("slug", TALENT_PAGE_SLUG)
          .maybeSingle();
        const row = pageRow as { blocks: BuilderNodeTree | null; theme: unknown } | null;
        draftTree = (row?.blocks ?? []) as BuilderNodeTree;
        // First paint uses the talent's PUBLISHED theme (component-style defaults
        // + design tokens) so the canvas reflects the talent's theme, not the host
        // tenant's. The Theme drawer previews the DRAFT live on top of this.
        const slice = readTalentDesignSlice(row?.theme);
        // A talent with NO theme of their own inherits the PLATFORM DEFAULT
        // (Modern 2026) — NOT the host tenant's (e.g. Impronta's black/gold)
        // component styles, which would render white-on-white buttons on the
        // new light canvas. Operator overrides (a non-empty slice) win.
        const platformDefault = await loadPlatformDefaultTheme();
        talentComponentStyleDefaults =
          Object.keys(slice.componentStyles).length > 0
            ? slice.componentStyles
            : platformDefault.componentStyles;
        talentDesignTokens =
          Object.keys(slice.tokens).length > 0
            ? slice.tokens
            : platformDefault.tokens;
      }
      canvasRenderData = await buildInEditorCanvasRenderData({
        tree: draftTree,
        tenantId,
        locale,
        previewSubject: { kind: "talent", id: profile.id },
        componentStyleDefaultsOverride: talentComponentStyleDefaults,
        designTokens: talentDesignTokens,
      });
    } catch {
      canvasRenderData = null;
    }
  }

  return (
    <TalentPageBuilderScreen
      talentProfileId={profile.id}
      pageSlug={TALENT_PAGE_SLUG}
      tenantId={tenantId ?? ""}
      talentPlanKey={profile.talentPlanKey}
      talentTier={profile.talentTier}
      talentDisplayName={profile.displayName}
      locale={locale}
      canvasRenderData={canvasRenderData}
    />
  );
}
