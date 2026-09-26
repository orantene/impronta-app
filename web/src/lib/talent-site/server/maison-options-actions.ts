"use server";

/**
 * Maison Design options + live recover (W69–W70, W73–W74).
 * Reset / reapply / discard / restore. Behind TALENT_MAISON_THEME_ENABLED.
 */

import { isTalentMaisonThemeEnabled } from "@/lib/access/talent-maison-theme";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  MAISON_DEFAULT_PALETTE_KEY,
  type MaisonPaletteKey,
} from "@/lib/talent-site/theme-catalog/maison/seed";
import { MAISON_BUILTIN_DEMO } from "@/lib/talent-site/theme-catalog/maison/builtins";
import { parseMaisonCustomPaletteStored } from "@/lib/talent-site/theme-catalog/maison/maison-custom-palette";
import { gate } from "./site-action-gate";
import type { ThemeActionResult } from "./theme-action-types";
import { applyDesign, applyLook } from "./theme-apply-core";
import { loadMaisonCatalogRow } from "./maison-catalog-row";
import {
  captureMaisonDraftSnapshot,
  restoreMaisonDraftSnapshot,
  type MaisonDraftSnapshot,
  type MaisonPendingUndo,
} from "./maison-design-snapshot";
import {
  hasMaisonLivePending,
  isMaisonLivePending,
  type MaisonLiveBaseline,
  type MaisonLivePending,
  type MaisonLivePendingSource,
} from "./maison-pending-design";
import { materializeMaisonLivePendingIfAny } from "./maison-pending-apply";
import {
  isMaisonDesignRevisionSnapshot,
  type MaisonDesignRevisionSnapshot,
} from "./maison-design-revision";
import { provisionTalentMaxSite } from "./provision-max-site";

const DESIGN_SLUG = "maison";

function lookSlugToPalette(look: string | null): MaisonPaletteKey | null {
  if (!look?.startsWith("maison-")) return null;
  const key = look.slice("maison-".length);
  if (key === "pink" || key === "pearl" || key === "lilac" || key === "sand" || key === "peach") {
    return key;
  }
  return null;
}

function revisionToDraftSnapshot(
  rev: MaisonDesignRevisionSnapshot,
): MaisonDraftSnapshot {
  return {
    shell_tree: rev.shell_published ?? [],
    home_blocks: rev.home_blocks ?? [],
    design_tokens_draft: rev.design_tokens ?? {},
    theme_design_slug: rev.design_slug,
    theme_design_version: null,
    theme_look_slug: rev.look_slug,
    theme_demo_slug: rev.demo_slug,
    menu_style: rev.menu_style,
    custom_palette: rev.custom_palette ?? null,
  };
}

async function readLiveBaseline(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  siteId: string,
): Promise<
  | { ok: true; baseline: MaisonLiveBaseline; demoSlug: string | null }
  | { ok: false; error: string }
> {
  const { data, error } = await admin
    .from("talent_sites")
    .select(
      "theme_look_slug, custom_palette, design_tokens_draft, menu_style, theme_design_slug, theme_demo_slug",
    )
    .eq("id", siteId)
    .maybeSingle();
  if (error) {
    logServerError("maison.options.baseline", error);
    return { ok: false, error: "Could not read your site." };
  }
  if (!data) return { ok: false, error: "Site not found." };
  const s = data as Record<string, unknown>;
  return {
    ok: true,
    baseline: {
      theme_look_slug: typeof s.theme_look_slug === "string" ? s.theme_look_slug : null,
      custom_palette: s.custom_palette ?? null,
      design_tokens_draft: s.design_tokens_draft ?? {},
      menu_style: typeof s.menu_style === "string" ? s.menu_style : null,
      theme_design_slug: typeof s.theme_design_slug === "string" ? s.theme_design_slug : null,
    },
    demoSlug: typeof s.theme_demo_slug === "string" ? s.theme_demo_slug : null,
  };
}

