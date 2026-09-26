import "server-only";

/**
 * Never-published Maison apply Undo (A4 / W35–W36).
 * Snapshot lives in `talent_sites.pending_design.previous` after apply; live
 * `pending_design` proposed-design flow is PR8.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import type { MaisonPaletteKey } from "@/lib/talent-site/theme-catalog/maison/seed";
import type { MaisonPreviewContentMode } from "@/lib/talent-site/theme-catalog/maison/preview-hydration";

export type MaisonDraftSnapshot = {
  shell_tree: unknown;
  home_blocks: unknown;
  design_tokens_draft: unknown;
  theme_design_slug: string | null;
  theme_design_version: number | null;
  theme_look_slug: string | null;
  theme_demo_slug: string | null;
  menu_style: string | null;
  custom_palette: unknown;
};

export type MaisonPendingUndo = {
  previous: MaisonDraftSnapshot;
  source: "apply";
  created_at: string;
  applied: {
    designSlug: string;
    lookSlug: string;
    paletteKey: MaisonPaletteKey;
    contentMode: MaisonPreviewContentMode;
    demoSlug: string;
  };
};

export function isMaisonPendingUndo(raw: unknown): raw is MaisonPendingUndo {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  if (o.source !== "apply") return false;
  if (!o.previous || typeof o.previous !== "object") return false;
  if (!o.applied || typeof o.applied !== "object") return false;
  return typeof o.created_at === "string";
}

export async function captureMaisonDraftSnapshot(
  admin: SupabaseClient,
  input: { talentProfileId: string; siteId: string },
): Promise<{ ok: true; snapshot: MaisonDraftSnapshot } | { ok: false; error: string }> {
  const { data: site, error: siteErr } = await admin
    .from("talent_sites")
    .select(
      "shell_tree, design_tokens_draft, theme_design_slug, theme_design_version, theme_look_slug, theme_demo_slug, menu_style, custom_palette",
    )
    .eq("id", input.siteId)
    .eq("talent_profile_id", input.talentProfileId)
    .maybeSingle();
  if (siteErr) {
    logServerError("maison.snapshot.readSite", siteErr);
    return { ok: false, error: "Could not read your draft." };
  }
  if (!site) return { ok: false, error: "Site not found." };

  const { data: home, error: homeErr } = await admin
    .from("talent_pages")
    .select("blocks")
    .eq("talent_profile_id", input.talentProfileId)
    .eq("is_home", true)
    .maybeSingle();
  if (homeErr) {
    logServerError("maison.snapshot.readHome", homeErr);
    return { ok: false, error: "Could not read your draft home." };
  }

  const s = site as Record<string, unknown>;
  return {
    ok: true,
    snapshot: {
      shell_tree: s.shell_tree ?? [],
      home_blocks: (home as { blocks?: unknown } | null)?.blocks ?? [],
      design_tokens_draft: s.design_tokens_draft ?? {},
      theme_design_slug: typeof s.theme_design_slug === "string" ? s.theme_design_slug : null,
      theme_design_version:
        typeof s.theme_design_version === "number" ? s.theme_design_version : null,
      theme_look_slug: typeof s.theme_look_slug === "string" ? s.theme_look_slug : null,
      theme_demo_slug: typeof s.theme_demo_slug === "string" ? s.theme_demo_slug : null,
      menu_style: typeof s.menu_style === "string" ? s.menu_style : null,
      custom_palette: s.custom_palette ?? null,
    },
  };
}

export async function restoreMaisonDraftSnapshot(
  admin: SupabaseClient,
  input: {
    talentProfileId: string;
    siteId: string;
    snapshot: MaisonDraftSnapshot;
    userId?: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const { error: siteErr, count: siteCount } = await admin
    .from("talent_sites")
    .update(
      {
        shell_tree: input.snapshot.shell_tree,
        design_tokens_draft: input.snapshot.design_tokens_draft,
        theme_design_slug: input.snapshot.theme_design_slug,
        theme_design_version: input.snapshot.theme_design_version,
        theme_look_slug: input.snapshot.theme_look_slug,
        theme_demo_slug: input.snapshot.theme_demo_slug,
        menu_style: input.snapshot.menu_style,
        custom_palette: input.snapshot.custom_palette,
        pending_design: null,
        draft_updated_at: now,
        updated_at: now,
        ...(input.userId ? { updated_by: input.userId } : {}),
      },
      { count: "exact" },
    )
    .eq("id", input.siteId)
    .eq("talent_profile_id", input.talentProfileId);
  if (siteErr) {
    logServerError("maison.snapshot.restoreSite", siteErr);
    return { ok: false, error: "Could not undo the design." };
  }
  if (!siteCount) return { ok: false, error: "Site not found." };

  const { error: homeErr, count: homeCount } = await admin
    .from("talent_pages")
    .update({ blocks: input.snapshot.home_blocks, updated_at: now }, { count: "exact" })
    .eq("talent_profile_id", input.talentProfileId)
    .eq("is_home", true);
  if (homeErr) {
    logServerError("maison.snapshot.restoreHome", homeErr);
    return { ok: false, error: "Could not undo the home page." };
  }
  if (!homeCount) return { ok: false, error: "Home page not found." };

  return { ok: true };
}
