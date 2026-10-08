"use server";

/**
 * Page title + SEO title + meta description, per language (PR 7).
 *
 * The Website "Pages" rename form loads and saves these through here. Plain
 * columns (`title`, `meta_title`, `meta_description`) hold the PRIMARY
 * language; the `*_i18n` maps (PR 3 columns) hold every language. The plain
 * `title` itself keeps flowing through `renameMaxSitePageAction` (unchanged),
 * this action writes the maps and the two SEO fields.
 *
 * Gates: page text needs `personalSiteEdit`; the SEO pair also needs
 * `personalSiteSeo` (returned as `seoAllowed` so the form hides it).
 */
import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { i18nPair, toI18nMap } from "@/lib/i18n/i18n-columns";
import { loadTalentLocaleSettings } from "@/lib/site-admin/server/talent-locale-settings";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { isPostgrestMissingColumnError, logServerError } from "@/lib/server/safe-error";
import { gate } from "./site-action-gate";
import type { MaxSiteActionResult } from "./site-management-types";

export type MaxSitePageText = {
  primary: string;
  seoAllowed: boolean;
  title: Record<string, string>;
  metaTitle: Record<string, string>;
  metaDescription: Record<string, string>;
};

type Row = {
  title: string | null;
  meta_title: string | null;
  meta_description: string | null;
  title_i18n?: unknown;
  meta_title_i18n?: unknown;
  meta_description_i18n?: unknown;
};

function withPrimary(map: unknown, plain: string | null, primary: string): Record<string, string> {
  return i18nPair(toI18nMap(map), plain ?? "", primary);
}

export async function loadMaxSitePageTextAction(input: {
  pageId: string;
}): Promise<MaxSiteActionResult<MaxSitePageText>> {
  const g = await gate("personalSiteEdit");
  if (!g.ok) return g;
  const sb = await getCachedServerSupabase();
  if (!sb) return { ok: false, code: "server_error", error: "Not configured." };

  const base = "title, meta_title, meta_description";
  let res = await sb
    .from("talent_pages")
    .select(`${base}, title_i18n, meta_title_i18n, meta_description_i18n`)
    .eq("id", input.pageId)
    .eq("talent_profile_id", g.talentProfileId)
    .maybeSingle<Row>();
  if (res.error && isPostgrestMissingColumnError(res.error)) {
    res = await sb
      .from("talent_pages")
      .select(base)
      .eq("id", input.pageId)
      .eq("talent_profile_id", g.talentProfileId)
      .maybeSingle<Row>();
  }
  if (res.error) {
    logServerError("maxSiteManager.pageText.load", res.error);
    return { ok: false, code: "server_error", error: "Could not load the page." };
  }
  if (!res.data) return { ok: false, code: "page_not_found", error: "Page not found." };
  const settings = await loadTalentLocaleSettings(g.talentProfileId);
  const primary = settings.defaultLocale;
  const row = res.data;
  return {
    ok: true,
    data: {
      primary,
      seoAllowed: g.capabilities.personalSiteSeo === true,
      title: withPrimary(row.title_i18n, row.title, primary),
      metaTitle: withPrimary(row.meta_title_i18n, row.meta_title, primary),
      metaDescription: withPrimary(row.meta_description_i18n, row.meta_description, primary),
    },
  };
}

export async function saveMaxSitePageTextAction(input: {
  pageId: string;
  title: Record<string, string>;
  metaTitle?: Record<string, string>;
  metaDescription?: Record<string, string>;
}): Promise<MaxSiteActionResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return { ok: false, code: "not_owner", error: readOnly.error };
  const g = await gate("personalSiteEdit");
  if (!g.ok) return g;
  const sb = await getCachedServerSupabase();
  if (!sb) return { ok: false, code: "server_error", error: "Not configured." };
  const settings = await loadTalentLocaleSettings(g.talentProfileId);
  const primary = settings.defaultLocale;

  const clean = (m: Record<string, string> | undefined) => toI18nMap(m ?? {});
  const title = clean(input.title);
  if (!title[primary]) return { ok: false, code: "invalid_input", error: "Title can't be empty." };

  const patch: Record<string, unknown> = {
    title_i18n: i18nPair(title, title[primary], primary),
    updated_at: new Date().toISOString(),
  };
  const seoAllowed = g.capabilities.personalSiteSeo === true;
  if (seoAllowed && input.metaTitle) {
    const m = clean(input.metaTitle);
    patch.meta_title = m[primary]?.slice(0, 70) ?? null;
    patch.meta_title_i18n = m;
  }
  if (seoAllowed && input.metaDescription) {
    const m = clean(input.metaDescription);
    patch.meta_description = m[primary]?.slice(0, 170) ?? null;
    patch.meta_description_i18n = m;
  }

  const { error, count } = await sb
    .from("talent_pages")
    .update(patch, { count: "exact" })
    .eq("id", input.pageId)
    .eq("talent_profile_id", g.talentProfileId);
  if (error) {
    logServerError("maxSiteManager.pageText.save", error);
    return { ok: false, code: "server_error", error: "Could not save the page." };
  }
  if (!count) return { ok: false, code: "page_not_found", error: "Page not found." };
  return { ok: true };
}
