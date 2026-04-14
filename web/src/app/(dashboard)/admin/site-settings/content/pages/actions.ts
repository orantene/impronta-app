"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { parseWithSchema } from "@/lib/admin/validation";
import {
  buildPublicPathname,
  isValidSlugPath,
  normalizeSlugPath,
} from "@/lib/cms/paths";
import { normalizeHeroJson, type CmsPageSnapshot } from "@/lib/cms/revision-snapshots";
import type { Locale } from "@/i18n/config";
import { requireStaff } from "@/lib/server/action-guards";
import { logServerError } from "@/lib/server/safe-error";

const localeSchema = z.enum(["en", "es"]);
const statusSchema = z.enum(["draft", "published", "archived"]);
const templateSchema = z.enum([
  "standard_page",
  "landing_page",
  "route_backed_meta_only",
  "blog_post",
  "blog_index",
]);

const pageUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  locale: localeSchema,
  slug: z.string().min(1).max(500),
  template_key: templateSchema,
  title: z.string().min(1).max(500),
  status: statusSchema,
  body: z.string().max(500_000).optional().default(""),
  meta_title: z.string().max(500).optional().nullable(),
  meta_description: z.string().max(2000).optional().nullable(),
  og_title: z.string().max(500).optional().nullable(),
  og_description: z.string().max(2000).optional().nullable(),
  og_image_url: z
    .union([z.string().url().max(2000), z.literal("")])
    .optional()
    .nullable(),
  noindex: z.boolean().optional().default(false),
  include_in_sitemap: z.boolean().optional().default(true),
  canonical_url: z
    .union([z.string().url().max(2000), z.literal("")])
    .optional()
    .nullable(),
  create_slug_redirect: z.boolean().optional().default(false),
  previous_slug_path: z.string().max(500).optional().nullable(),
  previous_locale: localeSchema.optional().nullable(),
  /** Persisted with the page row (JSONB); included in revision snapshots. */
  hero: z.record(z.string(), z.unknown()).optional(),
});

