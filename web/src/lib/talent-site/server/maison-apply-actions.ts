"use server";

/**
 * Maison Use this design + Undo (W35–W36, W67–W68). Behind TALENT_MAISON_THEME_ENABLED.
 * Never-published path: writes shell/home/tokens_draft + stores previous in
 * pending_design for Undo. Live sites write ONLY `pending_design` (colors_only).
 */

import { isTalentMaisonThemeEnabled } from "@/lib/access/talent-maison-theme";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { MaisonPaletteKey } from "@/lib/talent-site/theme-catalog/maison/seed";
import { MAISON_DEFAULT_PALETTE_KEY, MAISON_PALETTE_ORDER } from "@/lib/talent-site/theme-catalog/maison/seed";
import { MAISON_BUILTIN_DEMO } from "@/lib/talent-site/theme-catalog/maison/builtins";
import type { MaisonPreviewContentMode } from "@/lib/talent-site/theme-catalog/maison/preview-hydration";
import {
  buildMaisonCustomPalette,
  isCompleteCustomFields,
  maisonCustomLookTokens,
  parseMaisonCustomPaletteStored,
  type MaisonCustomPaletteStored,
} from "@/lib/talent-site/theme-catalog/maison/maison-custom-palette";
import { mergeLookIntoTokens } from "@/lib/talent-site/theme-catalog/look-layer";
import { provisionTalentMaxSite } from "./provision-max-site";
import { gate } from "./site-action-gate";
import type { ThemeActionResult } from "./theme-action-types";
import { applyDesign, applyLook, coerceTokenMap } from "./theme-apply-core";
import { loadMaisonCatalogRow } from "./maison-catalog-row";
import {
  captureMaisonDraftSnapshot,
  isMaisonPendingUndo,
  restoreMaisonDraftSnapshot,
  type MaisonPendingUndo,
} from "./maison-design-snapshot";
import {
  isMaisonLivePending,
  type MaisonLivePending,
} from "./maison-pending-design";

function isMaisonPaletteKey(value: string): value is MaisonPaletteKey {
  return (MAISON_PALETTE_ORDER as readonly string[]).includes(value);
}

const DESIGN_SLUG = "maison";

export type MaisonApplyResult = {
  designSlug: string;
  lookSlug: string | null;
  paletteKey: MaisonPaletteKey | null;
  contentMode: MaisonPreviewContentMode;
  customPalette: MaisonCustomPaletteStored | null;
  /** Set when the site is already live — only pending_design was written (W67). */
  livePending?: boolean;
  /** Journey 4: Use this design on a live site → one Publish new colors step (W68). */
  colorsOnly?: boolean;
};

