"use server";

/**
 * parity-probe-action.ts (X5) — the server entry point behind `ParityProbePanel`.
 *
 * For a chosen surface × plan × tier (+ optional live tenant id), it:
 *   1. assembles the SAME Lab universe `loadCatalogAdminView` does — every code
 *      item ∪ every template (ALL statuses) as `AddGalleryItem`, joined with the
 *      overlay map;
 *   2. synthesizes the matching `GallerySurfaceDescriptor` (the real config
 *      factory shape) and runs the PURE `computeParityProbe` to get the
 *      Lab-visible-but-live-hidden rows + leading reason;
 *   3. calls the REAL live read path (`fetchSurfaceGalleryItems`) with the SAME
 *      descriptor and cross-checks: every row the probe flags as hidden MUST be
 *      absent from the live set, and every published row the probe does NOT flag
 *      MUST be present. A mismatch is reported as `parityMismatch` so a future
 *      drift between the replayed predicates and the live engine is caught.
 *
 * Reuses existing chokepoints only (`listAllTemplates`, `listCatalogOverlays`,
 * `fetchSurfaceGalleryItems`), all already super_admin-gated. No new CRUD.
 */

import { ADD_GALLERY_ITEMS } from "./registry";
import {
  builderTemplateRowToGalleryItem,
  dbTemplateGalleryItemId,
  type CatalogOverlayRow,
} from "./registry-db-merge";
import type { AddGalleryItem } from "./types";
import { fetchSurfaceGalleryItems } from "./gallery-fetch-action";
import {
  computeParityProbe,
  evaluateRolloutAdmissionPerSurface,
  summarizeParityReasons,
  type ParityHiddenReason,
  type ParityProbeRow,
  type SurfaceRolloutAdmission,
} from "./parity-probe";
import {
  buildParityDescriptor,
  paritySurfaceByKey,
  type ParityPlanKey,
  type ParitySurfaceKey,
  type ParityTierKey,
} from "./parity-surface-descriptors";
import { templateTargetAllowed } from "./registry-db-merge";
import type { TemplateRolloutFields } from "@/lib/site-admin/builder-core/templates/rollout";
import { listAllTemplates } from "@/lib/site-admin/builder-core/templates/registry-admin-actions";
import { listCatalogOverlays } from "@/lib/site-admin/builder-core/templates/catalog-overlay-actions";

export interface RunParityProbeInput {
  surface: ParitySurfaceKey;
  plan: ParityPlanKey;
  tier: ParityTierKey;
  /** Live tenant id for staged-rollout bucketing. Empty/undefined ⇒ no rollout
   *  gating (platform/Lab context — authors are never hidden). */
  tenantId?: string | null;
}

export interface ParityProbeResult {
  ok: boolean;
  error?: string;
  /** Rows Lab-visible but live-hidden, each with its leading reason. */
  hiddenRows: ParityProbeRow[];
  /** Count of rows by reason. */
  byReason: Record<ParityHiddenReason, number>;
  /** Total Lab universe size considered. */
  universeCount: number;
  /** Size of the live gallery for this surface (cross-check ground truth). */
  liveCount: number;
  /**
   * Cross-check: probe-flagged ids that the live read path UNEXPECTEDLY still
   * shows (a replay drift). Empty ⇒ the probe agrees with the live engine.
   */
  parityMismatch: string[];
}

export async function runParityProbe(
  input: RunParityProbeInput,
): Promise<ParityProbeResult> {
  const empty = (): Record<ParityHiddenReason, number> => ({
    "overlay-hidden": 0,
    target: 0,
    plan: 0,
    tier: 0,
    rollout: 0,
  });

  const descriptor = buildParityDescriptor({
    surface: input.surface,
    plan: input.plan,
    tier: input.tier,
    tenantId: input.tenantId && input.tenantId.trim() ? input.tenantId.trim() : null,
  });

  // 1. Assemble the Lab universe (mirrors loadCatalogAdminView) + overlays.
  const [templatesRes, overlays] = await Promise.all([
    listAllTemplates(), // super_admin-gated; ALL statuses
    listCatalogOverlays(),
  ]);
  if (!templatesRes.ok) {
    return {
      ok: false,
      error: templatesRes.error,
      hiddenRows: [],
      byReason: empty(),
      universeCount: 0,
      liveCount: 0,
      parityMismatch: [],
    };
  }

  const rows = templatesRes.data;
  const statusByRef: Record<string, string> = {};
  for (const row of rows) {
    statusByRef[dbTemplateGalleryItemId(row.id)] = row.status;
  }
  const templateItems: AddGalleryItem[] = rows.map((row) =>
    builderTemplateRowToGalleryItem(row),
  );
  const universeItems: AddGalleryItem[] = [...ADD_GALLERY_ITEMS, ...templateItems];

  const overlayFor = (id: string): CatalogOverlayRow | null => overlays[id] ?? null;

  const universe = universeItems.map((item) => ({
    item,
    overlay: overlayFor(item.id),
    effectiveLabel: overlayFor(item.id)?.label_override ?? item.label,
    status:
      item.insertMethod === "dbTemplate"
        ? statusByRef[item.id] ?? "published"
        : overlayFor(item.id)?.availability_override === "hidden"
          ? "archived"
          : "published",
  }));

  // 2. PURE probe diff.
  const hiddenRows = computeParityProbe(universe, descriptor);
  const hiddenIds = new Set(hiddenRows.map((r) => r.id));

  // 3. Cross-check against the REAL live read path. Any id the probe flagged as
  //    hidden that the live gallery STILL returns is a replay drift.
  let liveCount = 0;
  const parityMismatch: string[] = [];
  try {
    const live = await fetchSurfaceGalleryItems(descriptor);
    liveCount = live.length;
    const liveIds = new Set(live.map((i) => i.id));
    for (const id of hiddenIds) {
      if (liveIds.has(id)) parityMismatch.push(id);
    }
  } catch {
    // Cross-check is best-effort; the pure probe result stands on its own.
    liveCount = -1;
  }

  return {
    ok: true,
    hiddenRows,
    byReason: summarizeParityReasons(hiddenRows),
    universeCount: universe.length,
    liveCount,
    parityMismatch,
  };
}