export type CmsPageRow = {
  id: string;
  locale: string;
  slug: string;
  template_key: string;
  title: string;
  status: string;
  body: string;
  hero: unknown;
  meta_title: string | null;
  meta_description: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image_url: string | null;
  noindex: boolean;
  include_in_sitemap: boolean;
  canonical_url: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

function emptyToNull(s: string | null | undefined): string | null {
  const t = s?.trim();
  return t ? t : null;
}

function buildPageSnapshotFromSave(args: {
  locale: Locale;
  slugPath: string;
  template_key: string;
  title: string;
  status: "draft" | "published" | "archived";
  body: string;
  hero: Record<string, unknown>;
  meta_title: string | null;
  meta_description: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image_url: string | null;
  noindex: boolean;
  include_in_sitemap: boolean;
  canonical_url: string | null;
}): CmsPageSnapshot {
  return {
    locale: args.locale,
    slug: args.slugPath,
    template_key: args.template_key,
    title: args.title,
    status: args.status,
    body: args.body,
    hero: args.hero,
    meta_title: args.meta_title,
    meta_description: args.meta_description,
    og_title: args.og_title,
    og_description: args.og_description,
    og_image_url: args.og_image_url,
    noindex: args.noindex,
    include_in_sitemap: args.include_in_sitemap,
    canonical_url: args.canonical_url,
  };
}

async function insertCmsPageRevisionRow(
  supabase: SupabaseClient,
  pageId: string,
  kind: "draft" | "published",
  snapshot: CmsPageSnapshot,
  userId: string,
): Promise<void> {
  const { error } = await supabase.from("cms_page_revisions").insert({
    page_id: pageId,
    kind,
    snapshot,
    created_by: userId,
  });
  if (error) logServerError("cms/insertPageRevision", error);
}

export async function saveCmsPage(
  input: unknown,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = parseWithSchema(pageUpsertSchema, input);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  const session = await requireStaff();
  if (!session.ok) return { ok: false, error: session.error };

  const slugPath = normalizeSlugPath(parsed.data.slug);
  if (!isValidSlugPath(slugPath)) {
    return { ok: false, error: "Slug may only use lowercase letters, numbers, hyphens, and slashes." };
  }

  const ogImage = emptyToNull(parsed.data.og_image_url ?? null);

  if (parsed.data.id) {
    const { data: existing, error: loadErr } = await session.supabase
      .from("cms_pages")
      .select("id,status,published_at,hero")
      .eq("id", parsed.data.id)
      .maybeSingle();

    if (loadErr || !existing) {
      logServerError("cms/savePage/load", loadErr);
      return { ok: false, error: "Page not found." };
    }

    const existingHero = normalizeHeroJson(
      (existing as { hero?: unknown }).hero,
    );
    const heroForSave =
      parsed.data.hero !== undefined
        ? normalizeHeroJson(parsed.data.hero)
        : existingHero;

    const row = {
      locale: parsed.data.locale,
      slug: slugPath,
      template_key: parsed.data.template_key,
      title: parsed.data.title.trim(),
      status: parsed.data.status,
      body: parsed.data.body ?? "",
      hero: heroForSave,
      meta_title: emptyToNull(parsed.data.meta_title ?? null),
      meta_description: emptyToNull(parsed.data.meta_description ?? null),
      og_title: emptyToNull(parsed.data.og_title ?? null),
      og_description: emptyToNull(parsed.data.og_description ?? null),
      og_image_url: ogImage,
      noindex: parsed.data.noindex,
      include_in_sitemap: parsed.data.include_in_sitemap,
      canonical_url: emptyToNull(parsed.data.canonical_url ?? null),
      updated_by: session.user.id,
    };

    const publishedAt =
      existing.published_at ??
      (parsed.data.status === "published" ? new Date().toISOString() : null);

    const prevNorm = parsed.data.previous_slug_path
      ? normalizeSlugPath(parsed.data.previous_slug_path)
      : "";
    const prevLocale = parsed.data.previous_locale as Locale | null | undefined;
    const oldPublicPath =
      prevLocale && prevNorm.length > 0 ? buildPublicPathname(prevLocale, prevNorm) : "";
    const newPublicPath = buildPublicPathname(parsed.data.locale, slugPath);
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
        logServerError("cms/savePage/redirect", redirErr);
        return {
          ok: false,
          error:
            redirErr.code === "23505"
              ? "Redirect for the old URL already exists. Remove it or pick a different slug."
              : "Could not create redirect; slug was not changed.",
        };
      }
    }

    const { data: updated, error: upErr } = await session.supabase
      .from("cms_pages")
      .update({
        ...row,
        published_at: publishedAt,
      })
      .eq("id", parsed.data.id)
      .select("id")
      .single();

    if (upErr || !updated) {
      logServerError("cms/savePage/update", upErr);
      return {
        ok: false,
        error: upErr?.code === "23505" ? "Another page already uses this locale + slug." : "Could not save page.",
      };
    }

    const revKind = parsed.data.status === "published" ? "published" : "draft";
    const snapshot = buildPageSnapshotFromSave({
      locale: parsed.data.locale,
      slugPath,
      template_key: parsed.data.template_key,
      title: parsed.data.title.trim(),
      status: parsed.data.status,
      body: parsed.data.body ?? "",
      hero: heroForSave,
      meta_title: row.meta_title,
      meta_description: row.meta_description,
      og_title: row.og_title,
      og_description: row.og_description,
      og_image_url: row.og_image_url,
      noindex: row.noindex,
      include_in_sitemap: row.include_in_sitemap,
      canonical_url: row.canonical_url,
    });
    await insertCmsPageRevisionRow(
      session.supabase,
      updated.id,
      revKind,
      snapshot,
      session.user.id,
    );

    revalidatePath("/admin/site-settings/content/pages");
    revalidatePath("/p", "layout");
    return { ok: true, id: updated.id };
  }

  const heroForInsert =
    parsed.data.hero !== undefined ? normalizeHeroJson(parsed.data.hero) : {};
  const rowInsert = {
    locale: parsed.data.locale,
    slug: slugPath,
    template_key: parsed.data.template_key,
    title: parsed.data.title.trim(),
    status: parsed.data.status,
    body: parsed.data.body ?? "",
    hero: heroForInsert,
    meta_title: emptyToNull(parsed.data.meta_title ?? null),
    meta_description: emptyToNull(parsed.data.meta_description ?? null),
    og_title: emptyToNull(parsed.data.og_title ?? null),
    og_description: emptyToNull(parsed.data.og_description ?? null),
    og_image_url: ogImage,
    noindex: parsed.data.noindex,
    include_in_sitemap: parsed.data.include_in_sitemap,
    canonical_url: emptyToNull(parsed.data.canonical_url ?? null),
    updated_by: session.user.id,
  };

  const publishedAt = parsed.data.status === "published" ? new Date().toISOString() : null;

  const { data: inserted, error: insErr } = await session.supabase
    .from("cms_pages")
    .insert({
      ...rowInsert,
      published_at: publishedAt,
      created_by: session.user.id,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    logServerError("cms/savePage/insert", insErr);
    return {
      ok: false,
      error: insErr?.code === "23505" ? "Another page already uses this locale + slug." : "Could not create page.",
    };
  }

  const revKindIns = parsed.data.status === "published" ? "published" : "draft";
  const snapIns = buildPageSnapshotFromSave({
    locale: parsed.data.locale,
    slugPath,
    template_key: parsed.data.template_key,
    title: parsed.data.title.trim(),
    status: parsed.data.status,
    body: parsed.data.body ?? "",
    hero: heroForInsert,
    meta_title: rowInsert.meta_title,
    meta_description: rowInsert.meta_description,
    og_title: rowInsert.og_title,
    og_description: rowInsert.og_description,
    og_image_url: rowInsert.og_image_url,
    noindex: rowInsert.noindex,
    include_in_sitemap: rowInsert.include_in_sitemap,
    canonical_url: rowInsert.canonical_url,
  });
  await insertCmsPageRevisionRow(
    session.supabase,
    inserted.id,
    revKindIns,
    snapIns,
    session.user.id,
  );

  revalidatePath("/admin/site-settings/content/pages");
  revalidatePath("/p", "layout");
  return { ok: true, id: inserted.id };
}

