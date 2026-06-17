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

import type { SupabaseClient } from "@supabase/supabase-js";

import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import {
  requireTalentSelf,
  assertTalentCanUseCustomBuilder,
} from "@/lib/server/talent-self-guard";
import { enforceLockedPropsOnTree } from "@/lib/site-admin/builder-node/prop-lock";
import { parseBuilderTreeFromSnapshot } from "@/lib/site-admin/edit-mode/composition-revision-snapshot";

import type {
  TalentSiteShellAdapterActions,
  TalentSiteShellRow,
} from "./talent-site-shell-adapter-core";
import {
  buildTalentSiteShellRevisionSnapshot,
  isTalentSiteShellRevisionSnapshot,
  nextTalentSiteShellRevisionVersion,
} from "./talent-site-shell-revision-snapshot";

/**
 * Resolve the signed-in talent + assert Max + assert the requested
 * `talentProfileId` is the caller's own. Returns the owner id on success.
 */
async function gateOwner(
  talentProfileId: string,
): Promise<
  | { ok: true; talentProfileId: string; actorProfileId: string }
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
  return {
    ok: true,
    talentProfileId: scope.talentProfile.id,
    actorProfileId: scope.session.user.id,
  };
}

/**
 * REV-1 — resolve the next `talent_site_revisions.version` for a site: max
 * existing version + 1 (defaults to 1 for the first revision). Best-effort — a
 * read failure falls back to 1, which never blocks a save/publish (the revision
 * insert is itself best-effort).
 */
