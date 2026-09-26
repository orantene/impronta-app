"use server";

/**
 * Maison Use this design + Undo (W35–W36). Behind TALENT_MAISON_THEME_ENABLED.
 * Never-published path: writes shell/home/tokens_draft + stores previous in
 * pending_design for Undo. Live sites refuse (pending_design apply = PR8).
 */

import { isTalentMaisonThemeEnabled } from "@/lib/access/talent-maison-theme";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { MaisonPaletteKey } from "@/lib/talent-site/theme-catalog/maison/seed";
import { MAISON_PALETTE_ORDER } from "@/lib/talent-site/theme-catalog/maison/seed";
import { MAISON_BUILTIN_DEMO } from "@/lib/talent-site/theme-catalog/maison/builtins";
import type { MaisonPreviewContentMode } from "@/lib/talent-site/theme-catalog/maison/preview-hydration";

function isMaisonPaletteKey(value: string): value is MaisonPaletteKey {
  return (MAISON_PALETTE_ORDER as readonly string[]).includes(value);
}
import { provisionTalentMaxSite } from "./provision-max-site";
import { gate } from "./site-action-gate";
import type { ThemeActionResult } from "./theme-action-types";
import { applyDesign, applyLook } from "./theme-apply-core";
import { loadMaisonCatalogRow } from "./maison-catalog-row";
import {
  captureMaisonDraftSnapshot,
  isMaisonPendingUndo,
  restoreMaisonDraftSnapshot,
  type MaisonPendingUndo,
} from "./maison-design-snapshot";

const DESIGN_SLUG = "maison";

export type MaisonApplyResult = {
  designSlug: string;
  lookSlug: string;
  paletteKey: MaisonPaletteKey;
  contentMode: MaisonPreviewContentMode;
};

export async function applyMaisonDesignAction(input: {
  paletteKey: string;
  contentMode?: string;
}): Promise<ThemeActionResult<MaisonApplyResult>> {
  if (!isTalentMaisonThemeEnabled()) {
    return { ok: false, code: "feature_disabled", error: "Maison is not available yet." };
  }
  const g = await gate("personalSiteEdit");
  if (!g.ok) return g;
  if (!isMaisonPaletteKey(input?.paletteKey ?? "")) {
    return { ok: false, code: "invalid_input", error: "Unknown palette." };
  }
  const paletteKey = input.paletteKey as MaisonPaletteKey;
  const contentMode: MaisonPreviewContentMode =
    input?.contentMode === "mine" ? "mine" : "demo";
  const lookSlug = `maison-${paletteKey}`;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, code: "server_error", error: "Not configured." };

  const provisioned = await provisionTalentMaxSite(g.talentProfileId, g.userId);
  if (!provisioned.ok) {
    return { ok: false, code: "server_error", error: provisioned.error };
  }
  const siteId = provisioned.siteId;

  const { data: liveRow, error: liveErr } = await admin
    .from("talent_sites")
    .select("site_published_at")
    .eq("id", siteId)
    .maybeSingle();
  if (liveErr) {
    logServerError("maison.apply.readLive", liveErr);
    return { ok: false, code: "server_error", error: "Could not read your site." };
  }
  if ((liveRow as { site_published_at?: string | null } | null)?.site_published_at) {
    return {
      ok: false,
      code: "invalid_input",
      error: "Changing a live design lands in a later step. Your live site is unchanged.",
    };
  }

  const design = await loadMaisonCatalogRow(admin, "design", DESIGN_SLUG);
  if (!design) {
    return { ok: false, code: "theme_not_found", error: "Maison design not found." };
  }
  const look = await loadMaisonCatalogRow(admin, "look", lookSlug);
  if (!look) {
    return { ok: false, code: "theme_not_found", error: "Maison palette not found." };
  }

  const captured = await captureMaisonDraftSnapshot(admin, {
    talentProfileId: g.talentProfileId,
    siteId,
  });
  if (!captured.ok) {
    return { ok: false, code: "server_error", error: captured.error };
  }

  const designRes = await applyDesign(admin, {
    talentProfileId: g.talentProfileId,
    siteId,
    design,
    displayName: g.displayName,
    userId: g.userId,
  });
  if (!designRes.ok) return designRes;

  const lookRes = await applyLook(admin, { siteId, look, userId: g.userId });
  if (!lookRes.ok) return lookRes;

  const demoPayload = MAISON_BUILTIN_DEMO.buildPayload();
  const pending: MaisonPendingUndo = {
    previous: captured.snapshot,
    source: "apply",
    created_at: new Date().toISOString(),
    applied: {
      designSlug: DESIGN_SLUG,
      lookSlug,
      paletteKey,
      contentMode,
      demoSlug: MAISON_BUILTIN_DEMO.slug,
    },
  };
  const now = new Date().toISOString();
  const { error: metaErr } = await admin
    .from("talent_sites")
    .update({
      theme_demo_slug: MAISON_BUILTIN_DEMO.slug,
      menu_style: demoPayload.menu_style ?? "tabs",
      pending_design: pending,
      draft_updated_at: now,
      updated_at: now,
      updated_by: g.userId,
    })
    .eq("id", siteId)
    .eq("talent_profile_id", g.talentProfileId);
  if (metaErr) {
    logServerError("maison.apply.meta", metaErr);
    return { ok: false, code: "server_error", error: "Design applied, but Undo could not be saved." };
  }

  return {
    ok: true,
    data: { designSlug: DESIGN_SLUG, lookSlug, paletteKey, contentMode },
  };
}

