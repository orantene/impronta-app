import "server-only";

/**
 * Materialize live pending_design into draft columns before publish (W67 / W70).
 * Never touches shell_published / design_tokens (live) — publishSiteTheme does that.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { isTalentMaisonThemeEnabled } from "@/lib/access/talent-maison-theme";
import { MAISON_BUILTIN_DEMO } from "@/lib/talent-site/theme-catalog/maison/builtins";
import {
  maisonCustomLookTokens,
  parseMaisonCustomPaletteStored,
} from "@/lib/talent-site/theme-catalog/maison/maison-custom-palette";
import { mergeLookIntoTokens } from "@/lib/talent-site/theme-catalog/look-layer";
import { isMaisonLivePending } from "./maison-pending-design";
import { coerceTokenMap } from "./theme-apply-core";
import { loadMaisonCatalogRow } from "./maison-catalog-row";
import { applyDesign, applyLook } from "./theme-apply-core";
import { restoreMaisonDraftSnapshot } from "./maison-design-snapshot";
import { evaluateMaisonPublishReadiness } from "./maison-publish-readiness";

export type MaisonPublishPreSite = {
  id: string;
  site_slug: string | null;
  shell_tree: unknown;
  theme_design_slug: string | null;
  pending_design: unknown;
};

/**
 * W67 + W76 — materialize live pending into draft, then readiness gate.
 * Flag-off → returns `pre` unchanged (production path).
 */
export async function prepareMaisonSiteForPublish(
  sb: SupabaseClient,
  input: {
    talentProfileId: string;
    userId: string | null;
    displayName: string;
    pre: MaisonPublishPreSite;
  },
): Promise<
  | { ok: true; pre: MaisonPublishPreSite }
  | {
      ok: false;
      code: "server_error" | "readiness_blocked";
      error: string;
      blockers?: Array<{ id: string; message: string; fixLabel: string; fixHref: string }>;
    }
> {
  let pre = input.pre;
  if (isTalentMaisonThemeEnabled() && isMaisonLivePending(pre.pending_design)) {
    const admin = createServiceRoleClient();
    if (!admin) {
      return { ok: false, code: "server_error", error: "Not configured." };
    }
    const materialized = await materializeMaisonLivePendingIfAny(admin, {
      talentProfileId: input.talentProfileId,
      siteId: pre.id,
      userId: input.userId,
      displayName: input.displayName,
      pendingDesign: pre.pending_design,
    });
    if (!materialized.ok) {
      return { ok: false, code: "server_error", error: materialized.error };
    }
    const { data: refreshed, error: refreshErr } = await sb
      .from("talent_sites")
      .select("id, site_slug, shell_tree, theme_design_slug, pending_design")
      .eq("talent_profile_id", input.talentProfileId)
      .maybeSingle();
    if (refreshErr || !refreshed) {
      logServerError("maison.pending.refreshBeforePublish", refreshErr);
      return { ok: false, code: "server_error", error: "Could not read your site." };
    }
    pre = refreshed as MaisonPublishPreSite;
  }

  if (isTalentMaisonThemeEnabled()) {
    const readiness = evaluateMaisonPublishReadiness({
      siteSlug: pre.site_slug,
      themeDesignSlug: pre.theme_design_slug,
    });
    if (!readiness.ready) {
      return {
        ok: false,
        code: "readiness_blocked",
        error: readiness.blockers[0]?.message ?? "Fix the items below before publishing.",
        blockers: readiness.blockers,
      };
    }
  }
  return { ok: true, pre };
}

export async function materializeMaisonLivePendingIfAny(
  admin: SupabaseClient,
  input: {
    talentProfileId: string;
    siteId: string;
    userId: string | null;
    displayName: string;
    pendingDesign: unknown;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isMaisonLivePending(input.pendingDesign)) {
    return { ok: true };
  }
  const pending = input.pendingDesign;
  const proposed = pending.proposed;

  if (proposed.draftSnapshot) {
    const restored = await restoreMaisonDraftSnapshot(admin, {
      talentProfileId: input.talentProfileId,
      siteId: input.siteId,
      snapshot: proposed.draftSnapshot,
      userId: input.userId,
    });
    if (!restored.ok) return restored;
    // restore clears pending_design — re-set cleared by publish; ok to leave null
    return { ok: true };
  }

  const design = await loadMaisonCatalogRow(admin, "design", proposed.designSlug || "maison");
  if (!design) {
    return { ok: false, error: "Maison design not found." };
  }

  // Reapply layout / live_change may need design trees on draft.
  if (
    pending.source === "reapply_layout" ||
    pending.source === "live_change" ||
    pending.source === "restore"
  ) {
    const designRes = await applyDesign(admin, {
      talentProfileId: input.talentProfileId,
      siteId: input.siteId,
      design,
      displayName: input.displayName,
      userId: input.userId,
    });
    if (!designRes.ok) {
      return { ok: false, error: designRes.error };
    }
  }

  const custom = proposed.customPalette
    ? parseMaisonCustomPaletteStored(proposed.customPalette)
    : null;

  if (custom) {
    const { data: draftRow, error: draftErr } = await admin
      .from("talent_sites")
      .select("design_tokens_draft")
      .eq("id", input.siteId)
      .maybeSingle();
    if (draftErr) {
      logServerError("maison.pending.custom.read", draftErr);
      return { ok: false, error: "Could not apply custom colors." };
    }
    const draftTokens = mergeLookIntoTokens(
      coerceTokenMap(
        (draftRow as { design_tokens_draft?: unknown } | null)?.design_tokens_draft,
      ),
      maisonCustomLookTokens(custom),
    );
    const now = new Date().toISOString();
    const { error } = await admin
      .from("talent_sites")
      .update({
        design_tokens_draft: draftTokens,
        theme_look_slug: null,
        custom_palette: custom,
        menu_style: proposed.menuStyle ?? MAISON_BUILTIN_DEMO.buildPayload().menu_style ?? "tabs",
        theme_demo_slug: proposed.demoSlug,
        draft_updated_at: now,
        updated_at: now,
        ...(input.userId ? { updated_by: input.userId } : {}),
      })
      .eq("id", input.siteId);
    if (error) {
      logServerError("maison.pending.custom.write", error);
      return { ok: false, error: "Could not apply custom colors." };
    }
    return { ok: true };
  }

  if (proposed.lookSlug) {
    const look = await loadMaisonCatalogRow(admin, "look", proposed.lookSlug);
    if (!look) return { ok: false, error: "Maison palette not found." };
    const lookRes = await applyLook(admin, {
      siteId: input.siteId,
      look,
      userId: input.userId,
    });
    if (!lookRes.ok) return { ok: false, error: lookRes.error };
    const now = new Date().toISOString();
    const { error } = await admin
      .from("talent_sites")
      .update({
        custom_palette: null,
        menu_style: proposed.menuStyle ?? MAISON_BUILTIN_DEMO.buildPayload().menu_style ?? "tabs",
        theme_demo_slug: proposed.demoSlug,
        draft_updated_at: now,
        updated_at: now,
        ...(input.userId ? { updated_by: input.userId } : {}),
      })
      .eq("id", input.siteId);
    if (error) {
      logServerError("maison.pending.look.meta", error);
    }
  }

  return { ok: true };
}
