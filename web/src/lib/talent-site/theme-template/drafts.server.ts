import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { loadMaisonCatalogRow } from "@/lib/talent-site/server/maison-catalog-row";
import { loadThemeVersionPayload } from "@/lib/talent-site/theme-releases/theme-versions.server";
import type { DesignPayload } from "@/lib/talent-site/theme-catalog/types";
import { galleryPaletteLookTokens } from "@/lib/talent-site/theme-catalog/gallery-meta";
import { editorPaletteKey } from "@/lib/talent-site/theme-catalog/design-palettes";
import { canonicalDesignPayload, freezeDesignKeysHook, rekeyOnSave } from "./canonical";
import {
  THEME_DRAFT_COLUMNS,
  applyTokenSplit,
  mapCasResult,
  mapDraftRow,
  splitTokenPatch,
  type ThemeDraftRow,
  minimizePaletteEdits,
} from "./drafts-pure";
import type {
  ThemeDraft,
  ThemeDraftPreview,
  ThemeDraftResult,
  ThemeDraftSaveTokens,
  ThemeDraftSaveTree,
} from "./types";

const TABLE = "talent_theme_drafts";
const STALE = "The draft changed since it was loaded.";

function fail<T>(code: Exclude<ThemeDraftResult<T>, { ok: true }>["code"], error: string): ThemeDraftResult<T> {
  return { ok: false, code, error };
}

async function readOpen(admin: SupabaseClient, design: string): Promise<ThemeDraftResult<ThemeDraft>> {
  const { data, error } = await admin
    .from(TABLE)
    .select(THEME_DRAFT_COLUMNS)
    .eq("design", design)
    .eq("status", "open")
    .maybeSingle();
  if (error) {
    logServerError("themeTemplate.drafts.read", error);
    return fail("error", error.message);
  }
  if (!data) return fail("not_found", "No open draft for this design.");
  return { ok: true, value: mapDraftRow(data as unknown as ThemeDraftRow) };
}

/** The latest known snapshot: the newest talent_theme_versions row, else the catalog row. */
async function latestSnapshot(
  admin: SupabaseClient,
  design: string,
): Promise<{ version: number; payload: DesignPayload } | null> {
  const row = await loadMaisonCatalogRow(admin, "design", design);
  const { data } = await admin
    .from("talent_theme_versions")
    .select("version")
    .eq("design", design)
    .order("version", { ascending: false })
    .limit(1);
  const top = (data as Array<{ version: number }> | null)?.[0]?.version;
  if (typeof top === "number" && (!row || top > row.version)) {
    const payload = await loadThemeVersionPayload(admin, design, top);
    if (payload) return { version: top, payload };
  }
  return row ? { version: row.version, payload: row.payload } : null;
}

export async function loadThemeDraft(admin: SupabaseClient, design: string): Promise<ThemeDraftResult<ThemeDraft>> {
  return readOpen(admin, design);
}

export async function openThemeDraft(
  admin: SupabaseClient,
  design: string,
  actorId: string | null,
): Promise<ThemeDraftResult<ThemeDraft>> {
  const existing = await readOpen(admin, design);
  if (existing.ok || existing.code !== "not_found") return existing;
  const snap = await latestSnapshot(admin, design);
  if (!snap) return fail("not_found", "Unknown design.");
  const payload = freezeDesignKeysHook(canonicalDesignPayload(structuredClone(snap.payload)));
  const { data, error } = await admin
    .from(TABLE)
    .insert({ design, base_version: snap.version, payload, created_by: actorId, updated_by: actorId })
    .select(THEME_DRAFT_COLUMNS)
    .single();
  if (error) {
    // Lost the race to another opener (one open draft per design): return theirs.
    if (error.code === "23505") return readOpen(admin, design);
    logServerError("themeTemplate.drafts.open", error);
    return fail("error", error.message);
  }
  return { ok: true, value: mapDraftRow(data as unknown as ThemeDraftRow) };
}

