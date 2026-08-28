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
import { normalizeUnknownBuilderTreeLayout } from "@/lib/site-admin/builder-node/normalize-tree-layout";
import { parseBuilderTreeFromSnapshot } from "@/lib/site-admin/edit-mode/composition-revision-snapshot";
import { resolveBuilderTreeClassRefs } from "@/lib/site-admin/builder-node/style-classes";
import { coerceStyleClassRegistry } from "@/lib/site-admin/builder-node/style-registry-coerce";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import type {
  RevisionListRow,
  RevisionsLoadResult,
} from "@/lib/site-admin/edit-mode/revisions-actions";

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
    // Draft-save normalization gate (content-preserving; strict validate stays
    // at publish). Runs at the same C1 chokepoint as the lock re-assert.
    const enforced = normalizeUnknownBuilderTreeLayout(
      enforceLockedPropsOnTree(input.patch.shellTree ?? [], currentRow?.shell_tree),
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
    // STYLE-1 — try with style_classes, fall back when the column is not yet migrated.
    const selectCurrent = (cols: string) =>
      sb
        .from("talent_sites")
        .select(cols)
        .eq("talent_profile_id", gate.talentProfileId)
        .maybeSingle();
    let { data: current } = await selectCurrent("id, shell_tree, style_classes");
    if (!current) {
      ({ data: current } = await selectCurrent("id, shell_tree"));
    }
    const currentRow = current as {
      id: string;
      shell_tree: unknown;
      style_classes?: unknown;
    } | null;
    const rawTree: BuilderNodeTree = Array.isArray(currentRow?.shell_tree)
      ? (currentRow.shell_tree as BuilderNodeTree)
      : [];
    const shellTree = resolveBuilderTreeClassRefs(
      rawTree,
      coerceStyleClassRegistry(currentRow?.style_classes),
    );

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
    const enforced = normalizeUnknownBuilderTreeLayout(
      enforceLockedPropsOnTree(restoredTree, siteRow.shell_tree),
    );

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

/**
 * REV-1b — OWNER-gated revision LIST read for the talent's site shell.
 *
 * THE GAP: the shared RevisionsDrawer reads the revision list via
 * `loadHomepageRevisionsAction` / `loadPageRevisionsAction`, both `requireStaff`-
 * gated. The talent-site shell editor mounts with NO `pageSlug`, so the drawer
 * falls through to the staff-gated homepage loader. REV-1 bound `restoreRevision`
 * for this surface (so a talent can RESTORE), but a talent has no staff
 * capability, so the staff-gated LIST read is denied — the drawer renders empty
 * and the talent can't SEE the revisions they're meant to restore.
 *
 * This loader closes that gap with a TALENT-OWNED read: same `gateOwner` (owner +
 * Max + own-id) REV-1 used for restore, the caller's own Supabase client (not
 * service-role) so owner RLS on `talent_sites` / `talent_site_revisions`
 * independently backs the read. Only SHELL revisions are surfaced
 * (`isTalentSiteShellRevisionSnapshot`) so the full-site `TalentSiteSnapshot`
 * composition rows in the same table are filtered out. The return shape matches
 * `loadHomepageRevisionsAction` so the drawer consumes it without a surfaceKind
 * fork. `pageVersion` mirrors the adapter's `updated_at`-epoch CAS stamp.
 */
export async function loadTalentSiteShellRevisionsAction(input: {
  talentProfileId: string;
}): Promise<RevisionsLoadResult> {
  try {
    const gate = await gateOwner(input.talentProfileId);
    if (!gate.ok) return { ok: false, error: gate.error, code: "UNAUTHORIZED" };
    const sb = await getCachedServerSupabase();
    if (!sb) return { ok: false, error: "Supabase client unavailable." };

    // Resolve the owner's site row (the FK to scope the revision read, plus the
    // updated_at the adapter turns into the CAS pageVersion).
    const { data: site } = await sb
      .from("talent_sites")
      .select("id, updated_at")
      .eq("talent_profile_id", gate.talentProfileId)
      .maybeSingle();
    const siteRow = site as { id: string; updated_at: string } | null;
    if (!siteRow?.id) {
      return { ok: false, error: "Personal site not found.", code: "NOT_FOUND" };
    }
    const pageVersion = Math.floor(new Date(siteRow.updated_at).getTime() / 1000);

    // Owner-scoped read of the site's revisions, newest-first. Owner RLS
    // (`talent_site_revisions` owner policies) independently backs this; the
    // explicit filters keep it scoped to the caller's own site.
    const { data: rows, error } = await sb
      .from("talent_site_revisions")
      .select("id, kind, version, created_at, created_by, snapshot")
      .eq("talent_site_id", siteRow.id)
      .eq("talent_profile_id", gate.talentProfileId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      return { ok: false, error: "Failed to load revisions" };
    }

    type Raw = {
      id: string;
      kind: string;
      version: number;
      created_at: string;
      created_by: string | null;
      snapshot: unknown;
    };
    // Only SHELL revisions — full-site composition rows in this table carry no
    // freeform `builderTree` and would never restore here, so they must not
    // appear in the shell's list.
    const shellRows = ((rows ?? []) as Raw[]).filter((r) =>
      isTalentSiteShellRevisionSnapshot(r.snapshot),
    );

    // Bulk-fetch author display names for the non-null actor ids (one query).
    const actorIds = Array.from(
      new Set(shellRows.map((r) => r.created_by).filter((v): v is string => !!v)),
    );
    const profileMap = new Map<string, { id: string; displayName: string | null }>();
    if (actorIds.length > 0) {
      const { data: profiles } = await sb
        .from("profiles")
        .select("id, display_name")
        .in("id", actorIds);
      for (const p of (profiles ?? []) as Array<{
        id: string;
        display_name: string | null;
      }>) {
        profileMap.set(p.id, { id: p.id, displayName: p.display_name });
      }
    }

    // `talent_site_revisions.kind` is CHECK-constrained to draft/published/
    // unpublished. The drawer's row enum is draft/published/rollback — map the
    // shell's `unpublished` (no drawer equivalent) onto `draft` so the badge
    // renders, mirroring how the restore audit row reuses `draft`.
    const toRowKind = (k: string): RevisionListRow["kind"] =>
      k === "published" ? "published" : "draft";

    let publishedVersion: number | null = null;
    const revisions: RevisionListRow[] = shellRows.map((r) => {
      const rowKind = toRowKind(r.kind);
      if (rowKind === "published" && publishedVersion === null) {
        publishedVersion = r.version;
      }
      const snap = (r.snapshot ?? {}) as {
        builderTree?: unknown[];
        title?: string;
      };
      return {
        id: r.id,
        kind: rowKind,
        version: r.version,
        createdAt: r.created_at,
        createdBy: r.created_by
          ? profileMap.get(r.created_by) ?? { id: r.created_by, displayName: null }
          : null,
        sectionCount: Array.isArray(snap.builderTree) ? snap.builderTree.length : 0,
        titleAtRevision: typeof snap.title === "string" ? snap.title : null,
        label: null,
      };
    });

    return { ok: true, revisions, pageVersion, publishedVersion };
  } catch (err) {
    logServerError("talentSiteShell/loadShellRevisions", err);
    return { ok: false, error: "Failed to load revisions" };
  }
}
