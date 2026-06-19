/**
 * catalog-overlay-payload.ts — PURE (no "use server", no DB, no React) helpers
 * for building and validating catalog overlay upsert payloads.
 *
 * Extracted from `catalog-overlay-actions.ts` so the payload-building logic
 * can be unit-tested without touching the server gate or Supabase. Both the
 * single-row (`setComponentOverlay`) and batch (`setComponentOverlayBatch`)
 * action paths import these; the test file imports them directly.
 *
 * Exports:
 *   enablingSurfaceKeys   — which surface keys an input is ENABLING (→ true).
 *   buildOverlayPayload   — produce the full upsert record for one overlay input.
 *   buildBatchPayloads    — deduplicate N inputs and build their payloads.
 *   checkSurfaceGuard     — return a violation string (or null) for a target_context gate.
 *
 * Import `surface-keys.ts` DIRECTLY, not the `add-gallery` barrel — the barrel
 * drags a `.css` side-effect that breaks the tsx test runner.
 */

import {
  CATALOG_SURFACE_KEYS,
  surfaceAllowedForTarget,
  type CatalogSurfaceKey,
} from "@/lib/site-admin/add-gallery/surface-keys";
import type { SetCatalogOverlayInput } from "@/lib/site-admin/add-gallery/registry-db-merge";

// ── Surface-key → input-field mapping ─────────────────────────────────────────

/** Maps each catalog surface key to its overlay-input boolean field. */
const SURFACE_KEY_TO_INPUT_FIELD: Record<
  CatalogSurfaceKey,
  keyof SetCatalogOverlayInput
> = {
  talent_profile: "talent_profile_enabled",
  talent_shell: "talent_shell_enabled",
  workspace_page: "workspace_page_enabled",
  workspace_shell: "workspace_shell_enabled",
};

// ── enablingSurfaceKeys ───────────────────────────────────────────────────────

/**
 * The surface keys an overlay input is ENABLING (setting to `true`). Drives the
 * X3 tighten-only guard on BOTH the single-row and the batch write paths.
 */
export function enablingSurfaceKeys(
  input: SetCatalogOverlayInput,
): CatalogSurfaceKey[] {
  return CATALOG_SURFACE_KEYS.filter(
    (sk) => input[SURFACE_KEY_TO_INPUT_FIELD[sk]] === true,
  );
}

// ── buildOverlayPayload ───────────────────────────────────────────────────────

/**
 * Build the upsert payload for one overlay row. Includes ALL fields when
 * defined in the input:
 *   - core: item_ref, source, updated_by
 *   - legacy pair: talent_enabled, workspace_enabled
 *   - X4 quad: talent_profile_enabled, talent_shell_enabled,
 *              workspace_page_enabled, workspace_shell_enabled
 *   - X6: lab_enabled
 *   - override fields: label_override, icon_override, category_override,
 *                      required_plan_override, availability_override,
 *                      default_variant, default_props, data_source_defaults,
 *                      locked_props
 *
 * Only defined values are included (undefined fields are absent — no accidental
 * null writes). Explicit `null` values ARE included (they signal a clear).
 */
export function buildOverlayPayload(
  input: SetCatalogOverlayInput,
  userId: string,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    item_ref: input.item_ref,
    source: input.source,
    updated_by: userId,
  };

  const assign = <K extends keyof SetCatalogOverlayInput>(key: K) => {
    if (input[key] !== undefined) payload[key] = input[key];
  };

  // Legacy 2-toggle axis (dual-written for back-compat).
  assign("talent_enabled");
  assign("workspace_enabled");
  // X4 — the four independent per-surface toggles.
  assign("talent_profile_enabled");
  assign("talent_shell_enabled");
  assign("workspace_page_enabled");
  assign("workspace_shell_enabled");
  // X6 — the independent Builder-Lab visibility toggle (orthogonal 5th axis).
  assign("lab_enabled");
  // Override fields.
  assign("label_override");
  assign("icon_override");
  assign("category_override");
  assign("required_plan_override");
  assign("availability_override");
  assign("default_variant");
  assign("default_props");
  assign("data_source_defaults");
  assign("locked_props");

  return payload;
}

// ── buildBatchPayloads ────────────────────────────────────────────────────────

/**
 * Deduplicate N inputs by `item_ref` (last entry wins) and build their upsert
 * payloads. Inputs missing `item_ref` are collected as errors; valid entries
 * still produce payloads (a bad row never blocks the rest).
 *
 * This mirrors the deduplication + payload-building step of
 * `setComponentOverlayBatch` so it can be unit-tested without the auth gate or
 * Supabase client.
 */
export function buildBatchPayloads(
  inputs: SetCatalogOverlayInput[],
  userId = "user-123",
): { payloads: Record<string, unknown>[]; errors: string[] } {
  const errors: string[] = [];

  // Deduplicate — last writer wins.
  const seen = new Map<string, SetCatalogOverlayInput>();
  for (const input of inputs) {
    if (input.item_ref) seen.set(input.item_ref, input);
  }

  // Collect validation errors for entries missing item_ref.
  for (const input of inputs) {
    if (!input.item_ref) errors.push("Missing item reference.");
  }

  const payloads: Record<string, unknown>[] = [];
  for (const [, input] of seen) {
    payloads.push(buildOverlayPayload(input, userId));
  }

  return { payloads, errors };
}

// ── checkSurfaceGuard ─────────────────────────────────────────────────────────

/**
 * Validate the X3 tighten-only invariant: returns an error string if the input
 * tries to ENABLE a surface that `targetContext` forbids, or `null` if all is well.
 *
 * Only evaluates when at least one surface toggle is being set to `true`; a
 * write that only disables surfaces or touches non-surface fields always passes.
 * The `lab_enabled` axis is never gated (it is orthogonal to target_context).
 */
export function checkSurfaceGuard(
  input: SetCatalogOverlayInput,
  targetContext: "talent" | "workspace" | "both" | "platform",
): string | null {
  const enabling = enablingSurfaceKeys(input);
  if (enabling.length === 0) return null;

  const violations = enabling.filter(
    (sk) => !surfaceAllowedForTarget(targetContext, sk),
  );
  if (violations.length === 0) return null;

  return `Tighten-only invariant: component targets "${targetContext}"; cannot enable surface(s): ${violations.join(", ")}.`;
}
