/**
 * Phase 5 / M6 — design controls server operations.
 *
 * Consumed by `/admin/site-settings/design` Server Actions. Writes stay
 * uniform with M3/M4/M5: CAS, audit, revision, cache-bust discipline.
 *
 * Three lifecycles:
 *   - SAVE DRAFT → `saveDesignDraft`
 *     Capability `agency.site_admin.design.edit`.
 *     CAS `agency_branding.version`. Validates + normalises the patch
 *     against the token registry (keys must be agencyConfigurable;
 *     values must pass the per-key validator). Writes theme_json_draft.
 *     NO cache bust — drafts have no public effect.
 *   - PUBLISH → `publishDesign`
 *     Capability `agency.site_admin.design.publish`.
 *     CAS. Re-validates the current theme_json_draft against the registry
 *     at publish time (defensive — catches a registry-lockdown change
 *     between draft save and publish). Copies theme_json_draft → theme_json,
 *     stamps theme_published_at. Writes kind='published' revision. BUSTS
 *     `branding` + `storefront` tags so the storefront picks up tokens.
 *   - ROLLBACK → `restoreDesignRevision`
 *     Capability `agency.site_admin.design.edit`.
 *     CAS. Loads revision snapshot, defensively re-filters to current
 *     agency-configurable keys (in case a token was retired since the
 *     revision was written), writes theme_json_draft. NO cache bust; the
 *     storefront keeps serving the prior live tokens until the operator
 *     publishes.
 *
 * Isolation from M1 branding basics:
 *   - Design ops never touch primary_color / accent_color / logo_* / font_*
 *     — those stay on the M1 saveBranding path. Revisions created by design
 *     ops still include those fields in the snapshot (they sit on the same
 *     row), so history is faithful, but the replay on restore only writes
 *     theme_json_draft.
 *   - The shared `agency_branding.version` column is the sole CAS target:
 *     an M1 branding edit between draft save and publish will surface as
 *     VERSION_CONFLICT at publish time and force a re-read, same as the
 *     cross-editor collisions elsewhere in Phase 5.
 */

import { randomUUID } from "node:crypto";
import { updateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  emitAuditEvent,
  fail,
  ok,
  requirePhase5Capability,
  tagFor,
  validateThemePatch,
  versionConflict,
  type Phase5Result,
} from "@/lib/site-admin";
import type {
  DesignPublishValues,
  DesignRestoreRevisionValues,
  DesignSaveDraftValues,
} from "@/lib/site-admin/forms/design";

// ---- row shapes -----------------------------------------------------------

/**
 * Storage form of the branding row with M6 extensions. Mirrors
 * `server/branding.BrandingRow` + `theme_json_draft` + `theme_published_at`.
 * We re-declare here (rather than cross-import) because the design server
 * op and the branding server op have diverging lifecycle surfaces; keeping
 * the shapes independent reduces cross-module coupling.
 */
