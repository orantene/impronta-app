import "server-only";

/**
 * A5 / W41 — design-shaped published revision on Max site publish.
 * Restore-into-pending_design is PR8; this only writes the snapshot.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";

export const MAISON_DESIGN_REVISION_SURFACE = "maison_design" as const;

export type MaisonDesignRevisionSnapshot = {
  surface: typeof MAISON_DESIGN_REVISION_SURFACE;
  published_at: string;
  design_slug: string | null;
  look_slug: string | null;
  demo_slug: string | null;
  menu_style: string | null;
  custom_palette: unknown;
  design_tokens: unknown;
  shell_published: unknown;
  home_blocks: unknown;
};

export function isMaisonDesignRevisionSnapshot(
  raw: unknown,
): raw is MaisonDesignRevisionSnapshot {
  if (!raw || typeof raw !== "object") return false;
  return (raw as { surface?: unknown }).surface === MAISON_DESIGN_REVISION_SURFACE;
}

async function nextPublishedVersion(
  admin: SupabaseClient,
  siteId: string,
): Promise<number> {
  const { data, error } = await admin
    .from("talent_site_revisions")
    .select("version")
    .eq("talent_site_id", siteId)
    .eq("kind", "published")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    // Best-effort revision numbering — fall back to v1 rather than fail publish.
    logServerError("maison.revision.nextVersion", error);
    return 1;
  }
  const current = (data as { version?: number } | null)?.version;
  return typeof current === "number" ? current + 1 : 1;
}

/**
 * Best-effort: never fails the publish path. Logs and returns on error.
 */
export async function writeMaisonDesignPublishedRevision(
  admin: SupabaseClient,
  input: {
    talentProfileId: string;
    siteId: string;
    userId: string | null;
    publishedAt: string;
  },
): Promise<void> {
  const { data: site, error: siteErr } = await admin
    .from("talent_sites")
    .select(
      "theme_design_slug, theme_look_slug, theme_demo_slug, menu_style, custom_palette, design_tokens, shell_published",
    )
    .eq("id", input.siteId)
    .eq("talent_profile_id", input.talentProfileId)
    .maybeSingle();
  if (siteErr || !site) {
    logServerError("maison.revision.readSite", siteErr ?? { message: "missing site" });
    return;
  }

  const { data: home, error: homeErr } = await admin
    .from("talent_pages")
    .select("blocks")
    .eq("talent_profile_id", input.talentProfileId)
    .eq("is_home", true)
    .maybeSingle();
  if (homeErr) {
    logServerError("maison.revision.readHome", homeErr);
  }

  const s = site as Record<string, unknown>;
  const snapshot: MaisonDesignRevisionSnapshot = {
    surface: MAISON_DESIGN_REVISION_SURFACE,
    published_at: input.publishedAt,
    design_slug: typeof s.theme_design_slug === "string" ? s.theme_design_slug : null,
    look_slug: typeof s.theme_look_slug === "string" ? s.theme_look_slug : null,
    demo_slug: typeof s.theme_demo_slug === "string" ? s.theme_demo_slug : null,
    menu_style: typeof s.menu_style === "string" ? s.menu_style : null,
    custom_palette: s.custom_palette ?? null,
    design_tokens: s.design_tokens ?? {},
    shell_published: s.shell_published ?? [],
    home_blocks: (home as { blocks?: unknown } | null)?.blocks ?? [],
  };

  const version = await nextPublishedVersion(admin, input.siteId);
  const { error: insertErr } = await admin.from("talent_site_revisions").insert({
    talent_site_id: input.siteId,
    talent_profile_id: input.talentProfileId,
    kind: "published",
    version,
    snapshot,
    created_by: input.userId,
  });
  if (insertErr) {
    logServerError("maison.revision.insert", insertErr);
  }
}
