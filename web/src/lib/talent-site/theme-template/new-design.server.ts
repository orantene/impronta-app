import "server-only";

/**
 * "Save as new design" (Template Factory S13). Copies the design being
 * edited into a NEW talent design: catalog row (kind design, source
 * authored, status DRAFT so it is hidden from talents), snapshot v1, and an
 * open editor draft at base_version 1. TALENT designs only.
 *
 * HIDDEN: the row is written `status: 'draft'`. Every talent read path
 * already requires `published` (RLS policy talent_theme_catalog_published_read,
 * the gallery listing `.eq("status","published")`, loadMaisonCatalogRow).
 * Releasing it later is a status flip by the release flow, not done here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { COLLECTION_DESIGNS } from "@/lib/talent-site/theme-catalog/collection/designs";
import {
  TALENT_THEME_SCHEMA_VERSION,
  type DesignPayload,
  type TalentThemeRequiredTier,
  type TalentThemeDesignRow,
  type ThemePreview,
} from "@/lib/talent-site/theme-catalog/types";
import { validateDesign } from "@/lib/talent-site/theme-catalog/validate";
import { coerceCatalogRow, CATALOG_ROW_COLUMNS } from "@/lib/talent-site/server/theme-catalog-row";
import { maisonBuiltinRow } from "@/lib/talent-site/server/maison-catalog-row";

import { ensureDesignKeys } from "@/lib/talent-site/theme-releases/design-keys";
import { loadThemeDraft, openThemeDraft } from "./drafts.server";
import { authoredPreview, copyDesignPayload, deriveUniqueDesignSlug } from "./new-design.pure";
import { themeTemplateEditHref } from "./types";

export interface CreateDesignInput {
  sourceDesign: string;
  name: { en: string; es: string };
  actorId: string | null;
}

export type CreateDesignResult =
  | { ok: true; slug: string; href: string }
  | { ok: false; code: "invalid" | "not_found" | "error"; error: string };

export interface CreateDesignDeps {
  /** The source payload (open editor draft, else latest snapshot). */
  loadSource?: (admin: SupabaseClient, design: string) => Promise<{ payload: DesignPayload; tier: TalentThemeRequiredTier; paletteSource: string } | null>;
  /** Default: S3 `openThemeDraft`. */
  openDraft?: (admin: SupabaseClient, design: string, actorId: string | null) => Promise<{ ok: true } | { ok: false; error: string }>;
}

/** Any status, source authored: for the admin-only preview of a hidden design. */
export async function loadAuthoredDesignRow(admin: SupabaseClient, slug: string): Promise<TalentThemeDesignRow | null> {
  const { data, error } = await admin
    .from("talent_theme_catalog")
    .select(CATALOG_ROW_COLUMNS)
    .eq("kind", "design")
    .eq("slug", slug)
    .eq("source", "authored")
    .maybeSingle();
  if (error || !data) return null;
  const row = coerceCatalogRow(data);
  return row && row.kind === "design" ? row : null;
}

async function defaultLoadSource(admin: SupabaseClient, design: string) {
  const draft = await loadThemeDraft(admin, design);
  const { data: cat } = await admin
    .from("talent_theme_catalog")
    .select("payload, required_talent_tier, preview, source")
    .eq("kind", "design")
    .eq("slug", design)
    .maybeSingle();
  const builtin = maisonBuiltinRow("design", design);
  const payload = ((draft.ok ? draft.value.payload : null) ?? cat?.payload ?? builtin?.payload) as DesignPayload | undefined;
  if (!payload) return null;
  const preview = (cat?.preview ?? {}) as ThemePreview;
  return {
    payload,
    tier: ((cat?.required_talent_tier as TalentThemeRequiredTier | undefined) ?? builtin?.required_talent_tier ?? "talent_portfolio"),
    paletteSource: preview.paletteSource ?? design,
  };
}

async function defaultOpenDraft(admin: SupabaseClient, design: string, actorId: string | null) {
  const res = await openThemeDraft(admin, design, actorId);
  return res.ok ? ({ ok: true } as const) : ({ ok: false, error: res.error } as const);
}

export async function createDesignFromDraft(
  admin: SupabaseClient,
  input: CreateDesignInput,
  deps: CreateDesignDeps = {},
): Promise<CreateDesignResult> {
  const en = input.name.en.trim();
  const es = input.name.es.trim();
  if (!en || !es || en.length > 80 || es.length > 80) {
    return { ok: false, code: "invalid", error: "Both names are required (80 characters max)." };
  }
  const source = await (deps.loadSource ?? defaultLoadSource)(admin, input.sourceDesign);
  if (!source) return { ok: false, code: "not_found", error: "Source design not found." };

  const { data: rows, error: listErr } = await admin.from("talent_theme_catalog").select("slug").eq("kind", "design");
  if (listErr) {
    logServerError("newDesign.listSlugs", listErr);
    return { ok: false, code: "error", error: "Could not check existing designs." };
  }
  const taken = [...(rows ?? []).map((r) => r.slug as string), ...COLLECTION_DESIGNS.map((d) => d.slug)];
  const slug = deriveUniqueDesignSlug(en, taken);

  let payload = copyDesignPayload(source.payload);
  payload = ensureDesignKeys(null, payload);
  const check = validateDesign(payload);
  if (!check.ok) return { ok: false, code: "invalid", error: check.errors.join("; ") };

  const catalogRow = {
    kind: "design",
    slug,
    title: en,
    summary: "",
    category: null,
    tags: [] as string[],
    payload,
    preview: authoredPreview({ en, es }, source.paletteSource),
    required_talent_tier: source.tier,
    status: "draft",
    source: "authored",
    version: 1,
    schema_version: TALENT_THEME_SCHEMA_VERSION,
    sort_order: 1000,
    created_by: input.actorId,
    updated_by: input.actorId,
  };
  const { error: insErr } = await admin.from("talent_theme_catalog").insert(catalogRow as never);
  if (insErr) {
    logServerError("newDesign.insertCatalog", insErr);
    return { ok: false, code: "error", error: "Could not create the design." };
  }
  const rollback = async () => {
    await admin.from("talent_theme_versions").delete().eq("design", slug);
    await admin.from("talent_theme_catalog").delete().eq("kind", "design").eq("slug", slug).eq("status", "draft");
  };
  const { error: verErr } = await admin
    .from("talent_theme_versions")
    .insert({ design: slug, version: 1, payload, source: "authored" } as never);
  if (verErr) {
    logServerError("newDesign.insertVersion", verErr);
    await rollback();
    return { ok: false, code: "error", error: "Could not create the design." };
  }
  const opened = await (deps.openDraft ?? defaultOpenDraft)(admin, slug, input.actorId);
  if (!opened.ok) {
    logServerError("newDesign.openDraft", new Error(opened.error));
    await rollback();
    return { ok: false, code: "error", error: "Could not open the new design in the editor." };
  }
  return { ok: true, slug, href: themeTemplateEditHref(slug) };
}
