/* eslint-disable max-lines -- the design lifecycle (save/publish/restore/preset
   for theme tokens + GAP B component-style defaults) is one cohesive server
   module; splitting it fragments the shared row/CAS/revision helpers. */
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

import { improntaLog } from "@/lib/server/structured-log";
import { splitLegacyThemeKeys } from "@/lib/site-admin/tokens/legacy-passthrough";
import {
  checkThemePublishShrink,
  THEME_PUBLISH_SHRINK_BLOCKED_CODE,
} from "@/lib/site-admin/tokens/theme-shrink-guard";
import { randomUUID } from "node:crypto";
import { updateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  scheduleAuditEvent,
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
import {
  normalizeComponentStyleDefaults,
  validateComponentStyleDefaults,
  type ComponentStyleDefaults,
} from "@/lib/site-admin/builder-node/component-style-defaults";

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
   * GAP B — per-component-type default styles. LIVE + draft, mirroring the
   * theme_json pair. Optional in the type because legacy rows predate the
   * columns; the DB default is `{}` so reads are always an object in practice.
   */
  component_styles_json?: Record<string, unknown> | null;
  component_styles_json_draft?: Record<string, unknown> | null;
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
  /**
   * Marks the PRE-IMAGE snapshot `publishDesign` writes before it mutates the
   * live row. Recorded as `kind: "draft"` (the DB check constraint is a closed
   * set of draft/published/rollback) but flagged here so recovery tooling and
   * the restore list can tell "the draft as it stood immediately before publish
   * v161" apart from an ordinary draft save.
   *
   * This exists because the 2026-08-16 wipe was only recoverable by luck: the
   * draft revision that happened to precede the publish still carried the 58
   * live tokens. Recoverability is now guaranteed, not coincidental.
   */
  pre_publish?: true;
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
  component_styles_json,
  component_styles_json_draft,
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
  // that consume tokens via CSS vars. Bust the branding-scoped tag and the
  // global tenant storefront tag so every downstream route that opted into
  // either one revalidates on the next read. Also bust the card-design tag:
  // the per-tenant card-design resolver (card-design-resolver.ts) caches the
  // projected card palette under it, so a publish must drop that entry too.
  // (The resolver also tags `branding`, so this is belt-and-suspenders today,
  // but it keeps the resolver's documented "busts it instantly" contract true
  // if card-design publishing is ever split off the branding write.)
  updateTag(tagFor(tenantId, "branding"));
  updateTag(tagFor(tenantId, "storefront"));
  updateTag(tagFor(tenantId, "card-design"));
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
    void improntaLog("site_admin_design.warn", {
      message: "[site-admin/design] row load failed",
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
    void improntaLog("site_admin_design.warn", {
      message: "[site-admin/design] revision insert failed",
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
    /**
     * PARTIAL patch mode. Default (false) REPLACES `theme_json_draft` with the
     * patch — correct for the ThemeDrawer, which owns the whole theme and always
     * submits a complete map, so an absent key there means "cleared".
     *
     * A surface that edits a FEW tokens (the site-header inspector's chips) must
     * pass true. Replacing the shared draft column with a one-key patch is how
     * the 2026-08-16 wipe started: the draft went to 1 key, and the unscoped
     * publish that followed promoted that 1 key over 55 live tokens.
     *
     * The merge runs inside the same CAS window as the write, so it cannot race
     * a concurrent draft save.
     */
    mergeIntoStoredDraft?: boolean;
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
  // caller that bypassed the schema layer. Legacy passthrough keys are split
  // out first: they are not registry tokens and must never fail the gate.
  const gate = validateThemePatch(
    splitLegacyThemeKeys(values.patch as Record<string, unknown>).registryCandidate,
  );
  if (!gate.ok) {
    return fail(
      "TOKEN_NOT_OVERRIDABLE",
      `Rejected keys: ${gate.rejected.join(", ")}`,
    );
  }

  // Carry the STORED draft's legacy keys (logo_url / favicon_url /
  // watermark_preset) through unchanged — the design pipeline never edits
  // them, and dropping them breaks the public shell logo on publish.
  const storedDraftSplit = splitLegacyThemeKeys(
    (beforeRow.theme_json_draft ?? {}) as Record<string, unknown>,
  );
  const storedDraftLegacy = storedDraftSplit.legacy;
  // Partial-patch callers layer onto the stored draft tokens; whole-theme
  // callers replace them. See `mergeIntoStoredDraft`.
  const draftTokenBase = params.mergeIntoStoredDraft
    ? (storedDraftSplit.registryCandidate as Record<string, string>)
    : {};

  const nextVersion = beforeRow.version + 1;
  const { data: updatedRow, error: updateError } = await supabase
    .from("agency_branding")
    .update({
      theme_json_draft: { ...draftTokenBase, ...gate.normalized, ...storedDraftLegacy },
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

  scheduleAuditEvent(supabase, {
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

// ---- save component-style defaults draft (GAP B) --------------------------

/**
 * Save the per-component-type default styles to `component_styles_json_draft`.
 * Sibling of `saveDesignDraft`: same capability, same `version` CAS, same
 * no-cache-bust posture (a draft has no storefront effect until Publish copies
 * it across). Validates the incoming map against the builder-node style schema +
 * the closed node-kind set; rejects surface as a single error.
 */
export async function saveComponentStylesDraft(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    componentStyles: unknown;
    expectedVersion: number;
    actorProfileId: string | null;
    correlationId?: string;
  },
): Promise<
  Phase5Result<{ version: number; componentStylesDraft: ComponentStyleDefaults }>
> {
  const { tenantId, componentStyles, expectedVersion, actorProfileId } = params;
  const correlationId = params.correlationId ?? randomUUID();

  await requirePhase5Capability("agency.site_admin.design.edit", tenantId);

  const beforeRow = await loadRow(supabase, tenantId);
  if (!beforeRow) {
    return fail(
      "NOT_FOUND",
      "Branding row missing. Initialise branding before editing component defaults.",
    );
  }
  if (beforeRow.version !== expectedVersion) {
    return versionConflict(beforeRow.version);
  }

  const gate = validateComponentStyleDefaults(componentStyles);
  if (!gate.ok) {
    return fail(
      "TOKEN_NOT_OVERRIDABLE",
      `Rejected component styles: ${gate.rejected.join(", ")}`,
    );
  }

  const nextVersion = beforeRow.version + 1;
  const { data: updatedRow, error: updateError } = await supabase
    .from("agency_branding")
    .update({
      component_styles_json_draft: gate.normalized,
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

  scheduleAuditEvent(supabase, {
    tenantId,
    actorProfileId,
    action: "agency.site_admin.design.edit",
    entityType: "agency_branding",
    entityId: tenantId,
    diffSummary: `component defaults draft: ${Object.keys(gate.normalized).length} kind(s)`,
    beforeSnapshot: beforeRow,
    afterSnapshot: updatedRow,
    correlationId,
  });

  // NO cache bust — draft has no storefront effect.

  return ok({
    version: updatedRow.version,
    componentStylesDraft: normalizeComponentStyleDefaults(
      updatedRow.component_styles_json_draft,
    ),
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
    /**
     * SCOPED publish. When present, only these token keys are promoted from
     * the draft onto the live row; every other live token is left exactly as
     * it is, and the unpublished remainder stays in the draft for the surface
     * that owns it.
     *
     * `agency_branding` holds ONE draft that several surfaces write to, so an
     * unscoped publish ships whatever anyone else left pending — that is how a
     * card-colour publish repainted a whole storefront on 2026-08-15. The Card
     * Design studio passes CARD_DESIGN_SCOPE; the ThemeDrawer (which owns the
     * whole theme) passes nothing and keeps the full-promotion behaviour.
     */
    scopeKeys?: ReadonlySet<string>;
    /**
     * Explicit operator intent to shrink an established live theme. Bypasses
     * the shrink guard ONLY. No caller passes this today; it exists so a future
     * "reset this theme to platform defaults" flow states its intent by name
     * rather than tripping the guard with a deliberately small map.
     */
    allowThemeReduction?: boolean;
  },
): Promise<Phase5Result<{ version: number; theme: Record<string, string> }>> {
  const { tenantId, values, actorProfileId, scopeKeys } = params;
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
  // the publish rather than leaking a stale token into the live row. Legacy
  // passthrough keys are split out first — they are not registry tokens.
  const draftSplit = splitLegacyThemeKeys(
    (beforeRow.theme_json_draft ?? {}) as Record<string, unknown>,
  );
  // Validate only what this publish actually promotes. A scoped publish must
  // not be blocked by an invalid token belonging to a different surface —
  // "one bad key anywhere bricks every publish" is the same trap the legacy
  // passthrough fix removed.
  const promotable = scopeKeys
    ? Object.fromEntries(
        Object.entries(draftSplit.registryCandidate).filter(([k]) => scopeKeys.has(k)),
      )
    : draftSplit.registryCandidate;
  const gate = validateThemePatch(promotable);
  if (!gate.ok) {
    return fail(
      "PUBLISH_NOT_READY",
      `Design draft has rejected tokens (${gate.rejected.join(", ")}). Re-save the draft with valid tokens before publishing.`,
    );
  }

  // Preserve legacy keys on the LIVE row across the publish. They are
  // mirrored into `theme_json` by the settings/brand-library save paths
  // (often onto the live row only), so replacing the live map with the
  // normalized draft silently deleted the shell logo + favicon + watermark
  // config until the next settings save (2026-08-15 incident). Draft wins
  // where it carries a value; the live row fills the gaps.
  const liveLegacy = {
    ...splitLegacyThemeKeys(
      (beforeRow.theme_json ?? {}) as Record<string, unknown>,
    ).legacy,
    ...draftSplit.legacy,
  };

  const liveTokens = splitLegacyThemeKeys(
    (beforeRow.theme_json ?? {}) as Record<string, unknown>,
  ).registryCandidate as Record<string, string>;

  // Scoped: keep every live token and lay the promoted slice on top.
  // Unscoped: the normalized draft REPLACES live (the ThemeDrawer submits a
  // complete map, so a missing key there means "cleared back to default").
  //
  // EXCEPT when the draft carries NO registry tokens at all. "Promote nothing
  // over everything" is never an operator intent — it means the draft was never
  // seeded from live (a partial-patch writer replaced the whole draft column
  // with its one key, or the row was initialised with `theme_json_draft: {}`).
  // Seed from live instead of replacing live with nothing.
  const draftHasTokens = Object.keys(gate.normalized).length > 0;
  const seededFromLive = !scopeKeys && !draftHasTokens;
  if (seededFromLive) {
    void improntaLog("site_admin_design.warn", {
      message:
        "[site-admin/design] unscoped publish had an EMPTY token draft — seeded the live map from the current live tokens instead of clearing it",
      tenantId,
      liveTokenCount: Object.keys(liveTokens).length,
    });
  }
  const liveBase = scopeKeys || seededFromLive ? liveTokens : {};
  const nextTheme = { ...liveBase, ...gate.normalized, ...liveLegacy };

  // ---- shrink guard (class killer) ----------------------------------------
  // Last line of defence before the write, common to EVERY publish writer.
  // See tokens/theme-shrink-guard.ts for the threshold rationale.
  const shrink = checkThemePublishShrink({
    live: beforeRow.theme_json ?? {},
    next: nextTheme,
    allowReduction: params.allowThemeReduction,
  });
  if (!shrink.ok) {
    void improntaLog("site_admin_design.error", {
      message: "[site-admin/design] PUBLISH BLOCKED — theme shrink guard",
      code: THEME_PUBLISH_SHRINK_BLOCKED_CODE,
      tenantId,
      actorProfileId,
      correlationId,
      scoped: Boolean(scopeKeys),
      liveTokenCount: shrink.liveTokenCount,
      nextTokenCount: shrink.nextTokenCount,
      requiredMinimum: shrink.requiredMinimum,
      draftTokenCount: Object.keys(draftSplit.registryCandidate).length,
    });
    return fail("PUBLISH_NOT_READY", shrink.message);
  }

  const nextVersion = beforeRow.version + 1;

  // PRE-IMAGE revision, written BEFORE the mutation. The 2026-08-16 wipe was
  // recoverable only because an unrelated draft revision happened to sit 336ms
  // in front of it; every post-mutation revision records the damage, not the
  // thing you need to restore. This snapshot always precedes the write, so the
  // pre-publish state is on the record even if the update below succeeds and
  // the operator only notices the damage hours later.
  await insertDesignRevision(supabase, {
    tenantId,
    kind: "draft",
    version: beforeRow.version,
    snapshot: {
      kind: "draft",
      pre_publish: true,
      theme_json: beforeRow.theme_json ?? {},
      theme_json_draft: beforeRow.theme_json_draft ?? {},
      theme_preset_slug: beforeRow.theme_preset_slug ?? null,
      theme_published_at: beforeRow.theme_published_at,
      version: beforeRow.version,
    },
    actorProfileId,
  });

  const now = new Date().toISOString();
  // GAP B — publish the component-style defaults atomically with the theme:
  // copy the draft map across, validated/normalized so a stale or malformed
  // draft can never reach the LIVE column. An empty/absent draft publishes `{}`
  // (a no-op for tenants that never set component defaults).
  const componentStylesLive = normalizeComponentStyleDefaults(
    beforeRow.component_styles_json_draft,
  );
  const { data: updatedRow, error: updateError } = await supabase
    .from("agency_branding")
    .update({
      theme_json: nextTheme,
      component_styles_json: componentStylesLive,
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

  scheduleAuditEvent(supabase, {
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
  const sourceSplit = splitLegacyThemeKeys(source as Record<string, unknown>);
  const gate = validateThemePatch(sourceSplit.registryCandidate);
  // `normalized` always carries the registry-accepted subset (even when the
  // gate fails), so a snapshot with retired tokens restores everything else
  // instead of wiping the draft to {}. Legacy passthrough keys ride along.
  const rebuiltDraft = { ...gate.normalized, ...sourceSplit.legacy };
  if (!gate.ok) {
    void improntaLog("site_admin_design.warn", {
      message: "[site-admin/design] restore dropped unknown/non-configurable tokens",
      tenantId,
      revisionId: values.revisionId,
      dropped: gate.rejected.join(", "),
    });
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

  scheduleAuditEvent(supabase, {
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
  // Forgiving merge: a stale operator-draft key (left over from an older token
  // schema) or a preset key the registry no longer accepts must NOT block
  // applying the preset's valid tokens — that surfaced to operators as the
  // "Preset produced rejected keys: color.background" error. validateThemePatch
  // always returns the normalized (registry-accepted) subset, which includes
  // every preset key the registry still accepts; drop anything rejected and
  // proceed. Genuine preset-authoring mistakes are caught by the module-load
  // validator, so rejects reaching here are legacy/stale keys, safe to discard.
  // `gate.normalized` is the registry-accepted subset in both the ok and
  // rejected cases, so reading it unconditionally drops the stale keys and
  // applies the preset's valid tokens.
  const mergedSplit = splitLegacyThemeKeys(merged as Record<string, unknown>);
  const gate = validateThemePatch(mergedSplit.registryCandidate);

  // Legacy passthrough keys survive the preset. Writing `gate.normalized`
  // alone deleted logo_url / favicon_url / watermark_preset from the draft,
  // and the operator's next Publish then carried the logo-less draft live —
  // the 2026-08-15 incident where applying a site preset dropped Impronta's
  // logo and favicon.
  const nextVersion = beforeRow.version + 1;
  const { data: updatedRow, error: updateError } = await supabase
    .from("agency_branding")
    .update({
      theme_json_draft: { ...gate.normalized, ...mergedSplit.legacy },
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

  scheduleAuditEvent(supabase, {
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
 * Staff read that LAZY-INITIALISES the `agency_branding` row when absent.
 * Tenants provisioned outside the standard signup paths lack the row, and the
 * design studio dead-ended on "Branding row missing" with no self-service fix
 * (the Tulala hub workspace hit this). Seeds an empty row (registry defaults
 * apply); `ignoreDuplicates` + the re-read absorb initialiser races. Staff
 * membership RLS allows the insert.
 */
export async function loadOrInitDesignForStaff(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<DesignBrandingRow | null> {
  const row = await loadRow(supabase, tenantId);
  if (row) return row;
  await supabase.from("agency_branding").upsert(
    { tenant_id: tenantId, theme_json: {}, theme_json_draft: {} },
    { onConflict: "tenant_id", ignoreDuplicates: true },
  );
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
    void improntaLog("site_admin_design.warn", {
      message: "[site-admin/design] staff revisions failed",
      tenantId,
      error: error.message,
    });
    return [];
  }
  return (data ?? []) as DesignRevisionRow[];
}
