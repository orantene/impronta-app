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
 *
 * G2 — platform_audit_log parity: every overlay write emits a
 * platform_audit_log row (via scheduleAuditEvent / record_phase5_audit) in
 * ADDITION to the existing G1 builder_lab_audit append. Both fire on each
 * write; a failed platform audit emit is best-effort/non-fatal and never
 * blocks the overlay write.
 */

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logServerError, CLIENT_ERROR } from "@/lib/server/safe-error";
import { scheduleAuditEvent } from "@/lib/site-admin/audit";
import { DEFAULT_AI_TENANT_ID } from "@/lib/ai/ai-tenant-constants";
import { bumpCatalogVersion } from "./catalog-version";
import { appendBuilderLabAudit, listBuilderLabAudit } from "./builder-lab-audit";
import type { BuilderLabAuditEntry } from "./builder-lab-audit-shape";
import {
  pickRevertPlanFromAudit,
  snapshotToOverlayInput,
} from "./overlay-revert-shape";
import type {
  CatalogOverlayMap,
  CatalogOverlayRow,
  SetCatalogOverlayInput,
} from "@/lib/site-admin/add-gallery/registry-db-merge";
import {
  enablingSurfaceKeys,
  buildOverlayPayload,
  checkSurfaceGuard,
} from "./catalog-overlay-payload";

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

// ── G2 — overlay diff summary (platform_audit_log) ─────────────────────────
//
// Builds a ≤240-char human-readable diff for the platform_audit_log
// `diff_summary` field. Surface toggles and override fields are surfaced when
// they change; stable unchanged fields are omitted so the summary stays terse.
// This mirrors the branding `diffSummary` helper: list what changed, fall back
// to "touched (no field change)" when the snapshot diff is empty.

const SURFACE_TOGGLE_KEYS = [
  "talent_enabled",
  "workspace_enabled",
  "talent_profile_enabled",
  "talent_shell_enabled",
  "workspace_page_enabled",
  "workspace_shell_enabled",
  "lab_enabled",
] as const;

const OVERRIDE_KEYS = [
  "label_override",
  "icon_override",
  "category_override",
  "required_plan_override",
  "availability_override",
  "default_variant",
] as const;

type AnyRow = Record<string, unknown> | null;