export async function deleteCmsPage(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireStaff();
  if (!session.ok) return { ok: false, error: session.error };

  const { error } = await session.supabase.from("cms_pages").delete().eq("id", id);
  if (error) {
    logServerError("cms/deletePage", error);
    return { ok: false, error: "Could not delete page." };
  }
  revalidatePath("/admin/site-settings/content/pages");
  return { ok: true };
}

const redirectSchema = z.object({
  old_path: z.string().min(1).max(2000),
  new_path: z.string().min(1).max(2000),
  status_code: z.enum(["301", "302"]),
});

export async function saveCmsRedirect(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = parseWithSchema(redirectSchema, input);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  const session = await requireStaff();
  if (!session.ok) return { ok: false, error: session.error };

  let oldPath = parsed.data.old_path.trim().replace(/\s+/g, "");
  let newPath = parsed.data.new_path.trim().replace(/\s+/g, "");
  if (!oldPath.startsWith("/")) oldPath = `/${oldPath}`;
  if (!newPath.startsWith("/")) newPath = `/${newPath}`;
  if (oldPath === newPath) return { ok: false, error: "Old and new paths must differ." };

  const { error } = await session.supabase.from("cms_redirects").insert({
    old_path: oldPath,
    new_path: newPath,
    status_code: Number(parsed.data.status_code) as 301 | 302,
    active: true,
    created_by: session.user.id,
  });

  if (error) {
    logServerError("cms/saveRedirect", error);
    return {
      ok: false,
      error: error.code === "23505" ? "An active redirect already exists for this old path." : "Could not save redirect.",
    };
  }
  revalidatePath("/admin/site-settings/content/redirects");
  return { ok: true };
}

export async function setCmsRedirectActive(
  id: string,
  active: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireStaff();
  if (!session.ok) return { ok: false, error: session.error };

  const { error } = await session.supabase.from("cms_redirects").update({ active }).eq("id", id);
  if (error) {
    logServerError("cms/setRedirectActive", error);
    return { ok: false, error: "Could not update redirect." };
  }
  revalidatePath("/admin/site-settings/content/redirects");
  return { ok: true };
}
