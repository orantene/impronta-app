"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { parseWithSchema } from "@/lib/admin/validation";
import {
  buildPostPublicPathname,
  isValidSlugPath,
  normalizeSlugPath,
} from "@/lib/cms/paths";
import { type CmsPostSnapshot } from "@/lib/cms/revision-snapshots";
import type { Locale } from "@/i18n/config";
import { requireStaff } from "@/lib/server/action-guards";
import { logServerError } from "@/lib/server/safe-error";

const localeSchema = z.enum(["en", "es"]);
const statusSchema = z.enum(["draft", "published", "archived"]);

const postUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  locale: localeSchema,
  slug: z.string().min(1).max(500),
  title: z.string().min(1).max(500),
  excerpt: z.string().max(20_000).optional().default(""),
  body: z.string().max(500_000).optional().default(""),
  status: statusSchema,
  meta_title: z.string().max(500).optional().nullable(),
  meta_description: z.string().max(2000).optional().nullable(),
  og_image_url: z
    .union([z.string().url().max(2000), z.literal("")])
    .optional()
    .nullable(),
  noindex: z.boolean().optional().default(false),
  include_in_sitemap: z.boolean().optional().default(true),
  create_slug_redirect: z.boolean().optional().default(false),
  previous_slug: z.string().max(500).optional().nullable(),
  previous_locale: localeSchema.optional().nullable(),
});

