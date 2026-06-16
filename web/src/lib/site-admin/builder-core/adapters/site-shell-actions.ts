"use server";

/**
 * Production server actions for the site_shell FREEFORM adapter
 * (Builder Studio WS-A A1).
 *
 * These resolve the tenant's DORMANT `site_shell` `cms_pages` row, persist the
 * freeform `builderTree` to its `blocks` column, and publish by baking that
 * draft tree into `published_page_snapshot.builderTree` via the EXISTING
 * `site-shell-publish` write path. They NEVER touch `cms_page_sections` — the
 * dormant slot composition stays intact.
 *
 * GUARDRAIL: these actions are reached ONLY behind `site-shell-flag.ts`
 * (OFF by default). With the flag off NOTHING calls them, and the live
 * header/footer keep rendering through the legacy `PublicHeader` path.
 *
 * "use server" file: every export is an async server action. The non-action
 * binding (`createBoundSiteShellAdapter`) lives in `site-shell-adapter.ts`.
 *
 * Auth = staff of the active tenant (RLS on cms_pages also enforces it).
 * Versioning: pageVersion is derived from `updated_at` (epoch seconds) by the
 * adapter, matching the cms_page / talent_page freeform adapters.
 */

import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas/scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { enforceLockedPropsOnTree } from "@/lib/site-admin/builder-node/prop-lock";
import {
  resolveSnapshotBuilderTree,
} from "@/lib/site-admin/builder-node/snapshot-tree";
import { parseBuilderTreeFromSnapshot } from "@/lib/site-admin/edit-mode/composition-revision-snapshot";
import {
  buildShellRevisionSnapshot,
  nextRevisionVersion,
} from "./site-shell-revision-snapshot";
import type { HomepageSnapshot } from "@/lib/site-admin/server/homepage";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import { republishSiteShellSnapshot } from "@/lib/site-admin/edit-mode/site-shell-publish";
import { revalidateTag } from "next/cache";
import { tagFor } from "@/lib/site-admin/cache-tags";
import { DEFAULT_PLATFORM_LOCALE } from "@/lib/site-admin";
import { isLocale, type Locale } from "@/i18n/config";
import type { SiteShellRow } from "./site-shell-adapter-core";

const SHELL_ROW_COLUMNS =
  "id, title, status, blocks, version, published_at, updated_at, published_page_snapshot";

/**
 * Resolve the next `cms_page_revisions.version` for a page: max existing version
 * + 1 (defaults to 1 for the first revision). Best-effort — a read failure falls
 * back to 1, which never blocks a publish/save (the revision insert is itself
 * best-effort).
 */