export interface DesignBrandingRow {
  tenant_id: string;
  theme_json: Record<string, string>;
  theme_json_draft: Record<string, string>;
  /**
   * M7 — slug of the last applied preset (e.g. 'editorial-bridal').
   * Null for tenants that have never applied a preset / are fully custom.
   * Metadata only — not read at render time.
   */
  theme_preset_slug: string | null;
  theme_published_at: string | null;
  version: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Snapshot shape written to agency_branding_revisions.snapshot for design ops. */
export interface DesignRevisionSnapshot {
  kind: "draft" | "published" | "rollback";
  theme_json: Record<string, string>;
  theme_json_draft: Record<string, string>;
  /** M7 — preset slug at revision time (may be null on legacy revisions). */
  theme_preset_slug?: string | null;
  theme_published_at: string | null;
  version: number;
}

export interface DesignRevisionRow {
  id: string;
  tenant_id: string;
  kind: "draft" | "published" | "rollback";
  version: number;
  snapshot: DesignRevisionSnapshot;
  created_by: string | null;
  created_at: string;
}

const DESIGN_SELECT = `
  tenant_id,
  theme_json,
  theme_json_draft,
  theme_preset_slug,
  theme_published_at,
  version,
  updated_by,
  created_at,
  updated_at
`;

const DESIGN_REVISION_SELECT = `
  id,
  tenant_id,
  kind,
  version,
  snapshot,
  created_by,
  created_at
`;

// ---- shared helpers -------------------------------------------------------

function bustDesignTags(tenantId: string): void {
  // Design publishes feed the storefront chrome + any CMS-rendered sections
  // that consume tokens via CSS vars. Bust both the branding-scoped tag and
  // the global tenant storefront tag so every downstream route that opted
  // into either one revalidates on the next read.
  updateTag(tagFor(tenantId, "branding"));
  updateTag(tagFor(tenantId, "storefront"));
}

async function loadRow(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<DesignBrandingRow | null> {
  const { data, error } = await supabase
    .from("agency_branding")
    .select(DESIGN_SELECT)
    .eq("tenant_id", tenantId)
    .maybeSingle<DesignBrandingRow>();
  if (error) {
    console.warn("[site-admin/design] row load failed", {
      tenantId,
      error: error.message,
    });
    return null;
  }
  return data ?? null;
}

async function insertDesignRevision(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    kind: "draft" | "published" | "rollback";
    version: number;
    snapshot: DesignRevisionSnapshot;
    actorProfileId: string | null;
  },
): Promise<void> {
  const { error } = await supabase.from("agency_branding_revisions").insert({
    tenant_id: params.tenantId,
    kind: params.kind,
    version: params.version,
    snapshot: params.snapshot,
    created_by: params.actorProfileId,
  });
  if (error) {
    console.warn("[site-admin/design] revision insert failed", {
      tenantId: params.tenantId,
      kind: params.kind,
      version: params.version,
      error: error.message,
    });
  }
}

function diffSummary(
  before: DesignBrandingRow | null,
  after: DesignBrandingRow,
  kind: "draft" | "published" | "rollback",
): string {
  const beforeKeys = new Set(Object.keys(before?.theme_json_draft ?? {}));
  const afterKeys = new Set(Object.keys(after.theme_json_draft));
  const draftChanged: string[] = [];
  for (const k of afterKeys) {
    if (
      before?.theme_json_draft?.[k] !== after.theme_json_draft[k]
    ) {
      draftChanged.push(k);
    }
  }
  for (const k of beforeKeys) {
    if (!afterKeys.has(k)) draftChanged.push(`-${k}`);
  }
  const liveChanged: string[] = [];
  if (before && before.theme_json !== after.theme_json) {
    // Coarse: any live token change is a publish, which we label by count.
    liveChanged.push(
      `live tokens: ${Object.keys(after.theme_json).length} (was ${Object.keys(before.theme_json).length})`,
    );
  }
  const parts: string[] = [];
  if (kind === "draft") {
    parts.push(
      draftChanged.length
        ? `design draft tokens: ${draftChanged.join(", ")}`
        : "design draft touched (no token change)",
    );
  } else if (kind === "published") {
    parts.push(
      `design published v${after.version}`,
      ...liveChanged,
    );
  } else {
    parts.push(
      `design rollback → draft v${after.version}`,
      ...(draftChanged.length ? [`tokens: ${draftChanged.join(", ")}`] : []),
    );
  }
  return parts.join("; ");
}

// ---- save draft -----------------------------------------------------------

export async function saveDesignDraft(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    values: DesignSaveDraftValues;
    actorProfileId: string | null;
    correlationId?: string;
  },
): Promise<Phase5Result<{ version: number; themeDraft: Record<string, string> }>> {
  const { tenantId, values, actorProfileId } = params;
  const correlationId = params.correlationId ?? randomUUID();

  await requirePhase5Capability("agency.site_admin.design.edit", tenantId);

  const beforeRow = await loadRow(supabase, tenantId);
  if (!beforeRow) {
    // Branding row is seeded per tenant at provisioning time. Absence here
    // means the tenant is misconfigured; surface NOT_FOUND so the caller
    // can redirect to the branding onboarding flow.
    return fail(
      "NOT_FOUND",
      "Branding row missing. Initialise branding before editing design tokens.",
    );
  }

  if (beforeRow.version !== values.expectedVersion) {
    return versionConflict(beforeRow.version);
  }

  // Re-validate here as well — `values.patch` is already normalised by the
  // Zod schema, but belt-and-braces catches a mutated import path or a
  // caller that bypassed the schema layer.
  const gate = validateThemePatch(values.patch);
  if (!gate.ok) {
    return fail(
      "TOKEN_NOT_OVERRIDABLE",
      `Rejected keys: ${gate.rejected.join(", ")}`,
    );
  }

  const nextVersion = beforeRow.version + 1;
  const { data: updatedRow, error: updateError } = await supabase
    .from("agency_branding")
    .update({
      theme_json_draft: gate.normalized,
      version: nextVersion,
      updated_by: actorProfileId,
    })
    .eq("tenant_id", tenantId)
    .eq("version", beforeRow.version)
    .select(DESIGN_SELECT)
    .maybeSingle<DesignBrandingRow>();
  if (updateError) {
    return fail("FORBIDDEN", updateError.message);
  }
  if (!updatedRow) {
    // The version moved between our read and update — re-read to surface
    // the current version in the conflict response.
    const fresh = await loadRow(supabase, tenantId);
    return versionConflict(fresh?.version ?? beforeRow.version + 1);
  }

  await insertDesignRevision(supabase, {
    tenantId,
    kind: "draft",
    version: updatedRow.version,
    snapshot: {
      kind: "draft",
      theme_json: updatedRow.theme_json,
      theme_json_draft: updatedRow.theme_json_draft,
      theme_published_at: updatedRow.theme_published_at,
      version: updatedRow.version,
    },
    actorProfileId,
  });

  await emitAuditEvent(supabase, {
    tenantId,
    actorProfileId,
    action: "agency.site_admin.design.edit",
    entityType: "agency_branding",
    entityId: tenantId,
    diffSummary: diffSummary(beforeRow, updatedRow, "draft"),
    beforeSnapshot: beforeRow,
    afterSnapshot: updatedRow,
    correlationId,
  });

  // NO cache bust — draft has no storefront effect.

  return ok({
    version: updatedRow.version,
    themeDraft: updatedRow.theme_json_draft,
  });
}

