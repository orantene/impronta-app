/**
 * parity-probe.ts (X5) — live-gallery parity probe.
 *
 * "Shown in the Lab, hidden in the live + gallery — and WHY."
 *
 * The Builder Lab Catalog lists the FULL ungated universe (`loadCatalogAdminView`
 * → `buildCatalogAdminView`): every code item + every template of every status,
 * with hidden/archived rows still shown so a super-admin can re-enable them. The
 * LIVE "+" gallery a tenant sees is the SUBTRACTED set
 * (`fetchSurfaceGalleryItems` → `listGalleryItems`): only published templates,
 * gated by the surface's plan / talent tier / target_context / staged rollout,
 * minus anything the admin overlay hides.
 *
 * This module computes, for a chosen surface × plan × talent tier, EXACTLY which
 * Lab-visible rows are live-hidden and the SINGLE first reason each is hidden,
 * replaying the same predicates the live read path applies. It is the cheap
 * read-only truth view that de-risks the X4 4-surface overlay migration.
 *
 * PURE + side-effect-free: the reasoning core takes the already-resolved universe
 * (items + overlay + status) and a synthesized `GallerySurfaceDescriptor`, and
 * never imports the DOM-only drag / perform-insert code. The thin server wrapper
 * (`parity-probe-action.ts`) loads the universe + overlays and calls the SAME
 * live read path (`fetchSurfaceGalleryItems`) to cross-check.
 *
 * X1 finding honored: `templateTargetAllowed`/`templateTalentTierAllowed` are
 * imported DIRECTLY from `registry-db-merge` (NOT the `add-gallery` barrel) so
 * the test graph never drags in a `.css` side-effect.
 */

import {
  templateTargetAllowed,
  templateTalentTierAllowed,
  type CatalogOverlayRow,
} from "./registry-db-merge";
import type { AddGalleryItem, AddGalleryTab, GallerySurfaceDescriptor } from "./types";
import { templatePlanAllowed } from "@/lib/site-admin/builder-core/templates/registry-rows";
import { templateRolloutAllowed } from "@/lib/site-admin/builder-core/templates/rollout";

/**
 * Why a Lab-visible row is hidden on a chosen live surface. ORDERED by the live
 * read path's evaluation precedence — the probe reports the FIRST reason that
 * fires (others may also apply, but this is the one a tenant hits first):
 *
 *   1. `overlay-hidden` — the admin overlay suppresses it: a global
 *      `availability_override='hidden'`, OR the per-surface `*_enabled=false`
 *      toggle for this surface's audience (`applyCatalogOverlay` subtract-only).
 *   2. `target`         — the surface can't carry the row at all: its tab isn't
 *      in `allowedTabs`, DB templates are off on this surface
 *      (`allowDbTemplates=false`), or `target_context` excludes the surface
 *      audience (`templateTargetAllowed`).
 *   3. `plan`           — the surface plan can't meet `required_plan` (or the
 *      overlay's `required_plan_override`, whichever is stricter).
 *   4. `tier`           — the surface talent tier can't meet `required_talent_tier`.
 *   5. `rollout`        — the live tenant is outside the staged-rollout bucket /
 *      denylisted (`templateRolloutAllowed`).
 */
export type ParityHiddenReason =
  | "overlay-hidden"
  | "target"
  | "plan"
  | "tier"
  | "rollout";

/** Human label per reason — shared so the panel + any caller read identically. */
export const PARITY_REASON_LABEL: Record<ParityHiddenReason, string> = {
  "overlay-hidden": "Hidden by overlay",
  target: "Surface target",
  plan: "Plan-gated",
  tier: "Tier-gated",
  rollout: "Staged rollout",
};

/** A one-line explanation per reason, parameterised on the chosen surface. */
export function explainParityReason(
  reason: ParityHiddenReason,
  descriptor: GallerySurfaceDescriptor,
): string {
  switch (reason) {
    case "overlay-hidden":
      return "Disabled by the admin overlay (availability or this surface's enable toggle).";
    case "target":
      return `Not offered on this surface (tab not allowed, DB templates off, or target_context excludes ${descriptor.surfaceTarget ?? "this audience"}).`;
    case "plan":
      return `Requires a higher plan than ${descriptor.plan ?? "free"}.`;
    case "tier":
      return `Requires a higher talent tier than ${descriptor.talentTier ?? "none"}.`;
    case "rollout":
      return "The selected tenant is outside this template's staged-rollout bucket (or denylisted).";
  }
}

/** One Lab-visible-but-live-hidden row in the probe result. */
export interface ParityProbeRow {
  /** Gallery-item id (= overlay `item_ref`). */
  id: string;
  /** Effective (overlay-aware) display label, for the result list. */
  label: string;
  /** `code` | `template`. */
  source: "code" | "template";
  /** The Lab tab the row sits under. */
  tab: AddGalleryTab;
  /** Lifecycle status (template enum, or derived published/archived for code). */
  status: string;
  /** The single first reason it is hidden on the chosen surface. */
  reason: ParityHiddenReason;
  /** Parameterised human explanation. */
  detail: string;
}

/**
 * One entry of the universe the probe diffs: the raw gallery item, its overlay
 * (or null), the effective label, and lifecycle status. Mirrors what
 * `loadCatalogAdminView` already assembles — the action threads these in.
 */
export interface ParityUniverseEntry {
  item: AddGalleryItem;
  overlay: CatalogOverlayRow | null;
  effectiveLabel: string;
  status: string;
}