async function nextShellRevisionVersion(
  admin: ReturnType<typeof createServiceRoleClient>,
  tenantId: string,
  pageId: string,
): Promise<number> {
  if (!admin) return nextRevisionVersion(0);
  const { data } = await admin
    .from("cms_page_revisions")
    .select("version")
    .eq("tenant_id", tenantId)
    .eq("page_id", pageId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<{ version: number }>();
  return nextRevisionVersion(data?.version);
}

/**
 * A2 follow-up — write a `cms_page_revisions` row for the shell. Best-effort: a
 * failure is swallowed (the shell is already saved/published once the row
 * commits), mirroring `insertPageRevision` in the M3 pages module. Uses the
 * service-role client because the shell row is system-owned.
 */
async function writeShellRevision(input: {
  tenantId: string;
  pageId: string;
  title: string;
  blocks: unknown;
  kind: "draft" | "published" | "rollback";
  actorProfileId: string | null;
}): Promise<void> {
  const admin = createServiceRoleClient();
  if (!admin) return;
  try {
    const version = await nextShellRevisionVersion(
      admin,
      input.tenantId,
      input.pageId,
    );
    await admin.from("cms_page_revisions").insert({
      tenant_id: input.tenantId,
      page_id: input.pageId,
      kind: input.kind,
      version,
      snapshot: buildShellRevisionSnapshot({
        title: input.title,
        blocks: input.blocks,
      }),
      created_by: input.actorProfileId,
    });
  } catch {
    // Non-fatal: the shell is already persisted; a missing revision row only
    // means this checkpoint isn't restorable, never that the save/publish failed.
  }
}

interface RawShellRow {
  id: string;
  title: string;
  status: SiteShellRow["status"];
  blocks: unknown;
  version: number | null;
  published_at: string | null;
  updated_at: string;
  published_page_snapshot: HomepageSnapshot | null;
}

function asLocale(raw?: string): Locale {
  return raw && isLocale(raw) ? raw : DEFAULT_PLATFORM_LOCALE;
}

/**
 * Resolve the tenant's `site_shell` row for (locale). Returns null when the
 * tenant has no shell row (pre-backfill) — callers treat that as "seed it
 * first", never as an error.
 */
export async function loadSiteShellRow(input: {
  locale?: string;
}): Promise<SiteShellRow | null> {
  const auth = await requireStaff();
  if (!auth.ok) return null;
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return null;

  const locale = asLocale(input.locale);
  const { data, error } = await auth.supabase
    .from("cms_pages")
    .select(SHELL_ROW_COLUMNS)
    .eq("tenant_id", scope.tenantId)
    .eq("locale", locale)
    .eq("system_template_key", "site_shell")
    .neq("status", "archived")
    .maybeSingle()
    .returns<RawShellRow>();
  if (error || !data) return null;

  // Resolve the published snapshot's freeform tree (the load fallback when the
  // draft `blocks` are still empty). Belt-and-suspenders: a null/invalid
  // snapshot resolves to an empty tree.
  let snapshotBuilderTree: BuilderNodeTree | null = null;
  const snap = data.published_page_snapshot;
  if (snap && Array.isArray(snap.slots)) {
    snapshotBuilderTree = resolveSnapshotBuilderTree(snap).tree;
  }

  return {
    id: data.id,
    title: data.title,
    status: data.status,
    blocks: data.blocks,
    snapshotBuilderTree,
    version: data.version,
    published_at: data.published_at,
    updated_at: data.updated_at,
  };
}

/**
 * Persist the freeform draft tree to the shell row's `blocks` column. Re-asserts
 * admin prop-locks server-side (C1 trust chokepoint), exactly like the cms_page
 * freeform save. NEVER touches `cms_page_sections`.
 */
export async function saveSiteShellRow(input: {
  pageId: string;
  patch: { blocks: unknown; updated_at: string };
}): Promise<{ ok: true; updatedAt: string } | { ok: false; error: string }> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Select an agency workspace first." };

  // Server-trusted lock enforcement on the full-tree save — re-assert every
  // admin lock against the current blocks so a crafted client can't persist an
  // edit to a locked prop.
  const { data: current } = await auth.supabase
    .from("cms_pages")
    .select("blocks")
    .eq("id", input.pageId)
    .eq("tenant_id", scope.tenantId)
    .eq("system_template_key", "site_shell")
    .maybeSingle()
    .returns<{ blocks: unknown }>();
  const enforcedBlocks = enforceLockedPropsOnTree(
    input.patch.blocks ?? [],
    current?.blocks,
  );

  const { data, error } = await auth.supabase
    .from("cms_pages")
    .update({ blocks: enforcedBlocks, updated_at: input.patch.updated_at })
    .eq("id", input.pageId)
    .eq("tenant_id", scope.tenantId)
    .eq("system_template_key", "site_shell")
    .select("updated_at")
    .maybeSingle()
    .returns<{ updated_at: string }>();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not save the site shell." };
  }
  return { ok: true, updatedAt: data.updated_at };
}

/**
 * Publish the shell: bake the slot snapshot via the EXISTING site-shell-publish
 * path (`republishSiteShellSnapshot`), then overlay the freeform draft `blocks`
 * tree onto the resulting `published_page_snapshot.builderTree` so the dormant
 * `<PublishedShell>` paints the edited tree. The slot rows / `slots[]` are left
 * exactly as the dormant system maintains them — additive overlay only.
 */
export async function publishSiteShellRow(input: {
  pageId: string;
  locale?: string;
}): Promise<
  | { ok: true; publishedAt: string; updatedAt: string }
  | { ok: false; error: string }
> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Select an agency workspace first." };

  const admin = createServiceRoleClient();
  if (!admin) {
    return { ok: false, error: "Server is missing service-role credentials." };
  }

  const locale = asLocale(input.locale);

  // 1. Read the freeform draft tree we're publishing.
  const { data: draftRow } = await admin
    .from("cms_pages")
    .select("blocks")
    .eq("id", input.pageId)
    .eq("tenant_id", scope.tenantId)
    .eq("system_template_key", "site_shell")
    .maybeSingle()
    .returns<{ blocks: unknown }>();
  const draftTree: BuilderNodeTree = Array.isArray(draftRow?.blocks)
    ? (draftRow.blocks as BuilderNodeTree)
    : [];

  // 2. Bake the slot snapshot via the existing site-shell-publish write path.
  const republish = await republishSiteShellSnapshot(admin, {
    tenantId: scope.tenantId,
    locale,
    actorProfileId: auth.user.id,
  });
  if (!republish.ok) return { ok: false, error: republish.error };

  // 3. Overlay the freeform draft tree onto the freshly-baked snapshot so
  //    `<PublishedShell>` renders the edited tree. Read-modify-write the
  //    snapshot's `builderTree` only — `slots[]` + slot rows stay untouched.
  const nowIso = new Date().toISOString();
  if (draftTree.length > 0) {
    const { data: baked } = await admin
      .from("cms_pages")
      .select("published_page_snapshot")
      .eq("id", input.pageId)
      .eq("tenant_id", scope.tenantId)
      .maybeSingle()
      .returns<{ published_page_snapshot: HomepageSnapshot | null }>();
    const snapshot = baked?.published_page_snapshot;
    if (snapshot) {
      const nextSnapshot: HomepageSnapshot = {
        ...snapshot,
        builderTree: draftTree,
      };
      const { error: overlayErr } = await admin
        .from("cms_pages")
        .update({ published_page_snapshot: nextSnapshot, updated_at: nowIso })
        .eq("id", input.pageId)
        .eq("tenant_id", scope.tenantId)
        .eq("system_template_key", "site_shell");
      if (overlayErr) {
        return {
          ok: false,
          error: `Couldn't apply the freeform shell tree: ${overlayErr.message}`,
        };
      }
    }
  }

  // 4. A2 follow-up — snapshot the just-published freeform tree as a restorable
  //    `cms_page_revisions` row (kind=published). Best-effort, never blocks.
  const { data: titleRow } = await admin
    .from("cms_pages")
    .select("title")
    .eq("id", input.pageId)
    .eq("tenant_id", scope.tenantId)
    .maybeSingle()
    .returns<{ title: string }>();
  await writeShellRevision({
    tenantId: scope.tenantId,
    pageId: input.pageId,
    title: titleRow?.title ?? "Site shell",
    blocks: draftTree,
    kind: "published",
    actorProfileId: auth.user.id,
  });

  // 5. Cache-bust public reads — match the dormant backfill/republish paths.
  try {
    revalidateTag(tagFor(scope.tenantId, "pages-all"), "default");
    revalidateTag(tagFor(scope.tenantId, "storefront"), "default");
  } catch {
    // tag system may not be initialised in test contexts.
  }

  return { ok: true, publishedAt: nowIso, updatedAt: nowIso };
}

/**
 * A2 follow-up — restore a saved shell revision's freeform tree back onto the
 * shell row's `blocks` draft. Mirrors `restoreTalentPageRevisionAction`:
 *   - reads the revision's `builderTree` snapshot
 *   - re-asserts admin prop-locks (C1 chokepoint) against the current draft so
 *     restoring an old/pre-lock revision can't drop a lock
 *   - writes the restored tree to the DRAFT `blocks` (status stays as-is — the
 *     operator reviews the restored draft, then presses Publish), and
 *   - mints a fresh `kind='rollback'` revision so the audit trail is complete.
 *
 * Auth = staff of the active tenant (same gate as save/publish). The shell row
 * is system-owned, so the write uses the service-role client.
 */
export async function restoreSiteShellRevisionAction(input: {
  pageId: string;
  revisionId: string;
}): Promise<{ ok: true; updatedAt: string } | { ok: false; error: string }> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Select an agency workspace first." };

  const admin = createServiceRoleClient();
  if (!admin) {
    return { ok: false, error: "Server is missing service-role credentials." };
  }

  // 1. Read the revision's snapshot (scoped to tenant + page).
  const { data: rev, error: revErr } = await admin
    .from("cms_page_revisions")
    .select("snapshot")
    .eq("id", input.revisionId)
    .eq("tenant_id", scope.tenantId)
    .eq("page_id", input.pageId)
    .maybeSingle()
    .returns<{ snapshot: unknown }>();
  if (revErr || !rev) {
    return { ok: false, error: revErr?.message ?? "Shell revision not found." };
  }
  const restoredTree =
    parseBuilderTreeFromSnapshot(rev.snapshot) ?? [];

  // 2. Re-assert current locks onto the restored content (C1) against the live
  //    draft, so restoring a pre-lock/tampered revision can't drop an admin lock.
  const { data: current } = await admin
    .from("cms_pages")
    .select("blocks, title")
    .eq("id", input.pageId)
    .eq("tenant_id", scope.tenantId)
    .eq("system_template_key", "site_shell")
    .maybeSingle()
    .returns<{ blocks: unknown; title: string }>();
  const enforced = enforceLockedPropsOnTree(restoredTree, current?.blocks);

  // 3. Write the restored tree back to the DRAFT blocks.
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("cms_pages")
    .update({ blocks: enforced, updated_at: nowIso })
    .eq("id", input.pageId)
    .eq("tenant_id", scope.tenantId)
    .eq("system_template_key", "site_shell")
    .select("updated_at")
    .maybeSingle()
    .returns<{ updated_at: string }>();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not restore the shell revision." };
  }

  // 4. Mint a rollback revision for the audit trail (best-effort).
  await writeShellRevision({
    tenantId: scope.tenantId,
    pageId: input.pageId,
    title: current?.title ?? "Site shell",
    blocks: enforced,
    kind: "rollback",
    actorProfileId: auth.user.id,
  });

  return { ok: true, updatedAt: data.updated_at };
}