export async function undoMaisonDesignAction(): Promise<
  ThemeActionResult<{ restored: true }>
> {
  if (!isTalentMaisonThemeEnabled()) {
    return { ok: false, code: "feature_disabled", error: "Maison is not available yet." };
  }
  const g = await gate("personalSiteEdit");
  if (!g.ok) return g;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, code: "server_error", error: "Not configured." };

  const { data: site, error } = await admin
    .from("talent_sites")
    .select("id, pending_design, site_published_at")
    .eq("talent_profile_id", g.talentProfileId)
    .maybeSingle();
  if (error) {
    logServerError("maison.undo.read", error);
    return { ok: false, code: "server_error", error: "Could not undo." };
  }
  if (!site) return { ok: false, code: "site_not_found", error: "Site not found." };
  if ((site as { site_published_at?: string | null }).site_published_at) {
    return {
      ok: false,
      code: "invalid_input",
      error: "Undo for a live site lands in a later step.",
    };
  }
  const pending = (site as { pending_design?: unknown }).pending_design;
  if (!isMaisonPendingUndo(pending)) {
    return { ok: false, code: "invalid_input", error: "Nothing to undo." };
  }

  const restored = await restoreMaisonDraftSnapshot(admin, {
    talentProfileId: g.talentProfileId,
    siteId: (site as { id: string }).id,
    snapshot: pending.previous,
    userId: g.userId,
  });
  if (!restored.ok) {
    return { ok: false, code: "server_error", error: restored.error };
  }
  return { ok: true, data: { restored: true } };
}

export async function loadMaisonApplyUndoStateAction(): Promise<
  ThemeActionResult<{ canUndo: boolean; appliedAt: string | null }>
> {
  if (!isTalentMaisonThemeEnabled()) {
    return { ok: false, code: "feature_disabled", error: "Maison is not available yet." };
  }
  const g = await gate("personalSiteEdit");
  if (!g.ok) return g;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, code: "server_error", error: "Not configured." };
  const { data, error } = await admin
    .from("talent_sites")
    .select("pending_design")
    .eq("talent_profile_id", g.talentProfileId)
    .maybeSingle();
  if (error) {
    logServerError("maison.undoState", error);
    return { ok: false, code: "server_error", error: "Could not load Undo state." };
  }
  const pending = (data as { pending_design?: unknown } | null)?.pending_design;
  if (!isMaisonPendingUndo(pending)) {
    return { ok: true, data: { canUndo: false, appliedAt: null } };
  }
  return { ok: true, data: { canUndo: true, appliedAt: pending.created_at } };
}