// ---- publish --------------------------------------------------------------

export async function publishDesign(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    values: DesignPublishValues;
    actorProfileId: string | null;
    correlationId?: string;
  },
): Promise<Phase5Result<{ version: number; theme: Record<string, string> }>> {
  const { tenantId, values, actorProfileId } = params;
  const correlationId = params.correlationId ?? randomUUID();

  await requirePhase5Capability("agency.site_admin.design.publish", tenantId);

  const beforeRow = await loadRow(supabase, tenantId);
  if (!beforeRow) {
    return fail("NOT_FOUND", "Branding row missing.");
  }
  if (beforeRow.version !== values.expectedVersion) {
    return versionConflict(beforeRow.version);
  }

  // Re-validate the current draft against the CURRENT registry so a
  // registry lockdown (token removed / downgraded to platform-only) blocks
  // the publish rather than leaking a stale token into the live row.
  const gate = validateThemePatch(beforeRow.theme_json_draft);
  if (!gate.ok) {
    return fail(
      "PUBLISH_NOT_READY",
      `Design draft has rejected tokens (${gate.rejected.join(", ")}). Re-save the draft with valid tokens before publishing.`,
    );
  }

  const nextVersion = beforeRow.version + 1;
  const now = new Date().toISOString();
  const { data: updatedRow, error: updateError } = await supabase
    .from("agency_branding")
    .update({
      theme_json: gate.normalized,
      theme_published_at: now,
      version: nextVersion,
      updated_by: actorProfileId,
    })
    .eq("tenant_id", tenantId)
    .eq("version", beforeRow.version)
    .select(DESIGN_SELECT)
    .maybeSingle<DesignBrandingRow>();
  if (updateError) {
    return fail("FORBIDDEN", updateError.message);
  }
  if (!updatedRow) {
    const fresh = await loadRow(supabase, tenantId);
    return versionConflict(fresh?.version ?? beforeRow.version + 1);
  }

  await insertDesignRevision(supabase, {
    tenantId,
    kind: "published",
    version: updatedRow.version,
    snapshot: {
      kind: "published",
      theme_json: updatedRow.theme_json,
      theme_json_draft: updatedRow.theme_json_draft,
      theme_published_at: updatedRow.theme_published_at,
      version: updatedRow.version,
    },
    actorProfileId,
  });

  await emitAuditEvent(supabase, {
    tenantId,
    actorProfileId,
    action: "agency.site_admin.design.publish",
    entityType: "agency_branding",
    entityId: tenantId,
    diffSummary: diffSummary(beforeRow, updatedRow, "published"),
    beforeSnapshot: beforeRow,
    afterSnapshot: updatedRow,
    correlationId,
  });

  bustDesignTags(tenantId);

  return ok({
    version: updatedRow.version,
    theme: updatedRow.theme_json,
  });
}

// ---- restore revision -----------------------------------------------------

