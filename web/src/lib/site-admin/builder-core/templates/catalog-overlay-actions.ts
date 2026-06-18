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
import { bumpCatalogVersion } from "./catalog-version";
import { appendBuilderLabAudit } from "./builder-lab-audit";
import {
  CATALOG_SURFACE_KEYS,
  surfaceAllowedForTarget,
  type CatalogSurfaceKey,
} from "@/lib/site-admin/add-gallery/surface-keys";
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
  revalidatePath("/t", "layout"); // talent pages are top-level (src/app/t)
  revalidatePath("/(public)/p", "layout"); // workspace pages live under the (public) route group
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

/**
 * Current sync-counter value (the P5 stamp). Returns `null` on error / no
 * session so a future staleness poller can distinguish a failure from version 0
 * (the seeded baseline). The live "+" gallery uses next-load sync (fetch on
 * open) by design; this reader is the hook for an optional realtime refresh.
 */
export async function getCatalogVersion(): Promise<number | null> {
  try {
    const sb = await createClient();
    if (!sb) return null;
    const { data } = await sb
      .from("builder_catalog_version")
      .select("version")
      .eq("id", 1)
      .maybeSingle();
    return (data?.version as number | undefined) ?? 0;
  } catch (err) {
    logServerError("getCatalogVersion", err);
    return null;
  }
}

// ── writes (super_admin) ─────────────────────────────────────────────────────

/**
 * X3 — look up a template's `target_context` from `builder_templates` given the
 * gallery `item_ref` (which is `db-template:<uuid>` for DB-backed rows). Returns
 * `"both"` for code items (they carry no DB row; the coarse default = no restriction).
 * Returns `null` if the DB row is missing (caller treats as non-fatal — a missing
 * template row is a data integrity issue unrelated to the overlay write).
 */
async function fetchTemplateTargetContext(
  sb: ReturnType<typeof import("@/lib/supabase/admin").createServiceRoleClient>,
  itemRef: string,
  source: "code" | "template",
): Promise<"talent" | "workspace" | "both" | "platform" | null> {
  if (source !== "template") return "both"; // code items: no target_context row
  const uuid = itemRef.startsWith("db-template:") ? itemRef.slice("db-template:".length) : itemRef;
  const { data } = await (sb as NonNullable<typeof sb>)
    .from("builder_templates")
    .select("target_context")
    .eq("id", uuid)
    .maybeSingle();
  if (!data) return null;
  return (data.target_context as "talent" | "workspace" | "both" | "platform") ?? "both";
}

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

  // X3 — tighten-only invariant guard: reject any attempt to ENABLE a surface
  // that the component's target_context excludes. lab_enabled is never gated.
  // We only need to run the DB lookup when at least one surface toggle is being
  // set to `true`; disable-only writes and non-surface fields always proceed.
  const surfaceKeyToInputField: Record<CatalogSurfaceKey, keyof SetCatalogOverlayInput> = {
    talent_profile: "talent_profile_enabled",
    talent_shell: "talent_shell_enabled",
    workspace_page: "workspace_page_enabled",
    workspace_shell: "workspace_shell_enabled",
  };
  const enablingKeys = CATALOG_SURFACE_KEYS.filter(
    (sk) => input[surfaceKeyToInputField[sk]] === true,
  );
  if (enablingKeys.length > 0) {
    try {
      const sbGuard = getAdminClient();
      const targetCtx = await fetchTemplateTargetContext(sbGuard, input.item_ref, input.source);
      if (targetCtx !== null) {
        const violations = enablingKeys.filter(
          (sk) => !surfaceAllowedForTarget(targetCtx, sk),
        );
        if (violations.length > 0) {
          return fail(
            `Tighten-only invariant: component targets "${targetCtx}"; cannot enable surface(s): ${violations.join(", ")}.`,
          );
        }
      }
    } catch (err) {
      logServerError("setComponentOverlay.guardLookup", err);
      // Non-fatal lookup error — proceed; the overlay write itself may still error.
    }
  }

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
  // X4 — the four independent per-surface toggles (dual-written alongside the
  // legacy pair; see SetCatalogOverlayInput). Required so a single-surface toggle
  // from the Lab matrix persists its precise column, not just the legacy mirror.
  assign("talent_profile_enabled");
  assign("talent_shell_enabled");
  assign("workspace_page_enabled");
  assign("workspace_shell_enabled");
  // X6 — the independent Builder-Lab visibility toggle (orthogonal 5th axis).
  assign("lab_enabled");
  assign("label_override");
  assign("icon_override");
  assign("category_override");
  assign("required_plan_override");
  assign("availability_override");
  assign("default_variant");
  assign("default_props");
  assign("data_source_defaults");
  assign("locked_props");

  try {
    const sb = getAdminClient();
    // Capture the pre-write overlay row for the audit before/after diff.
    const { data: beforeRow } = await sb
      .from("builder_catalog_overlay")
      .select()
      .eq("item_ref", input.item_ref)
      .maybeSingle();
    const { data: afterRow, error } = await sb
      .from("builder_catalog_overlay")
      .upsert(payload, { onConflict: "item_ref" })
      .select()
      .maybeSingle();
    if (error) return fail(error.message);
    await bumpCatalogVersion(sb);
    // Best-effort audit (non-fatal — never blocks the user action).
    await appendBuilderLabAudit({
      action: "overlay.set",
      itemRef: input.item_ref,
      actor: gate.userId,
      before: beforeRow ?? null,
      after: afterRow ?? payload,
    });
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
    // Capture the row being cleared so the audit retains what was removed.
    const { data: beforeRow } = await sb
      .from("builder_catalog_overlay")
      .select()
      .eq("item_ref", itemRef)
      .maybeSingle();
    const { error } = await sb
      .from("builder_catalog_overlay")
      .delete()
      .eq("item_ref", itemRef);
    if (error) return fail(error.message);
    await bumpCatalogVersion(sb);
    // Best-effort audit (non-fatal). after=null → reverted to code/template default.
    await appendBuilderLabAudit({
      action: "overlay.clear",
      itemRef,
      actor: gate.userId,
      before: beforeRow ?? null,
      after: null,
    });
    revalidateCatalog();
    return ok(undefined);
  } catch (err) {
    logServerError("clearComponentOverlay", err);
    return fail(CLIENT_ERROR.generic);
  }
}

