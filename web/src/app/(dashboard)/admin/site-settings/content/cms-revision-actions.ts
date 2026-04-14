"use server";

import { z } from "zod";

import { buildPostPublicPathname, buildPublicPathname } from "@/lib/cms/paths";
import {
  parseCmsPageSnapshot,
  parseCmsPostSnapshot,
  type CmsPageSnapshot,
  type CmsPostSnapshot,
} from "@/lib/cms/revision-snapshots";
import type { Locale } from "@/i18n/config";
import { requireStaff } from "@/lib/server/action-guards";
import { logServerError } from "@/lib/server/safe-error";

export type CmsRevisionListItem = {
  id: string;
  kind: "draft" | "published";
  created_at: string;
  created_by: string | null;
};

const uuid = z.string().uuid();

export async function listCmsPageRevisions(
  pageId: string,
): Promise<{ ok: true; items: CmsRevisionListItem[] } | { ok: false; error: string }> {
  const idParsed = uuid.safeParse(pageId);
  if (!idParsed.success) return { ok: false, error: "Invalid page." };

  const session = await requireStaff();
  if (!session.ok) return { ok: false, error: session.error };

  const { data, error } = await session.supabase
    .from("cms_page_revisions")
    .select("id, kind, created_at, created_by")
    .eq("page_id", pageId)
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

  const session = await requireStaff();
  if (!session.ok) return { ok: false, error: session.error };

  const { data, error } = await session.supabase
    .from("cms_post_revisions")
    .select("id, kind, created_at, created_by")
    .eq("post_id", postId)
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
  const session = await requireStaff();
  if (!session.ok) return { ok: false, error: session.error };

  const pageId = uuid.safeParse(input.pageId);
  const revisionId = uuid.safeParse(input.revisionId);
  if (!pageId.success || !revisionId.success) {
    return { ok: false, error: "Invalid id." };
  }

  const { data, error } = await session.supabase
    .from("cms_page_revisions")
    .select("snapshot, page_id")
    .eq("id", input.revisionId)
    .maybeSingle();

  if (error || !data || data.page_id !== input.pageId) {
    if (error) logServerError("cms/getPageRevision", error);
    return { ok: false, error: "Revision not found." };
  }

  const snapshot = parseCmsPageSnapshot(data.snapshot);
  if (!snapshot) return { ok: false, error: "Invalid revision snapshot." };

  const livePath = buildPublicPathname(input.liveLocale, input.liveSlug);
  const revisionPath = buildPublicPathname(snapshot.locale, snapshot.slug);
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
  const session = await requireStaff();
  if (!session.ok) return { ok: false, error: session.error };

  const pageId = uuid.safeParse(input.postId);
  const revisionId = uuid.safeParse(input.revisionId);
  if (!pageId.success || !revisionId.success) {
    return { ok: false, error: "Invalid id." };
  }

  const { data, error } = await session.supabase
    .from("cms_post_revisions")
    .select("snapshot, post_id")
    .eq("id", input.revisionId)
    .maybeSingle();

  if (error || !data || data.post_id !== input.postId) {
    if (error) logServerError("cms/getPostRevision", error);
    return { ok: false, error: "Revision not found." };
  }

  const snapshot = parseCmsPostSnapshot(data.snapshot);
  if (!snapshot) return { ok: false, error: "Invalid revision snapshot." };

  const livePath = buildPostPublicPathname(input.liveLocale, input.liveSlug);
  const revisionPath = buildPostPublicPathname(snapshot.locale, snapshot.slug);
  const publicUrlChange =
    livePath !== revisionPath ? { fromPath: livePath, toPath: revisionPath } : null;

  return { ok: true, snapshot, publicUrlChange };
}