async function casUpdate(
  admin: SupabaseClient,
  current: ThemeDraft,
  expectedRev: number,
  next: { payload?: DesignPayload; preview?: ThemeDraftPreview },
  actorId: string | null,
): Promise<ThemeDraftResult<ThemeDraft>> {
  const { data, error } = await admin
    .from(TABLE)
    .update({ ...next, rev: expectedRev + 1, updated_by: actorId, updated_at: new Date().toISOString() })
    .eq("id", current.id)
    .eq("rev", expectedRev)
    .eq("status", "open")
    .select(THEME_DRAFT_COLUMNS);
  if (error) logServerError("themeTemplate.drafts.save", error);
  return mapCasResult(data as unknown as ThemeDraftRow[] | null, error);
}

export async function saveThemeDraftTree(
  admin: SupabaseClient,
  input: ThemeDraftSaveTree,
): Promise<ThemeDraftResult<ThemeDraft>> {
  const cur = await readOpen(admin, input.design);
  if (!cur.ok) return cur;
  if (cur.value.rev !== input.expectedRev) return fail("stale_rev", STALE);
  const key = input.tree === "shell" ? "shellTree" : "homeTree";
  const payload = rekeyOnSave(cur.value.payload, canonicalDesignPayload({ ...cur.value.payload, [key]: input.nodes }));
  return casUpdate(admin, cur.value, input.expectedRev, { payload }, input.actorId);
}

/** Replace the whole design payload in one CAS write (code-seed review path). */
export async function saveThemeDraftPayload(
  admin: SupabaseClient,
  input: {
    design: string;
    payload: DesignPayload;
    expectedRev: number;
    actorId: string | null;
  },
): Promise<ThemeDraftResult<ThemeDraft>> {
  const cur = await readOpen(admin, input.design);
  if (!cur.ok) return cur;
  if (cur.value.rev !== input.expectedRev) return fail("stale_rev", STALE);
  const payload = rekeyOnSave(cur.value.payload, freezeDesignKeysHook(canonicalDesignPayload(input.payload)));
  return casUpdate(admin, cur.value, input.expectedRev, { payload }, input.actorId);
}

export async function saveThemeDraftTokens(
  admin: SupabaseClient,
  input: ThemeDraftSaveTokens,
): Promise<ThemeDraftResult<ThemeDraft>> {
  const paletteKey = editorPaletteKey(input.design, input.look ?? null);
  const split = splitTokenPatch(input.patch, paletteKey);
  if (split.invalid.length > 0) return fail("invalid", `Invalid token keys or values: ${split.invalid.join(", ")}`);
  const cur = await readOpen(admin, input.design);
  if (!cur.ok) return cur;
  if (cur.value.rev !== input.expectedRev) return fail("stale_rev", STALE);
  const code = paletteKey ? galleryPaletteLookTokens(input.design, paletteKey) : null;
  const minimal = minimizePaletteEdits(split, cur.value.payload.palettes?.[paletteKey ?? ""], code);
  const next = applyTokenSplit(cur.value.payload, cur.value.preview, minimal);
  return casUpdate(admin, cur.value, input.expectedRev, next, input.actorId);
}

/** Preview-only settings: no rev bump (they never reach the published design). */
export async function savePreviewSettings(
  admin: SupabaseClient,
  input: { design: string; preview: ThemeDraftPreview },
): Promise<ThemeDraftResult<ThemeDraft>> {
  const cur = await readOpen(admin, input.design);
  if (!cur.ok) return cur;
  const preview = { ...cur.value.preview, ...input.preview };
  const { data, error } = await admin
    .from(TABLE)
    .update({ preview, updated_at: new Date().toISOString() })
    .eq("id", cur.value.id)
    .eq("status", "open")
    .select(THEME_DRAFT_COLUMNS);
  if (error) logServerError("themeTemplate.drafts.preview", error);
  return mapCasResult(data as unknown as ThemeDraftRow[] | null, error);
}

export async function discardThemeDraft(
  admin: SupabaseClient,
  design: string,
  actorId: string | null,
): Promise<ThemeDraftResult<null>> {
  const { data, error } = await admin
    .from(TABLE)
    .update({ status: "discarded", updated_by: actorId, updated_at: new Date().toISOString() })
    .eq("design", design)
    .eq("status", "open")
    .select("id");
  if (error) {
    logServerError("themeTemplate.drafts.discard", error);
    return fail("error", error.message);
  }
  if (!data || data.length === 0) return fail("not_found", "No open draft for this design.");
  return { ok: true, value: null };
}