async function writeLivePending(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  input: {
    siteId: string;
    talentProfileId: string;
    userId: string;
    source: MaisonLivePendingSource;
    proposed: MaisonLivePending["proposed"];
    liveBaseline: MaisonLiveBaseline;
    undoDraft?: MaisonDraftSnapshot | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const pending: MaisonLivePending = {
    kind: "live_pending",
    source: input.source,
    created_at: new Date().toISOString(),
    proposed: input.proposed,
    liveBaseline: input.liveBaseline,
    ...(input.undoDraft ? { undoDraft: input.undoDraft } : {}),
  };
  const now = new Date().toISOString();
  const { error } = await admin
    .from("talent_sites")
    .update({
      pending_design: pending,
      draft_updated_at: now,
      updated_at: now,
      updated_by: input.userId,
    })
    .eq("id", input.siteId)
    .eq("talent_profile_id", input.talentProfileId);
  if (error) {
    logServerError("maison.options.writePending", error);
    return { ok: false, error: "Could not save design options." };
  }
  return { ok: true };
}

export type MaisonDesignOptionsState = {
  hasLivePending: boolean;
  pendingSource: MaisonLivePendingSource | null;
  canDiscard: boolean;
  importBatch: {
    batchId: string;
    createdAt: string;
    draftCount: number;
  } | null;
  revisions: Array<{
    id: string;
    version: number;
    publishedAt: string;
    summary: string;
    isLive: boolean;
  }>;
  sitePublished: boolean;
};

export async function loadMaisonDesignOptionsStateAction(): Promise<
  ThemeActionResult<MaisonDesignOptionsState>
> {
  if (!isTalentMaisonThemeEnabled()) {
    return { ok: false, code: "feature_disabled", error: "Maison is not available yet." };
  }
  const g = await gate("personalSiteEdit");
  if (!g.ok) return g;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, code: "server_error", error: "Not configured." };

  const { data: site, error: siteErr } = await admin
    .from("talent_sites")
    .select("id, pending_design, site_published_at")
    .eq("talent_profile_id", g.talentProfileId)
    .maybeSingle();
  if (siteErr) {
    logServerError("maison.options.loadSite", siteErr);
    return { ok: false, code: "server_error", error: "Could not load design options." };
  }
  if (!site) {
    return {
      ok: true,
      data: {
        hasLivePending: false,
        pendingSource: null,
        canDiscard: false,
        importBatch: null,
        revisions: [],
        sitePublished: false,
      },
    };
  }

  const pending = (site as { pending_design?: unknown }).pending_design;
  const sitePublished = Boolean(
    (site as { site_published_at?: string | null }).site_published_at,
  );
  const livePending = isMaisonLivePending(pending);
  const siteId = (site as { id: string }).id;

  const { data: batch } = await admin
    .from("talent_content_import_batches")
    .select("id, created_at, created_record_ids, status")
    .eq("talent_profile_id", g.talentProfileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let importBatch: MaisonDesignOptionsState["importBatch"] = null;
  if (batch) {
    const b = batch as {
      id: string;
      created_at: string;
      created_record_ids?: { offerings?: string[]; faqs?: string[]; sections?: string[] };
    };
    const ids = b.created_record_ids ?? {};
    const draftCount =
      (ids.offerings?.length ?? 0) + (ids.faqs?.length ?? 0) + (ids.sections?.length ?? 0);
    if (draftCount > 0) {
      importBatch = {
        batchId: b.id,
        createdAt: b.created_at,
        draftCount,
      };
    }
  }

  const { data: revs, error: revErr } = await admin
    .from("talent_site_revisions")
    .select("id, version, created_at, snapshot")
    .eq("talent_site_id", siteId)
    .eq("kind", "published")
    .order("version", { ascending: false })
    .limit(20);
  if (revErr) {
    logServerError("maison.options.revisions", revErr);
  }

  const revisions: MaisonDesignOptionsState["revisions"] = [];
  const rows = (revs ?? []) as Array<{
    id: string;
    version: number;
    created_at: string;
    snapshot: unknown;
  }>;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (!isMaisonDesignRevisionSnapshot(row.snapshot)) continue;
    const snap = row.snapshot;
    const paletteKey = lookSlugToPalette(snap.look_slug);
    const custom = parseMaisonCustomPaletteStored(snap.custom_palette);
    const colorLabel = custom
      ? custom.name.en
      : paletteKey
        ? paletteKey.charAt(0).toUpperCase() + paletteKey.slice(1)
        : "Colors";
    const when = new Date(snap.published_at || row.created_at);
    const whenLabel = Number.isNaN(when.getTime())
      ? row.created_at
      : when.toLocaleString("en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        });
    revisions.push({
      id: row.id,
      version: row.version,
      publishedAt: snap.published_at || row.created_at,
      summary: `Maison · ${colorLabel} · ${whenLabel}`,
      isLive: i === 0,
    });
  }

  return {
    ok: true,
    data: {
      hasLivePending: livePending,
      pendingSource: livePending ? pending.source : null,
      canDiscard: hasMaisonLivePending(pending),
      importBatch,
      revisions,
      sitePublished,
    },
  };
}

/** W73 — Discard unpublished live design changes (never a dead control). */
export async function discardMaisonLivePendingAction(): Promise<
  ThemeActionResult<{ discarded: true }>
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
    .select("id, pending_design")
    .eq("talent_profile_id", g.talentProfileId)
    .maybeSingle();
  if (error) {
    logServerError("maison.options.discard.read", error);
    return { ok: false, code: "server_error", error: "Could not discard." };
  }
  if (!site) return { ok: false, code: "site_not_found", error: "Site not found." };
  const pending = (site as { pending_design?: unknown }).pending_design;
  if (!isMaisonLivePending(pending)) {
    return { ok: false, code: "invalid_input", error: "No unpublished design changes." };
  }

  if (pending.undoDraft) {
    const restored = await restoreMaisonDraftSnapshot(admin, {
      talentProfileId: g.talentProfileId,
      siteId: (site as { id: string }).id,
      snapshot: pending.undoDraft,
      userId: g.userId,
      clearPending: true,
    });
    if (!restored.ok) {
      return { ok: false, code: "server_error", error: restored.error };
    }
    return { ok: true, data: { discarded: true } };
  }

  const now = new Date().toISOString();
  const { error: clearErr } = await admin
    .from("talent_sites")
    .update({
      pending_design: null,
      draft_updated_at: now,
      updated_at: now,
      updated_by: g.userId,
    })
    .eq("id", (site as { id: string }).id);
  if (clearErr) {
    logServerError("maison.options.discard.clear", clearErr);
    return { ok: false, code: "server_error", error: "Could not discard." };
  }
  return { ok: true, data: { discarded: true } };
}

