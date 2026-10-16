import "server-only";

/**
 * TUL-404: create the first (draft) release of a design that has none. Reads
 * fail closed: a failed count must never look like "no releases yet". The one
 * write is `createDraftRelease` (idempotent on design + version). The caller
 * gates on platform admin.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadMaisonCatalogRow } from "../server/maison-catalog-row";
import { planFirstRelease } from "./first-release";
import { collectSites } from "./manager/release-manager.server";
import { createDraftRelease } from "./releases.server";

export async function createFirstRelease(
  admin: SupabaseClient,
  input: { design: string; actorId: string | null },
): Promise<{ ok: true; releaseId: string; version: number } | { ok: false; error: string; errorEs: string }> {
  const catalog = await loadMaisonCatalogRow(admin, "design", input.design);
  const rels = await admin
    .from("talent_theme_releases")
    .select("id", { count: "exact", head: true })
    .eq("design_slug", input.design);
  if (rels.error) {
    return { ok: false, error: `Could not read releases: ${rels.error.message}`, errorEs: `No se pudieron leer los lanzamientos: ${rels.error.message}` };
  }
  const sites = await collectSites(admin, input.design);
  const plan = planFirstRelease({
    design: input.design,
    title: catalog?.title ?? input.design,
    catalogVersion: catalog?.version ?? null,
    releaseRows: rels.count ?? 0,
    realSites: sites.filter((s) => !s.isDemo).length,
  });
  if (!plan.ok) return plan;
  const created = await createDraftRelease(admin, {
    designSlug: input.design,
    fromVersion: plan.version,
    toVersion: plan.version,
    notes: plan.notes,
    createdBy: input.actorId,
    basePayload: catalog?.payload,
  });
  if (!created.ok) return { ok: false, error: created.error, errorEs: created.error };
  const row = await admin
    .from("talent_theme_releases")
    .select("id")
    .eq("design_slug", input.design)
    .eq("to_version", plan.version)
    .maybeSingle();
  if (row.error || !row.data) {
    const msg = row.error?.message ?? "release row not found";
    return { ok: false, error: `Release created but not found: ${msg}`, errorEs: `Lanzamiento creado pero no encontrado: ${msg}` };
  }
  return { ok: true, releaseId: (row.data as { id: string }).id, version: plan.version };
}