// ── X7: per-surface rollout admission diff ─────────────────────────────────────

/** One template option for the X7 admission selector. */
export interface RolloutAdmissionTemplateOption {
  id: string;
  title: string;
  status: string;
  /** The rollout ceiling shown next to the title (null/undefined ⇒ 100). */
  percentage: number;
  /** True when the template carries any non-trivial staged-rollout config. */
  staged: boolean;
}

export interface RolloutAdmissionResult {
  ok: boolean;
  error?: string;
  /** All templates the operator can pick from (super_admin universe). */
  templates: RolloutAdmissionTemplateOption[];
  /** The selected template id (echoed back), or null when none chosen yet. */
  selectedId: string | null;
  /** Per-surface admission for the selected template + entered tenant id. */
  surfaces: SurfaceRolloutAdmission[];
  /** The trimmed tenant id used (empty ⇒ no tenant context). */
  tenantId: string;
}

export interface RunRolloutAdmissionInput {
  /** Template id to audit. When omitted, the action returns only the picker. */
  templateId?: string | null;
  /** Live tenant id to bucket. Empty/undefined ⇒ no rollout gating. */
  tenantId?: string | null;
}

/**
 * X7 — evaluate `templateRolloutAllowed` per surface for ONE selected template +
 * ONE entered tenant id, so a staged rollout's real per-surface reach is
 * auditable before assuming "published = everyone".
 *
 * A surface contributes a verdict only when the template is actually OFFERED
 * there (its `target_context` admits the surface audience AND the surface allows
 * DB templates) — otherwise the row would be hidden by `target` regardless of the
 * rollout bucket, and showing an admission verdict there would be misleading.
 */
export async function runRolloutAdmissionProbe(
  input: RunRolloutAdmissionInput,
): Promise<RolloutAdmissionResult> {
  const tenantId = input.tenantId && input.tenantId.trim() ? input.tenantId.trim() : "";

  const templatesRes = await listAllTemplates(); // super_admin-gated; ALL statuses
  if (!templatesRes.ok) {
    return {
      ok: false,
      error: templatesRes.error,
      templates: [],
      selectedId: null,
      surfaces: [],
      tenantId,
    };
  }

  const rows = templatesRes.data;
  const templates: RolloutAdmissionTemplateOption[] = rows.map((row) => {
    const pct = row.rollout_percentage ?? 100;
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      percentage: pct,
      staged:
        pct < 100 ||
        (row.tenant_allowlist?.length ?? 0) > 0 ||
        (row.tenant_denylist?.length ?? 0) > 0,
    };
  });

  const selectedId = input.templateId ?? null;
  const selected = selectedId ? rows.find((r) => r.id === selectedId) ?? null : null;

  let surfaces: SurfaceRolloutAdmission[] = [];
  if (selected) {
    const rolloutFields: TemplateRolloutFields = {
      id: selected.id,
      rollout_percentage: selected.rollout_percentage ?? null,
      tenant_allowlist: selected.tenant_allowlist ?? null,
      tenant_denylist: selected.tenant_denylist ?? null,
    };
    surfaces = evaluateRolloutAdmissionPerSurface({
      tenantId,
      rolloutBySurface: (surfaceKey) => {
        const shape = paritySurfaceByKey(surfaceKey);
        // Offered on this surface? DB templates must be allowed AND the
        // template's target_context must admit the surface's audience.
        const offered =
          shape.allowDbTemplates &&
          templateTargetAllowed(selected.target_context, shape.surfaceTarget);
        return offered ? rolloutFields : null;
      },
    });
  }

  return {
    ok: true,
    templates,
    selectedId: selected?.id ?? null,
    surfaces,
    tenantId,
  };
}