/** W74 — Reset colors to demo Pink & Lipstick. */
export async function resetMaisonColorsAction(): Promise<
  ThemeActionResult<{ mode: "draft" | "live_pending" }>
> {
  if (!isTalentMaisonThemeEnabled()) {
    return { ok: false, code: "feature_disabled", error: "Maison is not available yet." };
  }
  const g = await gate("personalSiteEdit");
  if (!g.ok) return g;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, code: "server_error", error: "Not configured." };

  const provisioned = await provisionTalentMaxSite(g.talentProfileId, g.userId);
  if (!provisioned.ok) {
    return { ok: false, code: "server_error", error: provisioned.error };
  }
  const siteId = provisioned.siteId;

  const { data: liveRow, error: liveErr } = await admin
    .from("talent_sites")
    .select("site_published_at, theme_demo_slug, menu_style")
    .eq("id", siteId)
    .maybeSingle();
  if (liveErr) {
    logServerError("maison.options.reset.read", liveErr);
    return { ok: false, code: "server_error", error: "Could not reset colors." };
  }
  const isLive = Boolean(
    (liveRow as { site_published_at?: string | null } | null)?.site_published_at,
  );
  const lookSlug = `maison-${MAISON_DEFAULT_PALETTE_KEY}`;
  const demoSlug =
    (liveRow as { theme_demo_slug?: string | null } | null)?.theme_demo_slug ??
    MAISON_BUILTIN_DEMO.slug;
  const menuStyle =
    (liveRow as { menu_style?: string | null } | null)?.menu_style ??
    MAISON_BUILTIN_DEMO.buildPayload().menu_style ??
    "tabs";

  if (isLive) {
    const baseline = await readLiveBaseline(admin, siteId);
    if (!baseline.ok) return { ok: false, code: "server_error", error: baseline.error };
    const captured = await captureMaisonDraftSnapshot(admin, {
      talentProfileId: g.talentProfileId,
      siteId,
    });
    if (!captured.ok) {
      return { ok: false, code: "server_error", error: captured.error };
    }
    const proposed = {
      designSlug: DESIGN_SLUG,
      lookSlug,
      paletteKey: MAISON_DEFAULT_PALETTE_KEY as MaisonPaletteKey,
      contentMode: "mine" as const,
      demoSlug: demoSlug ?? MAISON_BUILTIN_DEMO.slug,
      customPalette: null,
      menuStyle,
    };
    const written = await writeLivePending(admin, {
      siteId,
      talentProfileId: g.talentProfileId,
      userId: g.userId,
      source: "reset_colors",
      liveBaseline: baseline.baseline,
      undoDraft: captured.snapshot,
      proposed,
    });
    if (!written.ok) return { ok: false, code: "server_error", error: written.error };
    // Apply to draft now (live unchanged until Publish) — W74.
    const mat = await materializeMaisonLivePendingIfAny(admin, {
      talentProfileId: g.talentProfileId,
      siteId,
      userId: g.userId,
      displayName: g.displayName,
      pendingDesign: {
        kind: "live_pending",
        source: "reset_colors",
        created_at: new Date().toISOString(),
        proposed,
        liveBaseline: baseline.baseline,
        undoDraft: captured.snapshot,
      } satisfies MaisonLivePending,
    });
    if (!mat.ok) return { ok: false, code: "server_error", error: mat.error };
    return { ok: true, data: { mode: "live_pending" } };
  }

  // Never-published: apply pink look to draft + Undo snapshot.
  const captured = await captureMaisonDraftSnapshot(admin, {
    talentProfileId: g.talentProfileId,
    siteId,
  });
  if (!captured.ok) {
    return { ok: false, code: "server_error", error: captured.error };
  }
  const look = await loadMaisonCatalogRow(admin, "look", lookSlug);
  if (!look) return { ok: false, code: "theme_not_found", error: "Maison palette not found." };
  const lookRes = await applyLook(admin, { siteId, look, userId: g.userId });
  if (!lookRes.ok) return lookRes;
  const pending: MaisonPendingUndo = {
    previous: captured.snapshot,
    source: "apply",
    created_at: new Date().toISOString(),
    applied: {
      designSlug: DESIGN_SLUG,
      lookSlug,
      paletteKey: MAISON_DEFAULT_PALETTE_KEY,
      contentMode: "mine",
      demoSlug: MAISON_BUILTIN_DEMO.slug,
      customPalette: null,
    },
  };
  const now = new Date().toISOString();
  const { error: metaErr } = await admin
    .from("talent_sites")
    .update({
      custom_palette: null,
      pending_design: pending,
      draft_updated_at: now,
      updated_at: now,
      updated_by: g.userId,
    })
    .eq("id", siteId);
  if (metaErr) {
    logServerError("maison.options.reset.meta", metaErr);
    return { ok: false, code: "server_error", error: "Colors reset, but Undo could not be saved." };
  }
  return { ok: true, data: { mode: "draft" } };
}