export async function applyMaisonDesignAction(input: {
  paletteKey: string;
  contentMode?: string;
  customPalette?: MaisonCustomPaletteStored | null;
}): Promise<ThemeActionResult<MaisonApplyResult>> {
  if (!isTalentMaisonThemeEnabled()) {
    return { ok: false, code: "feature_disabled", error: "Maison is not available yet." };
  }
  const g = await gate("personalSiteEdit");
  if (!g.ok) return g;

  const contentMode: MaisonPreviewContentMode =
    input?.contentMode === "mine" ? "mine" : "demo";

  const customParsed = input?.customPalette
    ? parseMaisonCustomPaletteStored(input.customPalette) ??
      (isCompleteCustomFields(input.customPalette.fields)
        ? buildMaisonCustomPalette(
            input.customPalette.fields,
            input.customPalette.name,
          )
        : null)
    : null;
  const useCustom = customParsed !== null;

  let paletteKey: MaisonPaletteKey | null = null;
  let lookSlug: string | null = null;
  if (!useCustom) {
    if (!isMaisonPaletteKey(input?.paletteKey ?? "")) {
      return { ok: false, code: "invalid_input", error: "Unknown palette." };
    }
    paletteKey = input.paletteKey as MaisonPaletteKey;
    lookSlug = `maison-${paletteKey}`;
  } else {
    // Keep a named fallback for resume; tokens come from custom_palette.
    paletteKey = isMaisonPaletteKey(input?.paletteKey ?? "")
      ? (input.paletteKey as MaisonPaletteKey)
      : MAISON_DEFAULT_PALETTE_KEY;
  }

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, code: "server_error", error: "Not configured." };

  const provisioned = await provisionTalentMaxSite(g.talentProfileId, g.userId);
  if (!provisioned.ok) {
    return { ok: false, code: "server_error", error: provisioned.error };
  }
  const siteId = provisioned.siteId;

  const { data: liveRow, error: liveErr } = await admin
    .from("talent_sites")
    .select(
      "site_published_at, theme_look_slug, custom_palette, design_tokens_draft, menu_style, theme_design_slug, theme_demo_slug",
    )
    .eq("id", siteId)
    .maybeSingle();
  if (liveErr) {
    logServerError("maison.apply.readLive", liveErr);
    return { ok: false, code: "server_error", error: "Could not read your site." };
  }
  const liveSite = liveRow as Record<string, unknown> | null;
  if (liveSite?.site_published_at) {
    // W67/W68 — live: write ONLY pending_design (colors_only). Publish materializes.
    const demoPayload = MAISON_BUILTIN_DEMO.buildPayload();
    const pending: MaisonLivePending = {
      kind: "live_pending",
      source: "colors_only",
      created_at: new Date().toISOString(),
      proposed: {
        designSlug: DESIGN_SLUG,
        lookSlug: useCustom ? null : lookSlug,
        paletteKey: useCustom ? null : paletteKey,
        contentMode,
        demoSlug: MAISON_BUILTIN_DEMO.slug,
        customPalette: useCustom ? customParsed : null,
        menuStyle: demoPayload.menu_style ?? "tabs",
      },
      liveBaseline: {
        theme_look_slug:
          typeof liveSite.theme_look_slug === "string" ? liveSite.theme_look_slug : null,
        custom_palette: liveSite.custom_palette ?? null,
        design_tokens_draft: liveSite.design_tokens_draft ?? {},
        menu_style: typeof liveSite.menu_style === "string" ? liveSite.menu_style : null,
        theme_design_slug:
          typeof liveSite.theme_design_slug === "string" ? liveSite.theme_design_slug : null,
      },
    };
    const nowLive = new Date().toISOString();
    const { error: pendingErr } = await admin
      .from("talent_sites")
      .update({
        pending_design: pending,
        draft_updated_at: nowLive,
        updated_at: nowLive,
        updated_by: g.userId,
      })
      .eq("id", siteId)
      .eq("talent_profile_id", g.talentProfileId);
    if (pendingErr) {
      logServerError("maison.apply.livePending", pendingErr);
      return { ok: false, code: "server_error", error: "Could not save the color change." };
    }
    return {
      ok: true,
      data: {
        designSlug: DESIGN_SLUG,
        lookSlug: useCustom ? null : lookSlug,
        paletteKey: useCustom ? null : paletteKey,
        contentMode,
        customPalette: useCustom ? customParsed : null,
        livePending: true,
        colorsOnly: true,
      },
    };
  }

  const design = await loadMaisonCatalogRow(admin, "design", DESIGN_SLUG);
  if (!design) {
    return { ok: false, code: "theme_not_found", error: "Maison design not found." };
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

  if (useCustom && customParsed) {
    const { data: draftRow, error: draftErr } = await admin
      .from("talent_sites")
      .select("design_tokens_draft")
      .eq("id", siteId)
      .maybeSingle();
    if (draftErr) {
      logServerError("maison.apply.custom.read", draftErr);
      return { ok: false, code: "server_error", error: "Could not apply custom colors." };
    }
    const draftTokens = mergeLookIntoTokens(
      coerceTokenMap(
        (draftRow as { design_tokens_draft?: unknown } | null)?.design_tokens_draft,
      ),
      maisonCustomLookTokens(customParsed),
    );
    const nowTokens = new Date().toISOString();
    const { error: customErr } = await admin
      .from("talent_sites")
      .update({
        design_tokens_draft: draftTokens,
        theme_look_slug: null,
        custom_palette: customParsed,
        draft_updated_at: nowTokens,
        updated_at: nowTokens,
        updated_by: g.userId,
      })
      .eq("id", siteId);
    if (customErr) {
      logServerError("maison.apply.custom.write", customErr);
      return { ok: false, code: "server_error", error: "Could not apply custom colors." };
    }
  } else {
    const look = await loadMaisonCatalogRow(admin, "look", lookSlug!);
    if (!look) {
      return { ok: false, code: "theme_not_found", error: "Maison palette not found." };
    }
    const lookRes = await applyLook(admin, { siteId, look, userId: g.userId });
    if (!lookRes.ok) return lookRes;
    // Clear prior custom palette when applying a named look.
    const { error: clearErr } = await admin
      .from("talent_sites")
      .update({ custom_palette: null })
      .eq("id", siteId);
    if (clearErr) {
      logServerError("maison.apply.clearCustom", clearErr);
    }
  }

  const demoPayload = MAISON_BUILTIN_DEMO.buildPayload();
  const pending: MaisonPendingUndo = {
    previous: captured.snapshot,
    source: "apply",
    created_at: new Date().toISOString(),
    applied: {
      designSlug: DESIGN_SLUG,
      lookSlug: useCustom ? null : lookSlug,
      paletteKey: useCustom ? null : paletteKey,
      contentMode,
      demoSlug: MAISON_BUILTIN_DEMO.slug,
      customPalette: useCustom ? customParsed : null,
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
    data: {
      designSlug: DESIGN_SLUG,
      lookSlug: useCustom ? null : lookSlug,
      paletteKey: useCustom ? null : paletteKey,
      contentMode,
      customPalette: useCustom ? customParsed : null,
    },
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
  const pending = (site as { pending_design?: unknown }).pending_design;
  const siteId = (site as { id: string }).id;

  // W70 — Undo after restore / reset / reapply on a live site.
  if (
    (site as { site_published_at?: string | null }).site_published_at &&
    isMaisonLivePending(pending) &&
    pending.undoDraft
  ) {
    const restoredLive = await restoreMaisonDraftSnapshot(admin, {
      talentProfileId: g.talentProfileId,
      siteId,
      snapshot: pending.undoDraft,
      userId: g.userId,
      clearPending: true,
    });
    if (!restoredLive.ok) {
      return { ok: false, code: "server_error", error: restoredLive.error };
    }
    return { ok: true, data: { restored: true } };
  }

  if ((site as { site_published_at?: string | null }).site_published_at) {
    return {
      ok: false,
      code: "invalid_input",
      error: "Use Discard in Design options to drop unpublished live changes.",
    };
  }
  if (!isMaisonPendingUndo(pending)) {
    return { ok: false, code: "invalid_input", error: "Nothing to undo." };
  }

  const restored = await restoreMaisonDraftSnapshot(admin, {
    talentProfileId: g.talentProfileId,
    siteId,
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