/** Map a descriptor's audience-target onto the overlay enable toggle it reads. */
function overlayDisablesSurface(
  overlay: CatalogOverlayRow,
  surfaceTarget: GallerySurfaceDescriptor["surfaceTarget"],
): boolean {
  // `applyCatalogOverlay` subtracts per-surface ONLY for talent/workspace
  // surfaces; both/platform/null surfaces are not per-surface gated (only by
  // availability). Mirror that exactly.
  if (surfaceTarget === "talent") return !overlay.talent_enabled;
  if (surfaceTarget === "workspace") return !overlay.workspace_enabled;
  return false;
}

/**
 * Compute the SINGLE first reason `entry` is hidden on the live surface
 * described by `descriptor`, or `null` if the live gallery WOULD show it.
 *
 * Replays the live read path's predicates in their real evaluation order:
 *   overlay (availability + per-surface enable + plan-override) →
 *   surface policy (allowed tab + allowDbTemplates) →
 *   target_context → required_plan → required_talent_tier → staged rollout.
 *
 * PURE. Returns the reason a tenant on this surface would first hit; the others
 * may also hold, but the probe surfaces the leading cause.
 */
export function computeParityHiddenReason(
  entry: ParityUniverseEntry,
  descriptor: GallerySurfaceDescriptor,
): ParityHiddenReason | null {
  const { item, overlay } = entry;
  const isTemplate = item.insertMethod === "dbTemplate";

  // 1. Overlay — availability + per-surface enable. Applies to BOTH code +
  //    template rows (the live `applyCatalogOverlay` runs over the merged set).
  if (overlay) {
    if (overlay.availability_override === "hidden") return "overlay-hidden";
    if (overlayDisablesSurface(overlay, descriptor.surfaceTarget)) {
      return "overlay-hidden";
    }
  }

  // 2. Surface policy / target_context.
  //    - tab must be offered on this surface
  //    - DB templates must be enabled for a template row
  //    - target_context must allow this surface's audience
  if (!descriptor.allowedTabs.includes(item.tab)) return "target";
  if (isTemplate && !descriptor.allowDbTemplates) return "target";
  if (!templateTargetAllowed(item.targetContext ?? "both", descriptor.surfaceTarget)) {
    return "target";
  }

  // 3. Plan. Code items have no required_plan; templates carry `requiredPlan`.
  //    The overlay's `required_plan_override` tightens further (never loosens).
  //    `applyCatalogOverlay` drops when the override can't be met; `gateDbGalleryItems`
  //    drops when the row's own `required_plan` can't be met — replay both.
  const effectivePlanGate = item.requiredPlan ?? "free";
  if (descriptor.plan && !templatePlanAllowed(effectivePlanGate, descriptor.plan)) {
    return "plan";
  }
  if (
    overlay?.required_plan_override &&
    descriptor.plan &&
    !templatePlanAllowed(overlay.required_plan_override, descriptor.plan)
  ) {
    return "plan";
  }

  // 4. Talent tier — templates may require a tier the surface must meet.
  if (!templateTalentTierAllowed(item.requiredTalentTier, descriptor.talentTier)) {
    return "tier";
  }

  // 5. Staged rollout — a published template canaried to a fraction of tenants
  //    (or deny-listed). Null tenant context (platform / Lab) always passes.
  if (isTemplate) {
    const allowed = templateRolloutAllowed(
      {
        id: item.dbTemplateId ?? item.id,
        rollout_percentage: item.rolloutPercentage,
        tenant_allowlist: item.rolloutAllowlist ? [...item.rolloutAllowlist] : null,
        tenant_denylist: item.rolloutDenylist ? [...item.rolloutDenylist] : null,
      },
      descriptor.tenantId,
    );
    if (!allowed) return "rollout";
  }

  return null; // live gallery would show it — full parity, nothing to report.
}

/**
 * Diff the Lab universe against the live gallery for `descriptor`: return the
 * rows that are Lab-visible but live-hidden, each with its leading reason. PURE.
 *
 * "Lab-visible" here means present in the Lab admin universe at all — the Lab
 * intentionally lists hidden/archived rows. Drafts / in-review templates are NOT
 * live-published, so they are a legitimate, expected parity gap; the probe still
 * flags them with their leading gating reason so the operator sees the full
 * picture. The action layer additionally annotates non-published status.
 */
export function computeParityProbe(
  universe: ReadonlyArray<ParityUniverseEntry>,
  descriptor: GallerySurfaceDescriptor,
): ParityProbeRow[] {
  const rows: ParityProbeRow[] = [];
  for (const entry of universe) {
    const reason = computeParityHiddenReason(entry, descriptor);
    if (reason === null) continue;
    rows.push({
      id: entry.item.id,
      label: entry.effectiveLabel || entry.item.label,
      source: entry.item.insertMethod === "dbTemplate" ? "template" : "code",
      tab: entry.item.tab,
      status: entry.status,
      reason,
      detail: explainParityReason(reason, descriptor),
    });
  }
  return rows;
}

/** Tally the probe rows by reason (for the panel's summary chips). */
export function summarizeParityReasons(
  rows: ReadonlyArray<ParityProbeRow>,
): Record<ParityHiddenReason, number> {
  const out: Record<ParityHiddenReason, number> = {
    "overlay-hidden": 0,
    target: 0,
    plan: 0,
    tier: 0,
    rollout: 0,
  };
  for (const r of rows) out[r.reason] += 1;
  return out;
}