/** W74 — Reapply demo layout (section order + menu style). Content stays. */
export async function reapplyMaisonDemoLayoutAction(): Promise<
  ThemeActionResult<{ mode: "draft" | "live_pending" }>
> {
  if (!isTalentMaisonThemeEnabled()) {
    return { ok: false, code: "feature_disabled", error: "Maison is not available yet." };
  }
  const g = await gate("personalSiteEdit");
  if (!g.ok) return g;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, code: "server_error", error: "Not configured." };

  const provisioned = await provisionTalentMaxSite(g.talentProfileId, g.userId);
  if (!provisioned.ok) {
    return { ok: false, code: "server_error", error: provisioned.error };
  }
  const siteId = provisioned.siteId;

  const { data: siteRow, error: siteErr } = await admin
    .from("talent_sites")
    .select(
      "site_published_at, theme_look_slug, custom_palette, theme_demo_slug, menu_style",
    )
    .eq("id", siteId)
    .maybeSingle();
  if (siteErr) {
    logServerError("maison.options.reapply.read", siteErr);
    return { ok: false, code: "server_error", error: "Could not reapply layout." };
  }
  const s = siteRow as Record<string, unknown> | null;
  const isLive = Boolean(s?.site_published_at);
  const lookSlug =
    typeof s?.theme_look_slug === "string" ? s.theme_look_slug : `maison-${MAISON_DEFAULT_PALETTE_KEY}`;
  const paletteKey = lookSlugToPalette(lookSlug) ?? MAISON_DEFAULT_PALETTE_KEY;
  const custom = parseMaisonCustomPaletteStored(s?.custom_palette);
  const demoPayload = MAISON_BUILTIN_DEMO.buildPayload();
  const menuStyle = demoPayload.menu_style ?? "tabs";

  if (isLive) {
    const baseline = await readLiveBaseline(admin, siteId);
    if (!baseline.ok) return { ok: false, code: "server_error", error: baseline.error };
    const captured = await captureMaisonDraftSnapshot(admin, {
      talentProfileId: g.talentProfileId,
      siteId,
    });
    if (!captured.ok) {
      return { ok: false, code: "server_error", error: captured.error };
    }
    const proposed = {
      designSlug: DESIGN_SLUG,
      lookSlug: custom ? null : lookSlug,
      paletteKey: custom ? null : paletteKey,
      contentMode: "mine" as const,
      demoSlug: MAISON_BUILTIN_DEMO.slug,
      customPalette: custom,
      menuStyle,
    };
    const written = await writeLivePending(admin, {
      siteId,
      talentProfileId: g.talentProfileId,
      userId: g.userId,
      source: "reapply_layout",
      liveBaseline: baseline.baseline,
      undoDraft: captured.snapshot,
      proposed,
    });
    if (!written.ok) return { ok: false, code: "server_error", error: written.error };
    const mat = await materializeMaisonLivePendingIfAny(admin, {
      talentProfileId: g.talentProfileId,
      siteId,
      userId: g.userId,
      displayName: g.displayName,
      pendingDesign: {
        kind: "live_pending",
        source: "reapply_layout",
        created_at: new Date().toISOString(),
        proposed,
        liveBaseline: baseline.baseline,
        undoDraft: captured.snapshot,
      } satisfies MaisonLivePending,
    });
    if (!mat.ok) return { ok: false, code: "server_error", error: mat.error };
    return { ok: true, data: { mode: "live_pending" } };
  }

  const captured = await captureMaisonDraftSnapshot(admin, {
    talentProfileId: g.talentProfileId,
    siteId,
  });
  if (!captured.ok) {
    return { ok: false, code: "server_error", error: captured.error };
  }
  const design = await loadMaisonCatalogRow(admin, "design", DESIGN_SLUG);
  if (!design) {
    return { ok: false, code: "theme_not_found", error: "Maison design not found." };
  }
  const designRes = await applyDesign(admin, {
    talentProfileId: g.talentProfileId,
    siteId,
    design,
    displayName: g.displayName,
    userId: g.userId,
  });
  if (!designRes.ok) return designRes;

  // Re-apply current colors after layout rewrite.
  if (custom) {
    const nowTokens = new Date().toISOString();
    const { error: customErr } = await admin
      .from("talent_sites")
      .update({
        custom_palette: custom,
        theme_look_slug: null,
        menu_style: menuStyle,
        draft_updated_at: nowTokens,
        updated_at: nowTokens,
        updated_by: g.userId,
      })
      .eq("id", siteId);
    if (customErr) {
      logServerError("maison.options.reapply.custom", customErr);
    }
  } else {
    const look = await loadMaisonCatalogRow(admin, "look", lookSlug);
    if (look) {
      await applyLook(admin, { siteId, look, userId: g.userId });
    }
    const nowMeta = new Date().toISOString();
    await admin
      .from("talent_sites")
      .update({
        menu_style: menuStyle,
        custom_palette: null,
        draft_updated_at: nowMeta,
        updated_at: nowMeta,
        updated_by: g.userId,
      })
      .eq("id", siteId);
  }

  const pending: MaisonPendingUndo = {
    previous: captured.snapshot,
    source: "apply",
    created_at: new Date().toISOString(),
    applied: {
      designSlug: DESIGN_SLUG,
      lookSlug: custom ? null : lookSlug,
      paletteKey: custom ? null : paletteKey,
      contentMode: "mine",
      demoSlug: MAISON_BUILTIN_DEMO.slug,
      customPalette: custom,
    },
  };
  const now = new Date().toISOString();
  const { error: metaErr } = await admin
    .from("talent_sites")
    .update({
      pending_design: pending,
      theme_demo_slug: MAISON_BUILTIN_DEMO.slug,
      draft_updated_at: now,
      updated_at: now,
      updated_by: g.userId,
    })
    .eq("id", siteId);
  if (metaErr) {
    logServerError("maison.options.reapply.meta", metaErr);
    return { ok: false, code: "server_error", error: "Layout reapplied, but Undo could not be saved." };
  }
  return { ok: true, data: { mode: "draft" } };
}

