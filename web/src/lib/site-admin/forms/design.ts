/**
 * Phase 5 / M6 — design controls form schemas.
 *
 * Mutation paths (mirrors pages / sections / homepage):
 *   1. designSaveDraftSchema       — patch the draft theme_json.
 *   2. designPublishSchema         — promote draft → live (CAS only; gates
 *                                    live in the server op).
 *   3. designRestoreRevisionSchema — re-hydrate the draft from a prior
 *                                    revision row (no publish).
 *
 * Token discipline (the critical M6 gate):
 *   - The payload is a `{ key → value }` map. Keys MUST be registered in
 *     `tokens/registry.ts` AND be `agencyConfigurable: true`. Values MUST
 *     pass the registry's per-key validator.
 *   - Enforcement is delegated to `validateThemePatch` (same function the
 *     server op uses) so there's ONE allowlist across form + server.
 *   - Zod surfaces per-key failures at `patch.<key>` so the UI can paint a
 *     field-level error next to the offending input.
 *   - Non-allowlisted keys never reach the DB: an unknown key => the whole
 *     patch is rejected. Partial acceptance is unsafe (it would silently
 *     drop the operator's intended change and make the editor appear to
 *     save successfully).
 *
 * Concurrency:
 *   - All three envelopes carry `expectedVersion`. The shared
 *     `agency_branding.version` is the CAS target — design writes share the
 *     same integer with M1 branding writes (one row, one version).
 *
 * Rollback discipline:
 *   - Restore lands the snapshot into theme_json_draft. Publish stays a
 *     separate operator action. Same as M3/M4/M5.
 */

import { z } from "zod";

import { validateThemePatch } from "../tokens/registry";

// ---- patch payload --------------------------------------------------------

/**
 * The raw patch is `Record<string, unknown>` because values are heterogeneous
 * (hex strings, enum strings). The Zod surface runs it through
 * `validateThemePatch` and re-emits either normalized `Record<string, string>`
 * or a Zod issue per offending key.
 *
 * Note on the "full replacement vs merge" question: the server op treats the
 * patch as a COMPLETE draft replacement, not a merge. That's intentional —
 * the design editor always submits the full form state, so a missing key
 * means the operator cleared it back to the platform default. Partial-patch
 * semantics invite stale-field bugs.
 */
export const designPatchSchema = z
  .record(z.string(), z.unknown())
  .superRefine((patch, ctx) => {
    const result = validateThemePatch(patch);
    if (!result.ok) {
      for (const key of result.rejected) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: result.reasons[key] ?? "Invalid value",
        });
      }
    }
  })
  .transform((patch) => {
    // Re-run validation on the transform path so the output type is the
    // normalised `Record<string, string>` — Zod's superRefine doesn't
    // expose a way to mutate the parsed value. If validation passed in the
    // refine step, this branch will always succeed.
    const result = validateThemePatch(patch);
    if (!result.ok) {
      // Shouldn't happen (refine already failed); defensive.
      return {} as Record<string, string>;
    }
    return result.normalized;
  });

export type DesignPatchInput = z.input<typeof designPatchSchema>;
export type DesignPatchValues = z.output<typeof designPatchSchema>;

// ---- save draft -----------------------------------------------------------

export const designSaveDraftSchema = z.object({
  tenantId: z.string().uuid(),
  expectedVersion: z.number().int().min(0),
  patch: designPatchSchema,
});

export type DesignSaveDraftInput = z.input<typeof designSaveDraftSchema>;
export type DesignSaveDraftValues = z.output<typeof designSaveDraftSchema>;

// ---- publish --------------------------------------------------------------

/**
 * CAS-only publish envelope. All gates (draft re-validates against the
 * current registry, non-empty where required, hex contrast sanity) live in
 * the server op.
 */
export const designPublishSchema = z.object({
  tenantId: z.string().uuid(),
  expectedVersion: z.number().int().min(0),
});

export type DesignPublishInput = z.input<typeof designPublishSchema>;
export type DesignPublishValues = z.output<typeof designPublishSchema>;

// ---- restore revision -----------------------------------------------------

export const designRestoreRevisionSchema = z.object({
  tenantId: z.string().uuid(),
  revisionId: z.string().uuid(),
  expectedVersion: z.number().int().min(0),
});

export type DesignRestoreRevisionInput = z.input<
  typeof designRestoreRevisionSchema
>;
export type DesignRestoreRevisionValues = z.output<
  typeof designRestoreRevisionSchema
>;
