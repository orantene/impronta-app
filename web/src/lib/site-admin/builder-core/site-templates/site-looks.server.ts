/**
 * site-looks.server.ts — the `site_looks` table (migration 20260916000356).
 * One Look = one row = one JSON (D-TPL-5).
 *
 *   syncBuiltinLooks   code → rows (source=builtin, published); idempotent,
 *                      mirrors import-builtin-starters.ts for page designs.
 *   importLook         a validated PortableLook → a draft row (source=imported);
 *                      a built-in id is refused (edit the code, then sync).
 *   listSiteLooks      admin listing for the Lab.
 *   loadLookBySlug     runtime read: code first, then a PUBLISHED row.
 *
 * Callers gate with isPlatformAdmin; these functions take the service role
 * client and never look at the session.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

import { LOOKS, getLook } from "./looks";
import { parsePortableLook, toPortableLook, type PortableLook } from "./portable-look";
import type { Look } from "./types";

export interface SiteLookRow {
  id: string;
  slug: string;
  title_es: string;
  title_en: string;
  axis_es: string;
  axis_en: string;
  source: "builtin" | "imported" | "authored";
  status: "draft" | "published" | "archived";
  version: number;
  updated_at: string;
}

const LIST_COLS = "id, slug, title_es, title_en, axis_es, axis_en, source, status, version, updated_at";

function rowFromPortable(p: PortableLook, source: SiteLookRow["source"], status: SiteLookRow["status"], userId: string | null) {
  return {
    slug: p.id,
    title_es: p.title.es,
    title_en: p.title.en,
    axis_es: p.axis.es,
    axis_en: p.axis.en,
    theme_patch: p.themePatch,
    shell: p.shell,
    pages: p.pages,
    copy: p.copy,
    source,
    status,
    created_by: userId,
  };
}

export async function syncBuiltinLooks(admin: SupabaseClient, userId: string | null): Promise<{ ok: true; created: number; updated: number } | { ok: false; error: string }> {
  const { data: existing, error } = await admin.from("site_looks").select("id, slug, version").in("slug", LOOKS.map((l) => l.id));
  if (error) return { ok: false, error: error.message };
  const bySlug = new Map((existing ?? []).map((r) => [(r as { slug: string }).slug, r as { id: string; slug: string; version: number }]));
  let created = 0;
  let updated = 0;
  for (const look of LOOKS) {
    const row = rowFromPortable(toPortableLook(look), "builtin", "published", userId);
    const hit = bySlug.get(look.id);
    if (hit) {
      const { error: upErr } = await admin.from("site_looks").update({ ...row, version: hit.version + 1 } as never).eq("id", hit.id);
      if (upErr) return { ok: false, error: `${look.id}: ${upErr.message}` };
      updated += 1;
    } else {
      const { error: insErr } = await admin.from("site_looks").insert(row as never);
      if (insErr) return { ok: false, error: `${look.id}: ${insErr.message}` };
      created += 1;
    }
  }
  return { ok: true, created, updated };
}

export async function importLook(admin: SupabaseClient, input: unknown, userId: string | null): Promise<{ ok: true; id: string; slug: string } | { ok: false; reasons: string[] }> {
  const parsed = parsePortableLook(input);
  if (!parsed.ok) return parsed;
  if (parsed.builtIn) return { ok: false, reasons: [`"${parsed.look.id}" is a built-in Look; change the id to import a variant, or edit the code and sync.`] };
  const { data: existing, error: readErr } = await admin.from("site_looks").select("id").eq("slug", parsed.look.id).maybeSingle<{ id: string }>();
  if (readErr) return { ok: false, reasons: [readErr.message] };
  const row = rowFromPortable(parsed.look, "imported", "draft", userId);
  if (existing) {
    const { error } = await admin.from("site_looks").update(row as never).eq("id", existing.id);
    if (error) return { ok: false, reasons: [error.message] };
    return { ok: true, id: existing.id, slug: parsed.look.id };
  }
  const { data, error } = await admin.from("site_looks").insert(row as never).select("id").single<{ id: string }>();
  if (error || !data) return { ok: false, reasons: [error?.message ?? "insert failed"] };
  return { ok: true, id: data.id, slug: parsed.look.id };
}

export async function setLookStatus(admin: SupabaseClient, id: string, status: SiteLookRow["status"]): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await admin.from("site_looks").update({ status } as never).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function listSiteLooks(admin: SupabaseClient): Promise<SiteLookRow[]> {
  const { data, error } = await admin.from("site_looks").select(LIST_COLS).order("source").order("slug");
  if (error) {
    logServerError("site-looks.list", error);
    return [];
  }
  return (data ?? []) as unknown as SiteLookRow[];
}

/** Code wins for built-ins (the source of truth); published rows serve imported Looks. */
export async function loadLookBySlug(admin: SupabaseClient, slug: string): Promise<Look | null> {
  const builtin = getLook(slug);
  if (builtin) return builtin;
  const { data, error } = await admin
    .from("site_looks")
    .select("slug, title_es, title_en, axis_es, axis_en, theme_patch, shell, pages, copy")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle<{ slug: string; title_es: string; title_en: string; axis_es: string; axis_en: string; theme_patch: Record<string, string>; shell: Look["shell"]; pages: Look["pages"]; copy: Look["copy"] }>();
  if (error) {
    logServerError("site-looks.load", error);
    return null;
  }
  if (!data) return null;
  const parsed = parsePortableLook({ kind: "look", version: 1, id: data.slug, title: { es: data.title_es, en: data.title_en }, axis: { es: data.axis_es, en: data.axis_en }, themePatch: data.theme_patch, shell: data.shell, pages: data.pages, copy: data.copy });
  if (!parsed.ok) return null; // a row that no longer validates never reaches a page
  return { id: parsed.look.id as Look["id"], title: parsed.look.title, axis: parsed.look.axis, themePatch: parsed.look.themePatch, shell: parsed.look.shell, pages: parsed.look.pages, copy: parsed.look.copy };
}