export type CmsPostRow = {
  id: string;
  locale: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  status: string;
  meta_title: string | null;
  meta_description: string | null;
  og_image_url: string | null;
  noindex: boolean;
  include_in_sitemap: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

function emptyToNull(s: string | null | undefined): string | null {
  const t = s?.trim();
  return t ? t : null;
}

function buildPostSnapshotFromSave(args: {
  locale: Locale;
  slugPath: string;
  title: string;
  excerpt: string;
  body: string;
  status: "draft" | "published" | "archived";
  meta_title: string | null;
  meta_description: string | null;
  og_image_url: string | null;
  noindex: boolean;
  include_in_sitemap: boolean;
}): CmsPostSnapshot {
  return {
    locale: args.locale,
    slug: args.slugPath,
    title: args.title,
    excerpt: args.excerpt,
    body: args.body,
    status: args.status,
    meta_title: args.meta_title,
    meta_description: args.meta_description,
    og_image_url: args.og_image_url,
    noindex: args.noindex,
    include_in_sitemap: args.include_in_sitemap,
  };
}

async function insertCmsPostRevisionRow(
  supabase: SupabaseClient,
  postId: string,
  kind: "draft" | "published",
  snapshot: CmsPostSnapshot,
  userId: string,
): Promise<void> {
  const { error } = await supabase.from("cms_post_revisions").insert({
    post_id: postId,
    kind,
    snapshot,
    created_by: userId,
  });
  if (error) logServerError("cms/insertPostRevision", error);
}

export async function saveCmsPost(
  input: unknown,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = parseWithSchema(postUpsertSchema, input);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  const session = await requireStaff();
  if (!session.ok) return { ok: false, error: session.error };

  const slugPath = normalizeSlugPath(parsed.data.slug);
  if (!isValidSlugPath(slugPath) || slugPath.includes("/")) {
    return {
      ok: false,
      error: "Slug must be a single segment: lowercase letters, numbers, and hyphens.",
    };
  }

  const ogImage = emptyToNull(parsed.data.og_image_url ?? null);
  const row = {
    locale: parsed.data.locale,
    slug: slugPath,
    title: parsed.data.title.trim(),
    excerpt: parsed.data.excerpt ?? "",
    body: parsed.data.body ?? "",
    status: parsed.data.status,
    meta_title: emptyToNull(parsed.data.meta_title ?? null),
    meta_description: emptyToNull(parsed.data.meta_description ?? null),
    og_image_url: ogImage,
    noindex: parsed.data.noindex,
    include_in_sitemap: parsed.data.include_in_sitemap,
    updated_by: session.user.id,
  };

  if (parsed.data.id) {
    const { data: existing, error: loadErr } = await session.supabase
      .from("cms_posts")
      .select("id,status,published_at,slug,locale")
      .eq("id", parsed.data.id)
      .maybeSingle();

    if (loadErr || !existing) {
      logServerError("cms/savePost/load", loadErr);
      return { ok: false, error: "Post not found." };
    }

    const publishedAt =
      existing.published_at ??
      (parsed.data.status === "published" ? new Date().toISOString() : null);

    const prevSlugNorm = parsed.data.previous_slug
      ? normalizeSlugPath(parsed.data.previous_slug)
      : "";
    const prevLocale = parsed.data.previous_locale as Locale | null | undefined;
    const oldPublicPath =
      prevLocale && prevSlugNorm.length > 0
        ? buildPostPublicPathname(prevLocale, prevSlugNorm)
        : "";
    const newPublicPath = buildPostPublicPathname(parsed.data.locale, slugPath);
    const shouldInsertSlugRedirect =
      Boolean(parsed.data.create_slug_redirect) &&
      oldPublicPath.length > 0 &&
      oldPublicPath !== newPublicPath &&
      existing.status === "published" &&
      parsed.data.status === "published";

    if (shouldInsertSlugRedirect) {
      const { error: redirErr } = await session.supabase.from("cms_redirects").insert({
        old_path: oldPublicPath,
        new_path: newPublicPath,
        status_code: 301,
        active: true,
        created_by: session.user.id,
      });
      if (redirErr) {
        logServerError("cms/savePost/redirect", redirErr);
        return {
          ok: false,
          error:
            redirErr.code === "23505"
              ? "Redirect for the old URL already exists. Remove it or pick a different slug."
              : "Could not create redirect; slug was not changed.",
        };
      }
      revalidatePath("/admin/site-settings/content/redirects");
    }

    const { data: updated, error: upErr } = await session.supabase
      .from("cms_posts")
      .update({
        ...row,
        published_at: publishedAt,
      })
      .eq("id", parsed.data.id)
      .select("id")
      .single();

    if (upErr || !updated) {
      logServerError("cms/savePost/update", upErr);
      return {
        ok: false,
        error: upErr?.code === "23505" ? "Another post already uses this locale + slug." : "Could not save post.",
      };
    }

    const revKind = parsed.data.status === "published" ? "published" : "draft";
    const snapshot = buildPostSnapshotFromSave({
      locale: parsed.data.locale,
      slugPath,
      title: parsed.data.title.trim(),
      excerpt: parsed.data.excerpt ?? "",
      body: parsed.data.body ?? "",
      status: parsed.data.status,
      meta_title: row.meta_title,
      meta_description: row.meta_description,
      og_image_url: row.og_image_url,
      noindex: row.noindex,
      include_in_sitemap: row.include_in_sitemap,
    });
    await insertCmsPostRevisionRow(
      session.supabase,
      updated.id,
      revKind,
      snapshot,
      session.user.id,
    );

    revalidatePath("/admin/site-settings/content/posts");
    revalidatePath("/posts", "layout");
    return { ok: true, id: updated.id };
  }

  const publishedAt = parsed.data.status === "published" ? new Date().toISOString() : null;

  const { data: inserted, error: insErr } = await session.supabase
    .from("cms_posts")
    .insert({
      ...row,
      published_at: publishedAt,
      created_by: session.user.id,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    logServerError("cms/savePost/insert", insErr);
    return {
      ok: false,
      error: insErr?.code === "23505" ? "Another post already uses this locale + slug." : "Could not create post.",
    };
  }

  const revKindIns = parsed.data.status === "published" ? "published" : "draft";
  const snapIns = buildPostSnapshotFromSave({
    locale: parsed.data.locale,
    slugPath,
    title: parsed.data.title.trim(),
    excerpt: parsed.data.excerpt ?? "",
    body: parsed.data.body ?? "",
    status: parsed.data.status,
    meta_title: row.meta_title,
    meta_description: row.meta_description,
    og_image_url: row.og_image_url,
    noindex: row.noindex,
    include_in_sitemap: row.include_in_sitemap,
  });
  await insertCmsPostRevisionRow(
    session.supabase,
    inserted.id,
    revKindIns,
    snapIns,
    session.user.id,
  );

  revalidatePath("/admin/site-settings/content/posts");
  revalidatePath("/posts", "layout");
  return { ok: true, id: inserted.id };
}

export async function deleteCmsPost(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireStaff();
  if (!session.ok) return { ok: false, error: session.error };

  const { error } = await session.supabase.from("cms_posts").delete().eq("id", id);
  if (error) {
    logServerError("cms/deletePost", error);
    return { ok: false, error: "Could not delete post." };
  }
  revalidatePath("/admin/site-settings/content/posts");
  revalidatePath("/posts", "layout");
  return { ok: true };
}
