"use server";

/**
 * catalog-overlay-actions.ts — super_admin-gated server actions for the builder
 * catalog overlay (P3).
 *
 * The overlay (`builder_catalog_overlay`) layers per-surface visibility +
 * metadata overrides on top of BOTH built-in code items and published
 * templates. `listCatalogOverlays` is a read used by the live gallery merge
 * (`fetchSurfaceGalleryItems`) and the Lab Catalog tab; writes are super_admin
 * only and bump `builder_catalog_version` (the P5 sync key) + revalidate.
 *
 * GATE mirrors registry-actions.ts: requireSuperAdmin() server-side; writes go
 * through the service-role client (the gate IS the auth boundary), reads through
 * the authenticated cookie client so the authenticated-read RLS applies.
 */

import { revalidatePath } from "next/cache";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logServerError, CLIENT_ERROR } from "@/lib/server/safe-error";
import type {
  CatalogOverlayMap,
  CatalogOverlayRow,
  SetCatalogOverlayInput,
} from "@/lib/site-admin/add-gallery/registry-db-merge";

export type OverlayActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function ok<T>(data: T): OverlayActionResult<T> {
  return { ok: true, data };
}
function fail(error: string): OverlayActionResult<never> {
  return { ok: false, error };
}

type GateOk = { ok: true; userId: string };
type GateErr = { ok: false; error: string };

async function requireSuperAdmin(): Promise<GateOk | GateErr> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not signed in." };
  if (!isPlatformAdmin(session.profile)) {
    return { ok: false, error: "Super admin access required." };
  }
  return { ok: true, userId: session.user.id };
}

function getAdminClient() {
  const client = createServiceRoleClient();
  if (!client) throw new Error("Service-role client unavailable.");
  return client;
}

/** Revalidate the Lab + the two live builder roots so SSR caches drop. The
 *  live "+" gallery refetches on open regardless; this is belt-and-suspenders. */
function revalidateCatalog() {
  revalidatePath("/platform/admin");
  revalidatePath("/t", "layout");
  revalidatePath("/p", "layout");
}

/** Atomic-enough bump (single super_admin operator) of the sync counter. */
async function bumpCatalogVersion(
  sb: ReturnType<typeof getAdminClient>,
): Promise<void> {
  const { data } = await sb
    .from("builder_catalog_version")
    .select("version")
    .eq("id", 1)
    .maybeSingle();
  const next = ((data?.version as number | undefined) ?? 0) + 1;
  await sb
    .from("builder_catalog_version")
    .update({ version: next, updated_at: new Date().toISOString() })
    .eq("id", 1);
}

// ── reads ──────────────────────────────────────────────────────────────────

/**
 * All overlay rows as a map keyed by item_ref. Read with the authenticated
 * cookie client (authenticated-read RLS). Never throws — returns {} on error so
 * the gallery merge degrades to code/template defaults.
 */
export async function listCatalogOverlays(): Promise<CatalogOverlayMap> {
  try {
    const sb = await createClient();
    if (!sb) return {};
    const { data, error } = await sb.from("builder_catalog_overlay").select();
    if (error || !data) return {};
    const map: CatalogOverlayMap = {};
    for (const row of data as CatalogOverlayRow[]) {
      map[row.item_ref] = row;
    }
    return map;
  } catch (err) {
    logServerError("listCatalogOverlays", err);
    return {};
  }
}

/** Current sync-counter value (P5 stamp). 0 on any error. */
export async function getCatalogVersion(): Promise<number> {
  try {
    const sb = await createClient();
    if (!sb) return 0;
    const { data } = await sb
      .from("builder_catalog_version")
      .select("version")
      .eq("id", 1)
      .maybeSingle();
    return (data?.version as number | undefined) ?? 0;
  } catch (err) {
    logServerError("getCatalogVersion", err);
    return 0;
  }
}

// ── writes (super_admin) ─────────────────────────────────────────────────────

/**
 * Upsert an overlay for one gallery item. Only the provided fields are written;
 * a brand-new row takes table defaults (both surfaces enabled, no overrides).
 */
export async function setComponentOverlay(
  input: SetCatalogOverlayInput,
): Promise<OverlayActionResult> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return fail(gate.error);

  if (!input.item_ref) return fail("Missing item reference.");

  const payload: Record<string, unknown> = {
    item_ref: input.item_ref,
    source: input.source,
    updated_by: gate.userId,
  };
  const assign = <K extends keyof SetCatalogOverlayInput>(key: K) => {
    if (input[key] !== undefined) payload[key] = input[key];
  };
  assign("talent_enabled");
  assign("workspace_enabled");
  assign("label_override");
  assign("icon_override");
  assign("category_override");
  assign("required_plan_override");
  assign("availability_override");

  try {
    const sb = getAdminClient();
    const { error } = await sb
      .from("builder_catalog_overlay")
      .upsert(payload, { onConflict: "item_ref" });
    if (error) return fail(error.message);
    await bumpCatalogVersion(sb);
    revalidateCatalog();
    return ok(undefined);
  } catch (err) {
    logServerError("setComponentOverlay", err);
    return fail(CLIENT_ERROR.generic);
  }
}

/** Remove an overlay entirely → the item reverts to its code/template default. */
export async function clearComponentOverlay(
  itemRef: string,
): Promise<OverlayActionResult> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return fail(gate.error);
  if (!itemRef) return fail("Missing item reference.");

  try {
    const sb = getAdminClient();
    const { error } = await sb
      .from("builder_catalog_overlay")
      .delete()
      .eq("item_ref", itemRef);
    if (error) return fail(error.message);
    await bumpCatalogVersion(sb);
    revalidateCatalog();
    return ok(undefined);
  } catch (err) {
    logServerError("clearComponentOverlay", err);
    return fail(CLIENT_ERROR.generic);
  }
}