export async function restoreDesignRevision(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    values: DesignRestoreRevisionValues;
    actorProfileId: string | null;
    correlationId?: string;
  },
): Promise<Phase5Result<{ version: number; themeDraft: Record<string, string> }>> {
  const { tenantId, values, actorProfileId } = params;
  const correlationId = params.correlationId ?? randomUUID();

  await requirePhase5Capability("agency.site_admin.design.edit", tenantId);

  const beforeRow = await loadRow(supabase, tenantId);
  if (!beforeRow) {
    return fail("NOT_FOUND", "Branding row missing.");
  }
  if (beforeRow.version !== values.expectedVersion) {
    return versionConflict(beforeRow.version);
  }

  const { data: revRow, error: revError } = await supabase
    .from("agency_branding_revisions")
    .select(DESIGN_REVISION_SELECT)
    .eq("tenant_id", tenantId)
    .eq("id", values.revisionId)
    .maybeSingle<DesignRevisionRow>();
  if (revError) {
    return fail("FORBIDDEN", revError.message);
  }
  if (!revRow) {
    return fail("NOT_FOUND", "Revision not found.");
  }

  // Prefer `theme_json_draft` from the revision when present (covers rollback
  // of an earlier draft); fall back to `theme_json` for M1-era revisions that
  // predate the M6 draft split. `validateThemePatch` filters out any token
  // keys that have been retired since the revision was created.
  const source =
    revRow.snapshot.theme_json_draft ??
    revRow.snapshot.theme_json ??
    {};
  const gate = validateThemePatch(source);
  const rebuiltDraft = gate.ok ? gate.normalized : {};
  if (!gate.ok) {
    console.warn(
      "[site-admin/design] restore dropped unknown/non-configurable tokens",
      {
        tenantId,
        revisionId: values.revisionId,
        dropped: gate.rejected,
      },
    );
  }

  const nextVersion = beforeRow.version + 1;
  const { data: updatedRow, error: updateError } = await supabase
    .from("agency_branding")
    .update({
      theme_json_draft: rebuiltDraft,
      version: nextVersion,
      updated_by: actorProfileId,
    })
    .eq("tenant_id", tenantId)
    .eq("version", beforeRow.version)
    .select(DESIGN_SELECT)
    .maybeSingle<DesignBrandingRow>();
  if (updateError) {
    return fail("FORBIDDEN", updateError.message);
  }
  if (!updatedRow) {
    const fresh = await loadRow(supabase, tenantId);
    return versionConflict(fresh?.version ?? beforeRow.version + 1);
  }

  await insertDesignRevision(supabase, {
    tenantId,
    kind: "rollback",
    version: updatedRow.version,
    snapshot: {
      kind: "rollback",
      theme_json: updatedRow.theme_json,
      theme_json_draft: updatedRow.theme_json_draft,
      theme_published_at: updatedRow.theme_published_at,
      version: updatedRow.version,
    },
    actorProfileId,
  });

  await emitAuditEvent(supabase, {
    tenantId,
    actorProfileId,
    action: "agency.site_admin.design.edit",
    entityType: "agency_branding",
    entityId: tenantId,
    diffSummary: diffSummary(beforeRow, updatedRow, "rollback"),
    beforeSnapshot: beforeRow,
    afterSnapshot: updatedRow,
    correlationId,
  });

  // NO cache bust — rollback lands as draft, not live.

  return ok({
    version: updatedRow.version,
    themeDraft: updatedRow.theme_json_draft,
  });
}

// ---- apply theme preset (M7) ---------------------------------------------

/**
 * M7 — apply a named theme preset.
 *
 * Unlike `saveDesignDraft` which replaces `theme_json_draft` entirely with
 * the patch, preset application is an **additive merge**:
 *   1. Start from the current `theme_json_draft` (operator's working copy).
 *   2. Overlay the preset's `tokens` map on top — only the preset's keys
 *      are overwritten; every orthogonal token the operator has customised
 *      (logo, custom primary, etc.) is preserved.
 *   3. Stamp `theme_preset_slug = preset.slug` so the admin UI can show
 *      "Editorial Bridal" as the active preset.
 *
 * The operator can still tweak individual tokens after applying — the
 * preset slug stays as a hint ("you're on Editorial Bridal with overrides").
 *
 * Capability: `agency.site_admin.design.edit` (same as draft save).
 * Cache: NO bust — this lands as a draft; publish is a separate step.
 */
export async function applyThemePreset(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    presetSlug: string;
    expectedVersion: number;
    actorProfileId: string | null;
    correlationId?: string;
  },
): Promise<
  Phase5Result<{
    version: number;
    themeDraft: Record<string, string>;
    presetSlug: string;
  }>