/** W70 — Restore a published design version into draft (never live-direct). */
export async function restoreMaisonDesignRevisionAction(input: {
  revisionId: string;
}): Promise<ThemeActionResult<{ restored: true }>> {
  if (!isTalentMaisonThemeEnabled()) {
    return { ok: false, code: "feature_disabled", error: "Maison is not available yet." };
  }
  const g = await gate("personalSiteEdit");
  if (!g.ok) return g;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, code: "server_error", error: "Not configured." };
  if (typeof input?.revisionId !== "string" || !input.revisionId) {
    return { ok: false, code: "invalid_input", error: "Pick a version to restore." };
  }

  const { data: site, error: siteErr } = await admin
    .from("talent_sites")
    .select("id, site_published_at")
    .eq("talent_profile_id", g.talentProfileId)
    .maybeSingle();
  if (siteErr) {
    logServerError("maison.options.restore.readSite", siteErr);
    return { ok: false, code: "server_error", error: "Could not restore." };
  }
  if (!site) return { ok: false, code: "site_not_found", error: "Site not found." };
  const siteId = (site as { id: string }).id;

  const { data: rev, error: revErr } = await admin
    .from("talent_site_revisions")
    .select("id, snapshot")
    .eq("id", input.revisionId)
    .eq("talent_site_id", siteId)
    .eq("kind", "published")
    .maybeSingle();
  if (revErr) {
    logServerError("maison.options.restore.readRev", revErr);
    return { ok: false, code: "server_error", error: "Could not restore." };
  }
  if (!rev || !isMaisonDesignRevisionSnapshot((rev as { snapshot?: unknown }).snapshot)) {
    return { ok: false, code: "invalid_input", error: "That version was not found." };
  }
  const snap = (rev as { snapshot: MaisonDesignRevisionSnapshot }).snapshot;
  const draftSnap = revisionToDraftSnapshot(snap);

  const captured = await captureMaisonDraftSnapshot(admin, {
    talentProfileId: g.talentProfileId,
    siteId,
  });
  if (!captured.ok) {
    return { ok: false, code: "server_error", error: captured.error };
  }

  // Write restored design into draft only (W70 — never live-direct).
  const restored = await restoreMaisonDraftSnapshot(admin, {
    talentProfileId: g.talentProfileId,
    siteId,
    snapshot: draftSnap,
    userId: g.userId,
    clearPending: false,
  });
  if (!restored.ok) {
    return { ok: false, code: "server_error", error: restored.error };
  }

  const baseline = await readLiveBaseline(admin, siteId);
  if (!baseline.ok) return { ok: false, code: "server_error", error: baseline.error };

  const paletteKey = lookSlugToPalette(snap.look_slug);
  const custom = parseMaisonCustomPaletteStored(snap.custom_palette);
  const written = await writeLivePending(admin, {
    siteId,
    talentProfileId: g.talentProfileId,
    userId: g.userId,
    source: "restore",
    liveBaseline: baseline.baseline,
    undoDraft: captured.snapshot,
    proposed: {
      designSlug: snap.design_slug ?? DESIGN_SLUG,
      lookSlug: custom ? null : snap.look_slug,
      paletteKey: custom ? null : paletteKey,
      contentMode: "mine",
      demoSlug: snap.demo_slug ?? MAISON_BUILTIN_DEMO.slug,
      customPalette: custom,
      menuStyle: snap.menu_style,
      draftSnapshot: draftSnap,
    },
  });
  if (!written.ok) return { ok: false, code: "server_error", error: written.error };
  return { ok: true, data: { restored: true } };
}
