"use server";

/**
 * Production server actions for the TALENT-site shell freeform adapter.
 *
 * Resolve the signed-in talent (owner), assert Max, and persist the freeform
 * `builderTree` to `talent_sites.shell_tree` (draft) / publish by baking
 * `shell_tree → shell_published`. NEVER touch `cms_pages` / `cms_page_sections`.
 *
 * AUTH: owner + Max via `requireTalentSelf` + `assertTalentCanUseCustomBuilder`.
 * `talent_sites` RLS (owner-only via `is_talent_profile_owner`) independently
 * backs every write, so a forged `talentProfileId` can't escape the caller's own
 * row. The bound mount also passes the talent's OWN id, so the gate + the
 * passed-in id always agree.
 *
 * "use server" file: every export is an async action. The non-action binding
 * (`createBoundTalentSiteShellAdapter`) lives in `talent-site-shell-adapter.ts`.
 */

import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import {
  requireTalentSelf,
  assertTalentCanUseCustomBuilder,
} from "@/lib/server/talent-self-guard";
import { enforceLockedPropsOnTree } from "@/lib/site-admin/builder-node/prop-lock";

import type {
  TalentSiteShellAdapterActions,
  TalentSiteShellRow,
} from "./talent-site-shell-adapter-core";

/**
 * Resolve the signed-in talent + assert Max + assert the requested
 * `talentProfileId` is the caller's own. Returns the owner id on success.
 */
async function gateOwner(
  talentProfileId: string,
): Promise<
  | { ok: true; talentProfileId: string }
  | { ok: false; error: string }
> {
  const scope = await requireTalentSelf();
  if (!scope.ok) return { ok: false, error: scope.error };
  if (!assertTalentCanUseCustomBuilder(scope.planKey)) {
    return { ok: false, error: "Upgrade to Max to edit your site shell." };
  }
  if (talentProfileId && talentProfileId !== scope.talentProfile.id) {
    return { ok: false, error: "Not your site." };
  }
  return { ok: true, talentProfileId: scope.talentProfile.id };
}

export async function loadTalentSiteShellRow(
  input: Parameters<TalentSiteShellAdapterActions["loadShell"]>[0],
): Promise<TalentSiteShellRow | null> {
  try {
    const gate = await gateOwner(input.talentProfileId);
    if (!gate.ok) return null;
    const sb = await getCachedServerSupabase();
    if (!sb) return null;
    const { data, error } = await sb
      .from("talent_sites")
      .select("id, shell_tree, shell_published, site_published_at, updated_at")
      .eq("talent_profile_id", gate.talentProfileId)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as {
      id: string;
      shell_tree: unknown;
      shell_published: unknown;
      site_published_at: string | null;
      updated_at: string;
    };
    return {
      id: row.id,
      shellTree: row.shell_tree,
      shellPublished: row.shell_published,
      sitePublishedAt: row.site_published_at,
      updatedAt: row.updated_at,
    };
  } catch (err) {
    logServerError("talentSiteShell/loadShell", err);
    return null;
  }
}

export async function saveTalentSiteShellRow(
  input: Parameters<TalentSiteShellAdapterActions["saveShell"]>[0],
): ReturnType<TalentSiteShellAdapterActions["saveShell"]> {
  try {
    const gate = await gateOwner(input.talentProfileId);
    if (!gate.ok) return { ok: false as const, error: gate.error };
    const sb = await getCachedServerSupabase();
    if (!sb) return { ok: false as const, error: "Supabase client unavailable." };

    // Server-trusted lock enforcement — re-assert admin prop-locks against the
    // current shell so a crafted client can't persist an edit to a locked prop.
    const { data: current } = await sb
      .from("talent_sites")
      .select("shell_tree")
      .eq("talent_profile_id", gate.talentProfileId)
      .maybeSingle();
    const enforced = enforceLockedPropsOnTree(
      input.patch.shellTree ?? [],
      (current as { shell_tree: unknown } | null)?.shell_tree,
    );

    const { data, error } = await sb
      .from("talent_sites")
      .update({ shell_tree: enforced, updated_at: input.patch.updatedAt })
      .eq("talent_profile_id", gate.talentProfileId)
      .select("updated_at")
      .single();
    if (error || !data) {
      return { ok: false as const, error: error?.message ?? "Could not save your shell." };
    }
    return { ok: true as const, updatedAt: data.updated_at as string };
  } catch (err) {
    logServerError("talentSiteShell/saveShell", err);
    return { ok: false as const, error: "Unexpected error saving your shell." };
  }
}

export async function publishTalentSiteShellRow(
  input: Parameters<TalentSiteShellAdapterActions["publishShell"]>[0],
): ReturnType<TalentSiteShellAdapterActions["publishShell"]> {
  try {
    const gate = await gateOwner(input.talentProfileId);
    if (!gate.ok) return { ok: false as const, error: gate.error };
    const sb = await getCachedServerSupabase();
    if (!sb) return { ok: false as const, error: "Supabase client unavailable." };

    // Bake shell_tree → shell_published (publishes ONLY the shell, not the pages).
    const { data: current } = await sb
      .from("talent_sites")
      .select("shell_tree")
      .eq("talent_profile_id", gate.talentProfileId)
      .maybeSingle();
    const shellTree = (current as { shell_tree: unknown } | null)?.shell_tree ?? [];

    const now = new Date().toISOString();
    const { data, error } = await sb
      .from("talent_sites")
      .update({ shell_published: shellTree, updated_at: now })
      .eq("talent_profile_id", gate.talentProfileId)
      .select("updated_at")
      .single();
    if (error || !data) {
      return { ok: false as const, error: error?.message ?? "Could not publish your shell." };
    }
    return { ok: true as const, publishedAt: now, updatedAt: data.updated_at as string };
  } catch (err) {
    logServerError("talentSiteShell/publishShell", err);
    return { ok: false as const, error: "Unexpected error publishing your shell." };
  }
}
