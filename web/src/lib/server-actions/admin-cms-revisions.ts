"use server";

import { buildPostPublicPathname, buildPublicPathname } from "@/lib/cms/paths";
import { localeUrlSettings } from "@/i18n/pathnames";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import {
  parseCmsPageSnapshot,
  parseCmsPostSnapshot,
  type CmsPageSnapshot,
  type CmsPostSnapshot,
} from "@/lib/cms/revision-snapshots";
import type { Locale } from "@/i18n/config";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import { pgUuidSchema } from "@/lib/site-admin/validators";

export type CmsRevisionListItem = {
  id: string;
  kind: "draft" | "published";
  created_at: string;
  created_by: string | null;
};

const uuid = pgUuidSchema();

export async function listCmsPageRevisions(
  pageId: string,
): Promise<{ ok: true; items: CmsRevisionListItem[] } | { ok: false; error: string }> {
  const idParsed = uuid.safeParse(pageId);
  if (!idParsed.success) return { ok: false, error: "Invalid page." };

  const session = await requireWorkspaceStaffAction();
  if (!session.ok) return { ok: false, error: session.error };
  const { tenantId } = session;

  const { data, error } = await session.supabase
    .from("cms_page_revisions")
    .select("id, kind, created_at, created_by")
    .eq("page_id", pageId)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    logServerError("cms/listPageRevisions", error);
    return { ok: false, error: "Could not load revisions." };
  }

  return {
    ok: true,
    items: (data ?? []) as CmsRevisionListItem[],
  };
}

export async function listCmsPostRevisions(
  postId: string,
): Promise<{ ok: true; items: CmsRevisionListItem[] } | { ok: false; error: string }> {
  const idParsed = uuid.safeParse(postId);
  if (!idParsed.success) return { ok: false, error: "Invalid post." };

  const session = await requireWorkspaceStaffAction();
  if (!session.ok) return { ok: false, error: session.error };
  const { tenantId } = session;

  const { data, error } = await session.supabase
    .from("cms_post_revisions")
    .select("id, kind, created_at, created_by")
    .eq("post_id", postId)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    logServerError("cms/listPostRevisions", error);
    return { ok: false, error: "Could not load revisions." };
  }

  return {
    ok: true,
    items: (data ?? []) as CmsRevisionListItem[],
  };
}

export type RestorePageRevisionResult =
  | {
      ok: true;
      snapshot: CmsPageSnapshot;
      /** If set, restoring into the editor would use a different public URL than the live row. */
      publicUrlChange: { fromPath: string; toPath: string } | null;
    }
  | { ok: false; error: string };

export async function getCmsPageRevisionForRestore(input: {
  pageId: string;
  revisionId: string;
  /** Live slug path + locale at editor load (before restore). */
  liveSlug: string;
  liveLocale: Locale;
}): Promise<RestorePageRevisionResult> {
  const session = await requireWorkspaceStaffAction();
  if (!session.ok) return { ok: false, error: session.error };
  const { tenantId } = session;

  const pageId = uuid.safeParse(input.pageId);
  const revisionId = uuid.safeParse(input.revisionId);
  if (!pageId.success || !revisionId.success) {
    return { ok: false, error: "Invalid id." };
  }

  const { data, error } = await session.supabase
    .from("cms_page_revisions")
    .select("snapshot, page_id")
    .eq("id", input.revisionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error || !data || data.page_id !== input.pageId) {
    if (error) logServerError("cms/getPageRevision", error);
    return { ok: false, error: "Revision not found." };
  }

  const snapshot = parseCmsPageSnapshot(data.snapshot);
  if (!snapshot) return { ok: false, error: "Invalid revision snapshot." };

  // The "public URL will change" hint must use THIS tenant's URL grammar, or an
  // es-default workspace is told its Spanish page lives at `/es/p/...` when the
  // real canonical is `/p/...`.
  const tenantLocales = await loadTenantLocaleSettings(tenantId);
  const urlSettings = localeUrlSettings(
    tenantLocales.defaultLocale,
    tenantLocales.supportedLocales,
  );
  const livePath = buildPublicPathname(input.liveLocale, input.liveSlug, urlSettings);
  const revisionPath = buildPublicPathname(
    snapshot.locale,
    snapshot.slug,
    urlSettings,
  );
  const publicUrlChange =
    livePath !== revisionPath ? { fromPath: livePath, toPath: revisionPath } : null;

  return { ok: true, snapshot, publicUrlChange };
}

export type RestorePostRevisionResult =
  | {
      ok: true;
      snapshot: CmsPostSnapshot;
      publicUrlChange: { fromPath: string; toPath: string } | null;
    }
  | { ok: false; error: string };

export async function getCmsPostRevisionForRestore(input: {
  postId: string;
  revisionId: string;
  liveSlug: string;
  liveLocale: Locale;
}): Promise<RestorePostRevisionResult> {
  const session = await requireWorkspaceStaffAction();
  if (!session.ok) return { ok: false, error: session.error };
  const { tenantId } = session;

  const pageId = uuid.safeParse(input.postId);
  const revisionId = uuid.safeParse(input.revisionId);
  if (!pageId.success || !revisionId.success) {
    return { ok: false, error: "Invalid id." };
  }

  const { data, error } = await session.supabase
    .from("cms_post_revisions")
    .select("snapshot, post_id")
    .eq("id", input.revisionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error || !data || data.post_id !== input.postId) {
    if (error) logServerError("cms/getPostRevision", error);
    return { ok: false, error: "Revision not found." };
  }

  const snapshot = parseCmsPostSnapshot(data.snapshot);
  if (!snapshot) return { ok: false, error: "Invalid revision snapshot." };

  const tenantLocales = await loadTenantLocaleSettings(tenantId);
  const urlSettings = localeUrlSettings(
    tenantLocales.defaultLocale,
    tenantLocales.supportedLocales,
  );
  const livePath = buildPostPublicPathname(
    input.liveLocale,
    input.liveSlug,
    urlSettings,
  );
  const revisionPath = buildPostPublicPathname(
    snapshot.locale,
    snapshot.slug,
    urlSettings,
  );
  const publicUrlChange =
    livePath !== revisionPath ? { fromPath: livePath, toPath: revisionPath } : null;

  return { ok: true, snapshot, publicUrlChange };
}