async function nextShellRevisionVersion(
  sb: SupabaseClient,
  talentSiteId: string,
): Promise<number> {
  const { data } = await sb
    .from("talent_site_revisions")
    .select("version")
    .eq("talent_site_id", talentSiteId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<{ version: number }>();
  return nextTalentSiteShellRevisionVersion(data?.version);
}

/**
 * REV-1 — write a `talent_site_revisions` row capturing the talent's freeform
 * shell tree. Best-effort: a failure is swallowed (the shell is already
 * saved/published once the row commits), mirroring `writeShellRevision` for the
 * agency shell. The snapshot carries the freeform `builderTree` under a
 * `surface: "talent_site_shell"` marker so it is never confused with the
 * full-site `TalentSiteSnapshot` rows in the same table.
 *
 * `talent_site_revisions.kind` is CHECK-constrained to draft/published/
 * unpublished (no `rollback` value), so a restore audit row reuses `draft`.
 * Owner RLS (`talent_site_revisions_owner_insert`) backs the write — the
 * caller's own client (not service-role) is used, scoped to their site.
 */
async function writeTalentSiteShellRevision(input: {
  sb: SupabaseClient;
  talentSiteId: string;
  talentProfileId: string;
  title: string;
  shellTree: unknown;
  kind: "draft" | "published";
  actorProfileId: string | null;
}): Promise<void> {
  try {
    const version = await nextShellRevisionVersion(input.sb, input.talentSiteId);
    await input.sb.from("talent_site_revisions").insert({
      talent_site_id: input.talentSiteId,
      talent_profile_id: input.talentProfileId,
      kind: input.kind,
      version,
      snapshot: buildTalentSiteShellRevisionSnapshot({
        title: input.title,
        shellTree: input.shellTree,
      }),
      created_by: input.actorProfileId,
    });
  } catch {
    // Non-fatal: the shell is already persisted; a missing revision row only
    // means this checkpoint isn't restorable, never that the save/publish failed.
  }
}

export async function loadTalentSiteShellRow(
  input: Parameters<TalentSiteShellAdapterActions["loadShell"]>[0],
): Promise<TalentSiteShellRow | null> {
  try {
    const gate = await gateOwner(input.talentProfileId);
    if (!gate.ok) return null;
    const sb = await getCachedServerSupabase();
    if (!sb) return null;
    const selectRow = (cols: string) =>
      sb
        .from("talent_sites")
        .select(cols)
        .eq("talent_profile_id", gate.talentProfileId)
        .maybeSingle();
    // STYLE-1 — try with the style columns, fall back when not yet migrated.
    let { data, error } = await selectRow(
      "id, shell_tree, shell_published, site_published_at, updated_at, style_classes, style_presets",
    );
    if (error || !data) {
      ({ data, error } = await selectRow(
        "id, shell_tree, shell_published, site_published_at, updated_at",
      ));
    }
    if (error || !data) return null;
    const row = data as unknown as {
      id: string;
      shell_tree: unknown;
      shell_published: unknown;
      site_published_at: string | null;
      updated_at: string;
      style_classes?: unknown;
      style_presets?: unknown;
    };
    return {
      id: row.id,
      shellTree: row.shell_tree,
      shellPublished: row.shell_published,
      sitePublishedAt: row.site_published_at,
      updatedAt: row.updated_at,
      styleClasses: row.style_classes,
      stylePresets: row.style_presets,
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
      .select("id, shell_tree")
      .eq("talent_profile_id", gate.talentProfileId)
      .maybeSingle();
    const currentRow = current as { id: string; shell_tree: unknown } | null;
    const enforced = enforceLockedPropsOnTree(
      input.patch.shellTree ?? [],
      currentRow?.shell_tree,
    );

    // STYLE-1 — only set the style columns when the caller touched them.
    const stylePatch: Record<string, unknown> = {};
    if (input.patch.style_classes !== undefined) {
      stylePatch.style_classes = input.patch.style_classes;
    }
    if (input.patch.style_presets !== undefined) {
      stylePatch.style_presets = input.patch.style_presets;
    }

    const runUpdate = (payload: Record<string, unknown>) =>
      sb
        .from("talent_sites")
        .update(payload)
        .eq("talent_profile_id", gate.talentProfileId)
        .select("updated_at")
        .single();

    const base = { shell_tree: enforced, updated_at: input.patch.updatedAt };
    let { data, error } = await runUpdate({ ...base, ...stylePatch });
    // STYLE-1 graceful fallback — style columns not yet migrated → retry without.
    if (error && Object.keys(stylePatch).length > 0) {
      ({ data, error } = await runUpdate(base));
    }
    if (error || !data) {
      return { ok: false as const, error: error?.message ?? "Could not save your shell." };
    }

    // REV-1 — checkpoint the saved freeform shell tree as a restorable
    // `talent_site_revisions` row (kind=draft). Best-effort, never blocks.
    if (currentRow?.id) {
      await writeTalentSiteShellRevision({
        sb,
        talentSiteId: currentRow.id,
        talentProfileId: gate.talentProfileId,
        title: "Site shell",
        shellTree: enforced,
        kind: "draft",
        actorProfileId: gate.actorProfileId,
      });
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
      .select("id, shell_tree")
      .eq("talent_profile_id", gate.talentProfileId)
      .maybeSingle();
    const currentRow = current as { id: string; shell_tree: unknown } | null;
    const shellTree = currentRow?.shell_tree ?? [];

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

    // REV-1 — checkpoint the just-published freeform shell tree as a restorable
    // `talent_site_revisions` row (kind=published). Best-effort, never blocks.
    if (currentRow?.id) {
      await writeTalentSiteShellRevision({
        sb,
        talentSiteId: currentRow.id,
        talentProfileId: gate.talentProfileId,
        title: "Site shell",
        shellTree,
        kind: "published",
        actorProfileId: gate.actorProfileId,
      });
    }

    return { ok: true as const, publishedAt: now, updatedAt: data.updated_at as string };
  } catch (err) {
    logServerError("talentSiteShell/publishShell", err);
    return { ok: false as const, error: "Unexpected error publishing your shell." };
  }
}

/**
 * REV-1 — restore a saved shell revision's freeform tree back onto the talent
 * site's DRAFT `shell_tree`. Mirrors `restoreSiteShellRevisionAction` (agency)
 * and `restoreTalentPageRevisionAction`:
 *   - reads the revision's `builderTree` snapshot (ONLY shell-tree revisions —
 *     full-site `TalentSiteSnapshot` rows are skipped via the marker guard so a
 *     restore can never paint slot composition into the freeform shell),
 *   - re-asserts admin prop-locks (C1 chokepoint) against the current draft so
 *     restoring an old/pre-lock revision can't drop a lock,
 *   - writes the restored tree to the DRAFT `shell_tree` (the operator reviews
 *     the restored draft, then presses Publish), and
 *   - mints a fresh `kind='draft'` revision so the audit trail is complete
 *     (`talent_site_revisions.kind` has no `rollback` value).
 *
 * AUTH: owner + Max via `gateOwner`. `talent_sites` / `talent_site_revisions`
 * RLS independently allows only the owner, so a forged id can't escape the
 * caller's own row. The revision lookup is scoped to the owner's site.
 */
export async function restoreTalentSiteShellRevisionAction(
  input: Parameters<NonNullable<TalentSiteShellAdapterActions["restoreRevision"]>>[0],
): ReturnType<NonNullable<TalentSiteShellAdapterActions["restoreRevision"]>> {
  try {
    const gate = await gateOwner(input.talentProfileId);
    if (!gate.ok) return { ok: false as const, error: gate.error };
    const sb = await getCachedServerSupabase();
    if (!sb) return { ok: false as const, error: "Supabase client unavailable." };

    // 1. Resolve the owner's site row (the FK + the live draft to re-lock against).
    const { data: site } = await sb
      .from("talent_sites")
      .select("id, shell_tree")
      .eq("talent_profile_id", gate.talentProfileId)
      .maybeSingle();
    const siteRow = site as { id: string; shell_tree: unknown } | null;
    if (!siteRow?.id) {
      return { ok: false as const, error: "Personal site not found." };
    }

    // 2. Read the revision's snapshot (scoped to the owner's site).
    const { data: rev, error: revErr } = await sb
      .from("talent_site_revisions")
      .select("snapshot")
      .eq("id", input.revisionId)
      .eq("talent_site_id", siteRow.id)
      .eq("talent_profile_id", gate.talentProfileId)
      .maybeSingle();
    if (revErr || !rev) {
      return { ok: false as const, error: revErr?.message ?? "Shell revision not found." };
    }
    const snapshot = (rev as { snapshot: unknown }).snapshot;
    if (!isTalentSiteShellRevisionSnapshot(snapshot)) {
      return {
        ok: false as const,
        error: "That revision isn't a site-shell checkpoint.",
      };
    }
    const restoredTree = parseBuilderTreeFromSnapshot(snapshot) ?? [];

    // 3. Re-assert current locks onto the restored content (C1) against the live
    //    draft, so restoring a pre-lock/tampered revision can't drop an admin lock.
    const enforced = enforceLockedPropsOnTree(restoredTree, siteRow.shell_tree);

    // 4. Write the restored tree back to the DRAFT shell_tree.
    const now = new Date().toISOString();
    const { data, error } = await sb
      .from("talent_sites")
      .update({ shell_tree: enforced, updated_at: now })
      .eq("talent_profile_id", gate.talentProfileId)
      .select("updated_at")
      .single();
    if (error || !data) {
      return { ok: false as const, error: error?.message ?? "Could not restore the shell revision." };
    }

    // 5. Mint a draft revision for the audit trail (best-effort).
    await writeTalentSiteShellRevision({
      sb,
      talentSiteId: siteRow.id,
      talentProfileId: gate.talentProfileId,
      title: "Site shell",
      shellTree: enforced,
      kind: "draft",
      actorProfileId: gate.actorProfileId,
    });

    return { ok: true as const, updatedAt: data.updated_at as string };
  } catch (err) {
    logServerError("talentSiteShell/restoreShellRevision", err);
    return { ok: false as const, error: "Unexpected error restoring your shell revision." };
  }
}
