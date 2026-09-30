import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { stableStringify } from "@/lib/talent-site/theme-releases/origin";
import { publishSiteThemeForTalent } from "./theme-publish-hook";

/**
 * F134 - the builder's page publish used to bake only that page. A theme update
 * rewrites the shared header/footer (and tokens) in the DRAFT too, so the chip
 * kept counting them ("1 unpublished change") right after "Publicar ahora".
 * The chip, the "What will go live" sheet and the whole-site publish treat the
 * site as ONE unit, so a page publish on a live site also carries the shared
 * shell and theme tokens when their drafts differ from live. Identical drafts
 * are left alone (no write, no theme version bump).
 */
export function draftDiffersFromLive(draft: unknown, live: unknown): boolean {
  return stableStringify(draft ?? null) !== stableStringify(live ?? null);
}

export type SiteChromePublishResult = { ok: true; shell: boolean; theme: boolean } | { ok: false; error: string };

export async function publishSiteChromeWithPage(
  sb: SupabaseClient,
  talentProfileId: string,
  deps: { publishTheme?: typeof publishSiteThemeForTalent } = {},
): Promise<SiteChromePublishResult> {
  const { data, error } = await sb
    .from("talent_sites")
    .select("shell_tree, shell_published, design_tokens_draft, design_tokens")
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, shell: false, theme: false };
  const row = data as Record<string, unknown>;

  let shell = false;
  if (draftDiffersFromLive(row.shell_tree, row.shell_published)) {
    const { error: writeErr } = await sb
      .from("talent_sites")
      .update({ shell_published: row.shell_tree ?? [], updated_at: new Date().toISOString() })
      .eq("talent_profile_id", talentProfileId);
    if (writeErr) return { ok: false, error: writeErr.message };
    shell = true;
  }

  let theme = false;
  if (draftDiffersFromLive(row.design_tokens_draft, row.design_tokens)) {
    const res = await (deps.publishTheme ?? publishSiteThemeForTalent)({ talentProfileId, profileCode: null });
    if (!res.ok) return { ok: false, error: res.error };
    theme = Boolean(res.data);
  }
  return { ok: true, shell, theme };
}