function buildOverlayDiffSummary(
  action: "overlay.set" | "overlay.clear",
  itemRef: string,
  before: AnyRow,
  after: AnyRow,
): string {
  const ref = itemRef.length > 40 ? `${itemRef.slice(0, 37)}…` : itemRef;
  if (action === "overlay.clear") {
    return `overlay cleared for ${ref}`;
  }
  // Collect changed surface toggles.
  const surfaceChanges: string[] = [];
  for (const key of SURFACE_TOGGLE_KEYS) {
    const bv = before?.[key];
    const av = after?.[key];
    if (av !== undefined && bv !== av) {
      surfaceChanges.push(`${key}=${String(av)}`);
    }
  }
  // Collect changed override keys.
  const overrideChanges: string[] = [];
  for (const key of OVERRIDE_KEYS) {
    const bv = before?.[key];
    const av = after?.[key];
    if (av !== undefined && JSON.stringify(bv) !== JSON.stringify(av)) {
      overrideChanges.push(key);
    }
  }
  const parts: string[] = [];
  if (surfaceChanges.length) parts.push(`surfaces: ${surfaceChanges.join(", ")}`);
  if (overrideChanges.length) parts.push(`overrides: ${overrideChanges.join(", ")}`);
  const detail = parts.length ? parts.join("; ") : "no field change";
  const summary = `overlay.set ${ref} — ${detail}`;
  return summary.length <= 240 ? summary : `${summary.slice(0, 239)}…`;
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
  sb: SupabaseClient,
  itemRef: string,
  source: "code" | "template",
): Promise<"talent" | "workspace" | "both" | "platform" | null> {
  if (source !== "template") return "both"; // code items: no target_context row
  const uuid = itemRef.startsWith("db-template:") ? itemRef.slice("db-template:".length) : itemRef;
  const { data } = await sb
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
  if (enablingSurfaceKeys(input).length > 0) {
    try {
      const sbGuard = getAdminClient();
      const targetCtx = await fetchTemplateTargetContext(sbGuard, input.item_ref, input.source);
      if (targetCtx !== null) {
        const violation = checkSurfaceGuard(input, targetCtx);
        if (violation) return fail(violation);
      }
    } catch (err) {
      logServerError("setComponentOverlay.guardLookup", err);
      // Non-fatal lookup error — proceed; the overlay write itself may still error.
    }
  }

  const payload = buildOverlayPayload(input, gate.userId);

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
      .upsert(payload as never, { onConflict: "item_ref" })
      .select()
      .maybeSingle();
    if (error) return fail(error.message);
    await bumpCatalogVersion(sb);
    // G1 — best-effort Lab-local audit (non-fatal — never blocks the user action).
    await appendBuilderLabAudit({
      action: "overlay.set",
      itemRef: input.item_ref,
      actor: gate.userId,
      before: beforeRow ?? null,
      after: afterRow ?? payload,
    });
    // G2 — platform_audit_log parity: emit via the authenticated cookie client so
    // auth.uid() resolves correctly inside record_phase5_audit (SECURITY DEFINER).
    // Best-effort/non-fatal: a failed emit must never block the overlay write.
    const cookieClient = await createClient();
    if (cookieClient) {
      scheduleAuditEvent(cookieClient, {
        tenantId: DEFAULT_AI_TENANT_ID,
        actorProfileId: gate.userId,
        action: "agency.site_admin.builder.catalog.overlay.set",
        entityType: "builder_catalog_overlay",
        entityId: input.item_ref,
        diffSummary: buildOverlayDiffSummary(
          "overlay.set",
          input.item_ref,
          beforeRow as AnyRow,
          (afterRow ?? payload) as AnyRow,
        ),
        beforeSnapshot: beforeRow ?? null,
        afterSnapshot: afterRow ?? payload,
        correlationId: randomUUID(),
      });
    }
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
    // G1 — best-effort Lab-local audit (non-fatal). after=null → reverted to code/template default.
    await appendBuilderLabAudit({
      action: "overlay.clear",
      itemRef,
      actor: gate.userId,
      before: beforeRow ?? null,
      after: null,
    });
    // G2 — platform_audit_log parity: emit via the authenticated cookie client so
    // auth.uid() resolves correctly inside record_phase5_audit (SECURITY DEFINER).
    // Best-effort/non-fatal: a failed emit must never block the overlay write.
    const cookieClient = await createClient();
    if (cookieClient) {
      scheduleAuditEvent(cookieClient, {
        tenantId: DEFAULT_AI_TENANT_ID,
        actorProfileId: gate.userId,
        action: "agency.site_admin.builder.catalog.overlay.clear",
        entityType: "builder_catalog_overlay",
        entityId: itemRef,
        diffSummary: buildOverlayDiffSummary(
          "overlay.clear",
          itemRef,
          beforeRow as AnyRow,
          null,
        ),
        beforeSnapshot: beforeRow ?? null,
        afterSnapshot: null,
        correlationId: randomUUID(),
      });
    }
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

  const sb = getAdminClient();
  // Refs that pass the guard and will actually be written — tracked so the audit
  // (below) and the ok-results only cover rows that landed.
  const writtenRefs: string[] = [];

  // Build upsert payloads from the deduplicated map, enforcing the SAME
  // tighten-only invariant the single-row path runs (X3): a row trying to ENABLE
  // a surface its target_context excludes is rejected as a per-item failure and
  // never written — so the bulk path can't silently bypass the integrity guard.
  for (const [, input] of seen) {
    if (enablingSurfaceKeys(input).length > 0) {
      try {
        const targetCtx = await fetchTemplateTargetContext(
          sb,
          input.item_ref,
          input.source,
        );
        if (targetCtx !== null) {
          const violation = checkSurfaceGuard(input, targetCtx);
          if (violation) {
            results.push({ ok: false, error: violation, item_ref: input.item_ref });
            continue;
          }
        }
      } catch (err) {
        logServerError("setComponentOverlayBatch.guardLookup", err);
        // Non-fatal lookup error — proceed; the write itself may still error.
      }
    }

    payloads.push(buildOverlayPayload(input, gate.userId));
    writtenRefs.push(input.item_ref);
  }

  if (!payloads.length) {
    // All inputs were validation errors or guard violations — nothing to write.
    return ok(results);
  }

  try {
    // Capture the pre-write rows (one query) so the per-row audit carries a diff.
    const { data: beforeRows } = await sb
      .from("builder_catalog_overlay")
      .select()
      .in("item_ref", writtenRefs);
    const beforeByRef = new Map(
      (beforeRows ?? []).map((r) => [r.item_ref as string, r]),
    );

    const { data: afterRows, error } = await sb
      .from("builder_catalog_overlay")
      .upsert(payloads as never, { onConflict: "item_ref" })
      .select();
    if (error) return fail(error.message);
    const afterByRef = new Map(
      (afterRows ?? []).map((r) => [r.item_ref as string, r]),
    );

    // One bump + one revalidate for the whole batch.
    await bumpCatalogVersion(sb);
    revalidateCatalog();

    // G1 — audit EACH written row (best-effort, never blocks). Mirrors the
    // single-row path so bulk re-gates leave the same accountability trail +
    // feed the G7 per-row undo.
    for (const ref of writtenRefs) {
      await appendBuilderLabAudit({
        action: "overlay.set",
        itemRef: ref,
        actor: gate.userId,
        before: beforeByRef.get(ref) ?? null,
        after: afterByRef.get(ref) ?? null,
      });
      results.push({ ok: true, data: undefined, item_ref: ref });
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

// ── per-row overlay revision / revert (G7) ───────────────────────────────────

/**
 * G7 — the overlay-mutating audit history for ONE catalog item, newest first.
 * Thin super_admin-gated wrapper over G1's `listBuilderLabAudit` scoped to the
 * item_ref. Returned to the catalog-row revision strip so each row offers
 * "revert this item to its state on <date>". Never throws — degrades to [].
 */
export async function loadOverlayHistory(
  itemRef: string,
): Promise<BuilderLabAuditEntry[]> {
  if (!itemRef) return [];
  // listBuilderLabAudit applies its own super_admin gate + RLS; we only scope it.
  const entries = await listBuilderLabAudit({ itemRef });
  return entries.filter(
    (e) => e.action === "overlay.set" || e.action === "overlay.clear",
  );
}

/**
 * G7 — revert one item's overlay to the state captured in a chosen audit row.
 *
 * Reads G1's `builder_lab_audit` rows for the item, picks the target row by
 * `auditId`, and re-applies its `before` snapshot through the EXISTING overlay
 * writer (`setComponentOverlay` / `clearComponentOverlay`). Going through the
 * normal writer is the whole point: the revert
 *  - re-runs the X3 tighten-only invariant guard,
 *  - performs the X4 4-surface + X6 lab-axis dual-write,
 *  - bumps the catalog version + revalidates, and
 *  - appends its OWN audit row (so the revert is itself auditable / re-revertable).
 *
 * A single bad overlay tweak therefore reverts WHOLE — every column the bad
 * tweak left alone is restored too, because we write back the full captured
 * snapshot, not just the delta. Returns the gate/writer failure verbatim.
 */
export async function revertOverlayToAudit(
  auditId: string,
): Promise<OverlayActionResult> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return fail(gate.error);
  if (!auditId) return fail("Missing audit reference.");

  try {
    // We don't know the item_ref up front, so read the recent overlay history
    // and locate the row by id. listBuilderLabAudit is super_admin-gated + RLS'd.
    const entries = await listBuilderLabAudit({ limit: 200 });
    const plan = pickRevertPlanFromAudit(entries, auditId);
    if (!plan) {
      return fail("That history entry can't be reverted.");
    }

    // Re-apply through the existing writer so the guard + dual-write + a fresh
    // audit row all fire. snapshot === null ⇒ the target state was "no overlay".
    if (plan.snapshot === null) {
      if (!plan.itemRef) return fail("Missing item reference for revert.");
      return clearComponentOverlay(plan.itemRef);
    }
    return setComponentOverlay(snapshotToOverlayInput(plan.snapshot));
  } catch (err) {
    logServerError("revertOverlayToAudit", err);
    return fail(CLIENT_ERROR.generic);
  }
}