> {
  const { tenantId, presetSlug, expectedVersion, actorProfileId } = params;
  const correlationId = params.correlationId ?? randomUUID();

  await requirePhase5Capability("agency.site_admin.design.edit", tenantId);

  // Lazy-load to avoid a circular dep between server/design.ts and presets.
  const { getThemePreset } = await import("@/lib/site-admin/presets/theme-presets");
  const preset = getThemePreset(presetSlug);
  if (!preset) {
    return fail("NOT_FOUND", `Unknown theme preset: ${presetSlug}`);
  }

  const beforeRow = await loadRow(supabase, tenantId);
  if (!beforeRow) {
    return fail(
      "NOT_FOUND",
      "Branding row missing. Initialise branding before applying a theme preset.",
    );
  }
  if (beforeRow.version !== expectedVersion) {
    return versionConflict(beforeRow.version);
  }

  // Merge: operator draft + preset bundle. Preset wins on its keys only.
  const merged: Record<string, string> = {
    ...beforeRow.theme_json_draft,
    ...preset.tokens,
  };

  // Defensive: run the merged map through the registry gate so a bad preset
  // (caught by the module-load validator) or a stale draft key still gets
  // filtered out before it hits the database.
  const gate = validateThemePatch(merged);
  if (!gate.ok) {
    return fail(
      "TOKEN_NOT_OVERRIDABLE",
      `Preset produced rejected keys: ${gate.rejected.join(", ")}`,
    );
  }

  const nextVersion = beforeRow.version + 1;
  const { data: updatedRow, error: updateError } = await supabase
    .from("agency_branding")
    .update({
      theme_json_draft: gate.normalized,
      theme_preset_slug: preset.slug,
      version: nextVersion,
      updated_by: actorProfileId,
    })
    .eq("tenant_id", tenantId)
    .eq("version", beforeRow.version)
    .select(DESIGN_SELECT)
    .maybeSingle<DesignBrandingRow>();
  if (updateError) {
    return fail("FORBIDDEN", updateError.message);
  }
  if (!updatedRow) {
    const fresh = await loadRow(supabase, tenantId);
    return versionConflict(fresh?.version ?? beforeRow.version + 1);
  }

  await insertDesignRevision(supabase, {
    tenantId,
    kind: "draft",
    version: updatedRow.version,
    snapshot: {
      kind: "draft",
      theme_json: updatedRow.theme_json,
      theme_json_draft: updatedRow.theme_json_draft,
      theme_preset_slug: updatedRow.theme_preset_slug,
      theme_published_at: updatedRow.theme_published_at,
      version: updatedRow.version,
    },
    actorProfileId,
  });

  await emitAuditEvent(supabase, {
    tenantId,
    actorProfileId,
    action: "agency.site_admin.design.edit",
    entityType: "agency_branding",
    entityId: tenantId,
    diffSummary: `applied preset "${preset.slug}" → draft (${Object.keys(preset.tokens).length} tokens)`,
    beforeSnapshot: beforeRow,
    afterSnapshot: updatedRow,
    correlationId,
  });

  // NO cache bust — preset application lands in draft, not live.

  return ok({
    version: updatedRow.version,
    themeDraft: updatedRow.theme_json_draft,
    presetSlug: preset.slug,
  });
}

// ---- uncached staff reads -------------------------------------------------

/**
 * Uncached staff read: the full design row (live + draft + publish ts +
 * version). Design admin UI uses this as the source of truth; public reads
 * go through `loadPublicBranding` (cached).
 */
export async function loadDesignForStaff(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<DesignBrandingRow | null> {
  return loadRow(supabase, tenantId);
}

/**
 * Load design revision history (newest first), capped at `limit`. Includes
 * every kind (draft / published / rollback / pre-M6 published-equivalent).
 * The UI filters by `kind` for the "Restore as draft" list so operators
 * can skim published-only history for recovery.
 */
export async function loadDesignRevisionsForStaff(
  supabase: SupabaseClient,
  tenantId: string,
  limit = 50,
): Promise<DesignRevisionRow[]> {
  const { data, error } = await supabase
    .from("agency_branding_revisions")
    .select(DESIGN_REVISION_SELECT)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("[site-admin/design] staff revisions failed", {
      tenantId,
      error: error.message,
    });
    return [];
  }
  return (data ?? []) as DesignRevisionRow[];
}