// ── batch writes (super_admin) ───────────────────────────────────────────────

/** Per-item result within a batch — `item_ref` attached so callers can correlate. */
export type BatchItemResult = OverlayActionResult & { item_ref: string };

/**
 * Upsert overlays for N gallery items in a single DB round-trip.
 *
 * Semantics:
 * - Deduplicates inputs by `item_ref` (last entry in the array wins, mirroring
 *   what N sequential `setComponentOverlay` calls would produce).
 * - Inputs missing `item_ref` are collected as per-item errors; valid entries
 *   still proceed so a bad row never silently blocks the whole batch.
 * - `bumpCatalogVersion` + `revalidateCatalog` fire ONCE for the whole batch,
 *   not per row — that is the entire point of this action.
 * - Return shape: `OverlayActionResult<BatchItemResult[]>`. Outer `ok:false`
 *   means the gate or the DB upsert itself failed (nothing written). Outer
 *   `ok:true` with inner per-item `ok:false` means that item had a validation
 *   error; the rest were written.
 */
export async function setComponentOverlayBatch(
  inputs: SetCatalogOverlayInput[],
): Promise<OverlayActionResult<BatchItemResult[]>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return fail(gate.error);
  if (!inputs.length) return ok([]);

  const results: BatchItemResult[] = [];
  const payloads: Record<string, unknown>[] = [];

  // Deduplicate by item_ref — last writer wins (matches N-sequential semantics).
  const seen = new Map<string, SetCatalogOverlayInput>();
  for (const input of inputs) {
    if (input.item_ref) seen.set(input.item_ref, input);
  }

  // Collect validation errors for inputs with no/empty item_ref.
  for (const input of inputs) {
    if (!input.item_ref) {
      results.push({ ok: false, error: "Missing item reference.", item_ref: "" });
    }
  }

  // Build upsert payloads from the deduplicated map.
  for (const [, input] of seen) {
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
    // X4 — the four independent per-surface toggles (dual-written alongside the
    // legacy pair; see SetCatalogOverlayInput).
    assign("talent_profile_enabled");
    assign("talent_shell_enabled");
    assign("workspace_page_enabled");
    assign("workspace_shell_enabled");
    // X6 — the independent Builder-Lab visibility toggle (orthogonal 5th axis).
    assign("lab_enabled");
    assign("label_override");
    assign("icon_override");
    assign("category_override");
    assign("required_plan_override");
    assign("availability_override");
    assign("default_variant");
    assign("default_props");
    assign("data_source_defaults");
    assign("locked_props");
    payloads.push(payload);
  }

  if (!payloads.length) {
    // All inputs had validation errors — nothing to write.
    return ok(results);
  }

  try {
    const sb = getAdminClient();
    const { error } = await sb
      .from("builder_catalog_overlay")
      .upsert(payloads, { onConflict: "item_ref" });
    if (error) return fail(error.message);
    // One bump + one revalidate for the whole batch.
    await bumpCatalogVersion(sb);
    revalidateCatalog();

    for (const [item_ref] of seen) {
      results.push({ ok: true, data: undefined, item_ref });
    }
    return ok(results);
  } catch (err) {
    logServerError("setComponentOverlayBatch", err);
    return fail(CLIENT_ERROR.generic);
  }
}

/**
 * Delete overlays for N gallery items in a single DB round-trip.
 *
 * Semantics:
 * - Deduplicates `refs` before the `.in()` filter so each ref appears at most
 *   once, matching what N sequential `clearComponentOverlay` calls produce.
 * - Empty-string entries are collected as per-item errors; valid refs still proceed.
 * - `bumpCatalogVersion` + `revalidateCatalog` fire ONCE for the whole batch.
 * - Return shape mirrors `setComponentOverlayBatch` for UI symmetry.
 */
export async function clearComponentOverlayBatch(
  refs: string[],
): Promise<OverlayActionResult<BatchItemResult[]>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return fail(gate.error);
  if (!refs.length) return ok([]);

  const results: BatchItemResult[] = [];
  const validRefs: string[] = [];

  for (const ref of refs) {
    if (!ref) {
      results.push({ ok: false, error: "Missing item reference.", item_ref: "" });
    } else {
      validRefs.push(ref);
    }
  }

  // Deduplicate.
  const uniqueRefs = [...new Set(validRefs)];

  if (!uniqueRefs.length) {
    return ok(results);
  }

  try {
    const sb = getAdminClient();
    const { error } = await sb
      .from("builder_catalog_overlay")
      .delete()
      .in("item_ref", uniqueRefs);
    if (error) return fail(error.message);
    // One bump + one revalidate for the whole batch.
    await bumpCatalogVersion(sb);
    revalidateCatalog();

    for (const item_ref of uniqueRefs) {
      results.push({ ok: true, data: undefined, item_ref });
    }
    return ok(results);
  } catch (err) {
    logServerError("clearComponentOverlayBatch", err);
    return fail(CLIENT_ERROR.generic);
  }
}
