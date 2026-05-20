// src/lib/field-engine/resolve-talent-fields.ts
//
// THE single talent-field resolver for the catalog engine. Pure,
// auth-agnostic, no `"use server"` directive: it takes a Supabase
// client + ids + viewerRole and returns the resolved field array.
// Auth, ownership, and request-scope routing live in the callers
// (`admin-taxonomy.ts getFieldsForTalent`, `talent-field-values-catalog.ts
// getFieldsForTalentAsTalent`). Phase 5-δ extraction (2026-05-19) —
// before this file existed, there were two divergent resolvers in the
// two server-action wrappers; the talent-side copy never got the Phase 4
// `tenant_override` / `has_value` columns. Collapsing them here means
// every future change ships to both surfaces at once.
//
// Pipeline (per call):
//   1. Verify talent is on `tenantId`'s roster (caller-supplied tenantId;
//      this module does the check). On miss → `{ ok:false }`.
//   2. Value-presence — which `field_definition_id`s have a row in
//      `talent_profile_field_values` for this talent (presence only,
//      never the value). Phase 4 additive transparency.
//   3. Walk taxonomy: talent's primary + secondary terms, then up via
//      `taxonomy_terms.parent_id` to gather every term used for
//      recommendation matching + every parent_category for group
//      attribution.
//   4. Tenant-static catalog — `getCachedTenantFieldCatalog(tenantId)`
//      (defs + groups + parent→group mapping + recommendations +
//      workspace overlays). Cached at the tenant scope across every
//      talent in that tenant + every concurrent editor mount. Cache
//      miss falls back to inline queries on the caller's `supabase`
//      client (identical behaviour, just slower).
//   5. Resolve effective visibility per field via
//      `effectiveFieldVisibility` (the single shared primitive).
//   6. Aggregate the strongest recommendation per field and emit the
//      final ResolvedField + ResolvedFieldGroup arrays, with the Phase 4
//      `tenant_override` + `has_value` columns populated.

import { unstable_cache } from "next/cache";
import { effectiveFieldVisibility } from "@/lib/field-engine/effective-visibility";
import {
  CACHE_TAG_FIELD_CATALOG,
  fieldCatalogTagForTenant,
} from "@/lib/field-engine/cache-tags";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

/** ViewerRole accepted by the resolver. Authoritative union lives in
 *  `effective-visibility.ts`; we accept the staff + talent subset here
 *  because those are the only roles a wrapper can authenticate today. */
export type ResolverViewerRole =
  | "agency_admin"
  | "platform_admin"
  | "talent"
  | "coordinator";

export type ResolvedField = {
  field_definition_id: string;
  field_key: string;
  label: string;
  /** Spanish label — null when not translated; editor falls back to EN. */
  label_es: string | null;
  tier: "universal" | "global" | "type-specific";
  section: string;
  subsection: string | null;
  kind: string;
  /** Unit suffix for number inputs (e.g. "years", "guests"). Null = none. */
  unit: string | null;
  placeholder: string | null;
  /** Per-field guidance text shown while editing. Tenant `custom_helper`
   *  override falls back to the platform definition's `helper`. Null = none. */
  helper: string | null;
  /** For `select` and `multiselect` kinds: the choices list. */
  options: string[] | null;
  /** Default visibility channels — used as the fallback when a value
   *  has no `visibility_override`. Empty array == effectively private. */
  default_visibility: string[];
  is_required: boolean;
  is_recommended: boolean;
  display_order: number;
  /** Source term that brought this field in (NULL for universal/global). */
  source_term_id: string | null;
  /** Field group slug if this field belongs to one (e.g., 'physical-casting'). */
  field_group_slug: string | null;
  field_group_label: string | null;
  /** Phase 4 — five requirement-level booleans from recommendations. */
  required_at_registration: boolean;
  required_before_publish: boolean;
  required_before_verification: boolean;
  is_admin_only: boolean;
  requires_verification: boolean;
  /** Validation rules (JSONB schema). */
  validation_rules: Record<string, unknown> | null;
  /** Conditional visibility rule. */
  show_when: { field_key: string; operator: string; value: unknown } | null;
  /** Tells UI which group panel to render this field under. */
  brought_in_by:
    | { kind: "tier" }
    | { kind: "group"; group_slug: string; weight: string }
    | { kind: "recommendation"; term_id: string };
  /**
   * Phase 4 (additive, read-only transparency) — true when THIS tenant has
   * an explicit `workspace_profile_field_settings` row whose columns differ
   * from the platform default (visibility / enabled / required / relabel /
   * helper / order override present). Lets Agency Fields show a
   * "workspace override" vs "platform default" provenance badge without a
   * second query. Optional so other ResolvedField producers/consumers are
   * untouched; `undefined` == not computed (treat as platform default).
   */
  tenant_override?: boolean;
  /**
   * Phase 4 (additive, read-only transparency) — true when a row exists in
   * `talent_profile_field_values` for this talent + field (existence only,
   * not the value; the store is delete-on-empty so a row == a real value).
   * Optional; `undefined` == presence not computed by this producer.
   */
  has_value?: boolean;
};

export type ResolvedFieldGroup = {
  group_slug: string;
  group_label_en: string;
  group_label_es: string | null;
  weight: "default" | "heavy" | "light" | "optional";
  display_order: number;
  in_registration_wizard: boolean;
  field_count: number;
};

export type ResolveTalentFieldsResult =
  | { ok: true; fields: ResolvedField[]; groups: ResolvedFieldGroup[] }
  | { ok: false; error: string };

// Helper-local supabase typing. The real client carries deep generics
// (Database<...>, schema lookups, view inference) that fight TS in this
// narrow scope — and the resolver has no need to type-check column
// names against a schema since it queries the catalog tables generically.
// The two callers (`getFieldsForTalent` admin / `getFieldsForTalentAsTalent`
// talent) hand us the client they already authenticated. Same escape-hatch
// pattern as `mirrorWriteToLegacy`'s `MirrorSupabase` alias.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ResolverSupabase = any;

// ─── Engine telemetry — in-process counters (process-scoped, not durable) ────
// These reset on every cold start / process restart. Use only for ops debug
// in a running process — not for persistence or cross-replica aggregation.
type ResolverMetrics = {
  catalog_hits: number;
  catalog_misses: number;
  catalog_errors: number;
  resolver_calls: number;
};
const _metrics: ResolverMetrics = {
  catalog_hits: 0,
  catalog_misses: 0,
  catalog_errors: 0,
  resolver_calls: 0,
};

/** Returns a snapshot of in-process resolver counters. Synchronous helper
 *  because this module is NOT `"use server"`. Wrappers that need to surface
 *  this from a server-action boundary (admin-taxonomy.ts) wrap it async. */
export function getResolverMetricsSnapshotSync(): ResolverMetrics & {
  snapshot_at: string;
} {
  return { ..._metrics, snapshot_at: new Date().toISOString() };
}

// ─── P3 — tenant-static field-catalog cache ──────────────────────────────────
// The field catalog (definitions, groups, recommendations, parent→group
// links, workspace overlays) is IDENTICAL for every talent in a tenant
// and changes only when an admin edits the catalog/settings. This caches
// the tenant-static slice (keyed by tenant) so every open — and every
// concurrent mount — hits one shared cached value. Per-talent data
// (roster, taxonomy assignments, parent walk) stays uncached. Strictly
// additive: if the service client is unavailable or the load fails,
// `resolveTalentFields` falls back to inline queries on the caller's
// supabase client (zero behaviour change).

type FieldDefRow = {
  id: string; field_key: string; label: string; label_es: string | null;
  tier: string; section: string | null; subsection: string | null;
  kind: string; unit: string | null; placeholder: string | null;
  options: unknown; default_visibility: unknown; is_optional: boolean | null;
  display_order: number | null; field_group_id: string | null;
  validation_rules: unknown; show_when: unknown; deprecated_at: string | null;
  admin_only: boolean | null; is_sensitive: boolean | null;
  show_in_public: boolean | null;
  helper: string | null;
};

type TenantFieldCatalog = {
  defs: FieldDefRow[];
  groupRows: Array<{
    id: string; slug: string; name_en: string; name_es: string | null;
    sort_order: number; is_active: boolean;
  }>;
  allParentCategoryGroups: Array<{
    parent_category_id: string; field_group_id: string; weight: string;
    display_order: number; in_registration_wizard: boolean;
  }>;
  allRecs: Array<{
    field_definition_id: string; taxonomy_term_id: string; relationship: string;
    display_order: number; required_at_registration: boolean;
    required_before_publish: boolean; required_before_verification: boolean;
    is_admin_only: boolean; requires_verification: boolean;
  }>;
  groupOverrides: Array<{
    field_group_id: string; is_enabled: boolean | null;
    show_in_registration: boolean | null; show_in_profile_edit: boolean | null;
    show_in_public_profile: boolean | null; display_order: number | null;
    custom_label: string | null;
  }>;
  fieldOverrides: Array<{
    field_definition_id: string; enabled_override: boolean | null;
    required_override: boolean | null; custom_label: string | null;
    custom_helper: string | null;
    display_order_override: number | null;
    show_in_public_override: boolean | null;
    admin_only_override: boolean | null;
    default_visibility_override: string[] | null;
  }>;
};

async function loadTenantFieldCatalogUncached(
  tenantId: string,
): Promise<TenantFieldCatalog | null> {
  // Runs only on a CACHE MISS (unstable_cache skips the body on a hit).
  _metrics.catalog_misses++;
  const t0 = Date.now();
  console.info(`[field-catalog] MISS (querying db) tenant=${tenantId}`);
  const svc = createServiceRoleClient();
  if (!svc) {
    _metrics.catalog_errors++;
    console.warn(
      `[field-catalog] no service client — FALLBACK to inline queries tenant=${tenantId}`,
    );
    return null; // unconfigured → caller falls back to inline queries
  }
  void t0;
  const [defsR, groupsR, pcgR, recsR, gOvR, fOvR] = await Promise.all([
    svc.from("profile_field_definitions").select(
      "id, field_key, label, label_es, tier, section, subsection, kind, unit, placeholder, options, default_visibility, is_optional, display_order, field_group_id, validation_rules, show_when, deprecated_at, admin_only, is_sensitive, show_in_public, helper",
    ).is("deprecated_at", null),
    svc.from("profile_field_groups").select(
      "id, slug, name_en, name_es, sort_order, is_active",
    ).eq("is_active", true),
    svc.from("parent_category_field_groups").select(
      "parent_category_id, field_group_id, weight, display_order, in_registration_wizard",
    ),
    svc.from("profile_field_recommendations").select(
      "field_definition_id, taxonomy_term_id, relationship, display_order, required_at_registration, required_before_publish, required_before_verification, is_admin_only, requires_verification",
    ),
    svc.from("workspace_field_group_settings").select(
      "field_group_id, is_enabled, show_in_registration, show_in_profile_edit, show_in_public_profile, display_order, custom_label",
    ).eq("tenant_id", tenantId),
    svc.from("workspace_profile_field_settings").select(
      "field_definition_id, enabled_override, required_override, custom_label, custom_helper, display_order_override, show_in_public_override, admin_only_override, default_visibility_override",
    ).eq("tenant_id", tenantId),
  ]);
  if (defsR.error || groupsR.error || pcgR.error || recsR.error) {
    // Hard catalog tables failed → signal fallback (don't cache a bad set).
    return null;
  }
  console.info(
    `[field-catalog] MISS resolved tenant=${tenantId} duration=${
      Date.now() - t0
    }ms defs=${defsR.data?.length ?? 0} recs=${recsR.data?.length ?? 0}`,
  );
  return {
    defs: (defsR.data ?? []) as FieldDefRow[],
    groupRows: (groupsR.data ?? []) as TenantFieldCatalog["groupRows"],
    allParentCategoryGroups: (pcgR.data ?? []) as TenantFieldCatalog["allParentCategoryGroups"],
    allRecs: (recsR.data ?? []) as TenantFieldCatalog["allRecs"],
    groupOverrides: (gOvR.data ?? []) as TenantFieldCatalog["groupOverrides"],
    fieldOverrides: (fOvR.data ?? []) as TenantFieldCatalog["fieldOverrides"],
  };
}

/** Cached tenant-static field catalog. Shared across every talent + every
 *  concurrent editor mount in the tenant. ~120s revalidate; bust via the
 *  `field-catalog` tag when the catalog/settings change. */
async function getCachedTenantFieldCatalog(
  tenantId: string,
): Promise<TenantFieldCatalog | null> {
  console.info(`[field-catalog] request tenant=${tenantId}`);
  // Detect hit vs miss: if the miss counter advances during the await, the
  // inner function ran (miss); otherwise unstable_cache served from memory.
  const missesBefore = _metrics.catalog_misses;
  const result = await unstable_cache(
    () => loadTenantFieldCatalogUncached(tenantId),
    ["tenant-field-catalog", "v1", tenantId],
    { tags: [CACHE_TAG_FIELD_CATALOG, fieldCatalogTagForTenant(tenantId)], revalidate: 120 },
  )();
  if (_metrics.catalog_misses === missesBefore) {
    // Inner function did not run → served from cache
    _metrics.catalog_hits++;
  }
  return result;
}

function weightRank(w: string): number {
  switch (w) {
    case "heavy":
      return 4;
    case "default":
      return 3;
    case "light":
      return 2;
    case "optional":
      return 1;
    default:
      return 0;
  }
}

// ─── Resolver ────────────────────────────────────────────────────────────────

export type ResolveTalentFieldsInput = {
  /** Supabase client (server-action authed OR service role). Used for the
   *  per-talent queries (roster, value-presence, taxonomy assigns + parent
   *  walk) and as the fallback when the cached catalog is unavailable. */
  supabase: ResolverSupabase;
  talentProfileId: string;
  tenantId: string;
  /** Reserved for future viewer-scoped trimming (e.g. hiding admin_only
   *  fields from non-staff). Today the resolver returns the same field set
   *  regardless — visibility is decided per-render via `canViewerSee`. */
  viewerRole: ResolverViewerRole;
};

export async function resolveTalentFields(
  input: ResolveTalentFieldsInput,
): Promise<ResolveTalentFieldsResult> {
  const _t0 = Date.now();
  _metrics.resolver_calls++;
  const { supabase: sb, talentProfileId, tenantId, viewerRole } = input;
  // viewerRole reserved for future per-viewer trimming; today the resolver
  // returns the same field set and `canViewerSee` gates per render. Touch
  // the binding so lint sees the intentional pass-through.
  void viewerRole;

  // 1. Verify talent is on this tenant's roster.
  const { data: rosterRow, error: rosterErr } = await sb
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();

  if (rosterErr || !rosterRow) {
    try {
      console.info(
        `[engine.resolver] tenant=${tenantId} talent=${talentProfileId}` +
          ` cache_hit=false ms=${Date.now() - _t0} fields=0 err=not_on_roster`,
      );
    } catch { /* telemetry must never block */ }
    return { ok: false, error: "Talent is not on this tenant's roster." };
  }

  // 1b. Phase 4 (additive, read-only) — which field definitions have a
  // stored value for this talent. The value store is delete-on-empty, so a
  // row existing == a real value present. We select ONLY the id (never the
  // value) so this stays a pure presence signal; the panel decides per
  // view-as role whether to even hint presence. Failure is non-fatal:
  // `has_value` simply stays undefined and the panel degrades gracefully.
  const valuePresenceIds = new Set<string>();
  {
    const { data: valRows } = await sb
      .from("talent_profile_field_values")
      .select("field_definition_id")
      .eq("talent_profile_id", talentProfileId);
    for (const row of valRows ?? []) {
      if (row?.field_definition_id) valuePresenceIds.add(row.field_definition_id);
    }
  }

  // 2. Pull primary + secondaries.
  const { data: assigns, error: assignErr } = await sb
    .from("talent_profile_taxonomy")
    .select("relationship_type, taxonomy_term_id")
    .eq("talent_profile_id", talentProfileId);

  if (assignErr) {
    logServerError("resolveTalentFields.assigns", assignErr);
    try {
      console.info(
        `[engine.resolver] tenant=${tenantId} talent=${talentProfileId}` +
          ` cache_hit=false ms=${Date.now() - _t0} fields=0 err=assign_query`,
      );
    } catch { /* telemetry must never block */ }
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  const termIds = (assigns ?? []).map(
    (a: { taxonomy_term_id: string }) => a.taxonomy_term_id,
  );

  // Walk parent chain. talent_type level 3 → category_group level 2 →
  // parent_category level 1. We need the parent_categories for group
  // resolution, plus all intermediate ids for recommendation matching.
  const allTermIds = new Set<string>(termIds);
  const parentCategoryIds = new Set<string>();

  if (termIds.length > 0) {
    const { data: tParents } = await sb
      .from("taxonomy_terms")
      .select("id, parent_id, term_type, level")
      .in("id", termIds);

    const grandparentIdsToFetch: string[] = [];
    for (const p of (tParents ?? []) as Array<{
      id: string; parent_id: string | null; term_type: string; level: number;
    }>) {
      if (p.parent_id) {
        allTermIds.add(p.parent_id);
        // If parent is itself a category_group (L2), we need to fetch its parent (the parent_category L1)
        if (p.term_type === "talent_type") {
          grandparentIdsToFetch.push(p.parent_id);
        } else if (p.term_type === "parent_category") {
          parentCategoryIds.add(p.id);
        }
      }
    }

    if (grandparentIdsToFetch.length > 0) {
      const { data: gp } = await sb
        .from("taxonomy_terms")
        .select("id, parent_id, term_type")
        .in("id", grandparentIdsToFetch);
      for (const g of (gp ?? []) as Array<{
        id: string; parent_id: string | null; term_type: string;
      }>) {
        if (g.parent_id) {
          allTermIds.add(g.parent_id);
          parentCategoryIds.add(g.parent_id);
        } else if (g.term_type === "parent_category") {
          parentCategoryIds.add(g.id);
        }
      }
    }
  }

  // 3-8 (P3). Tenant-static catalog. Prefer the per-tenant cached
  // bundle (shared across every talent + every concurrent editor mount);
  // fall back to the original inline per-call queries if the service
  // client / cache is unavailable. Behaviour is identical either way —
  // only the *source* of the static rows changes.
  const _missesBefore = _metrics.catalog_misses;
  const cat = await getCachedTenantFieldCatalog(tenantId).catch(() => null);
  const _catalogHit = _metrics.catalog_misses === _missesBefore;

  let parentGroupRows: Array<{
    parent_category_id: string;
    field_group_id: string;
    weight: string;
    display_order: number;
    in_registration_wizard: boolean;
  }> = [];
  let groupRows: TenantFieldCatalog["groupRows"] = [];
  let groupOverrides: TenantFieldCatalog["groupOverrides"] = [];
  let defs: FieldDefRow[] = [];
  let recs: TenantFieldCatalog["allRecs"] = [];
  let overrides: TenantFieldCatalog["fieldOverrides"] = [];

  if (cat) {
    // ── Cached path: filter the global slices per-talent in memory
    // (exactly what the SQL `.in(...)` filters did).
    parentGroupRows =
      parentCategoryIds.size > 0
        ? cat.allParentCategoryGroups.filter((g) =>
            parentCategoryIds.has(g.parent_category_id),
          )
        : [];
    groupRows = cat.groupRows;
    groupOverrides = cat.groupOverrides;
    defs = cat.defs;
    recs =
      allTermIds.size > 0
        ? cat.allRecs.filter((r) => allTermIds.has(r.taxonomy_term_id))
        : [];
    overrides = cat.fieldOverrides;
  } else {
    // ── Fallback path: original inline queries, verbatim behaviour.
    if (parentCategoryIds.size > 0) {
      const { data, error: pgErr } = await sb
        .from("parent_category_field_groups")
        .select(
          "parent_category_id, field_group_id, weight, display_order, in_registration_wizard",
        )
        .in("parent_category_id", Array.from(parentCategoryIds));
      if (pgErr) {
        logServerError("resolveTalentFields.parent_groups", pgErr);
        return { ok: false, error: CLIENT_ERROR.generic };
      }
      parentGroupRows = data ?? [];
    }

    const { data: gRows, error: groupErr } = await sb
      .from("profile_field_groups")
      .select("id, slug, name_en, name_es, sort_order, is_active")
      .eq("is_active", true);
    if (groupErr) {
      logServerError("resolveTalentFields.groups", groupErr);
      return { ok: false, error: CLIENT_ERROR.generic };
    }
    groupRows = (gRows ?? []) as TenantFieldCatalog["groupRows"];

    const { data: gOv } = await sb
      .from("workspace_field_group_settings")
      .select(
        "field_group_id, is_enabled, show_in_registration, show_in_profile_edit, show_in_public_profile, display_order, custom_label",
      )
      .eq("tenant_id", tenantId);
    groupOverrides = (gOv ?? []) as TenantFieldCatalog["groupOverrides"];

    const { data: dRows, error: defsErr } = await sb
      .from("profile_field_definitions")
      .select(
        "id, field_key, label, label_es, tier, section, subsection, kind, unit, placeholder, options, default_visibility, is_optional, display_order, field_group_id, validation_rules, show_when, deprecated_at, admin_only, is_sensitive, show_in_public, helper",
      )
      .is("deprecated_at", null);
    if (defsErr) {
      logServerError("resolveTalentFields.defs", defsErr);
      return { ok: false, error: CLIENT_ERROR.generic };
    }
    defs = (dRows ?? []) as FieldDefRow[];

    if (allTermIds.size > 0) {
      const { data: recRows, error: recErr } = await sb
        .from("profile_field_recommendations")
        .select(
          "field_definition_id, taxonomy_term_id, relationship, display_order, required_at_registration, required_before_publish, required_before_verification, is_admin_only, requires_verification",
        )
        .in("taxonomy_term_id", Array.from(allTermIds));
      if (recErr) {
        logServerError("resolveTalentFields.recs", recErr);
        return { ok: false, error: CLIENT_ERROR.generic };
      }
      recs = (recRows ?? []) as TenantFieldCatalog["allRecs"];
    }

    const { data: fOv } = await sb
      .from("workspace_profile_field_settings")
      .select(
        "field_definition_id, enabled_override, required_override, custom_label, custom_helper, display_order_override, show_in_public_override, admin_only_override, default_visibility_override",
      )
      .eq("tenant_id", tenantId);
    overrides = (fOv ?? []) as TenantFieldCatalog["fieldOverrides"];
  }

  const _activeGroupIds = new Set(parentGroupRows.map((g) => g.field_group_id)); // unused — kept for future filtering; _ suppresses lint
  void _activeGroupIds;
  const groupById = new Map((groupRows ?? []).map((g) => [g.id, g] as const));
  const groupOverrideById = new Map(
    (groupOverrides ?? []).map((o) => [o.field_group_id, o] as const),
  );

  // Resolve which groups are actually active for this talent (after tenant
  // overrides). Build group meta for the response.
  const resolvedGroups: ResolvedFieldGroup[] = [];
  // Map field_group_id → metadata for field-attribution decisions.
  const groupMetaById = new Map<
    string,
    {
      slug: string;
      label: string;
      label_es: string | null;
      weight: string;
      display_order: number;
      in_wizard: boolean;
    }
  >();
  for (const pg of parentGroupRows) {
    const groupRow = groupById.get(pg.field_group_id);
    if (!groupRow) continue;
    const ov = groupOverrideById.get(pg.field_group_id);
    if (ov?.is_enabled === false) continue; // tenant disabled this group
    // Highest-weight wins if multiple parents recommend the same group.
    const existing = groupMetaById.get(pg.field_group_id);
    if (existing && weightRank(existing.weight) >= weightRank(pg.weight)) continue;
    groupMetaById.set(pg.field_group_id, {
      slug: groupRow.slug,
      label: ov?.custom_label ?? groupRow.name_en,
      label_es: groupRow.name_es,
      weight: pg.weight,
      display_order: ov?.display_order ?? pg.display_order,
      in_wizard: pg.in_registration_wizard,
    });
  }

  const overrideByField = new Map(
    (overrides ?? []).map((o) => [o.field_definition_id, o] as const),
  );

  // Aggregate the strongest recommendation per field (across all matching terms).
  const recsByField = new Map<
    string,
    {
      relationship: string;
      display_order: number;
      term_id: string;
      required_at_registration: boolean;
      required_before_publish: boolean;
      required_before_verification: boolean;
      is_admin_only: boolean;
      requires_verification: boolean;
    }
  >();

  for (const r of recs) {
    const existing = recsByField.get(r.field_definition_id);
    const promote =
      !existing ||
      r.relationship === "required" ||
      (r.relationship === "recommended" && existing.relationship === "applies");

    if (!existing) {
      recsByField.set(r.field_definition_id, { ...r, term_id: r.taxonomy_term_id });
    } else if (promote) {
      recsByField.set(r.field_definition_id, { ...r, term_id: r.taxonomy_term_id });
    } else {
      // OR the boolean flags across all matching recs (if ANY says required, it's required).
      existing.required_at_registration ||= r.required_at_registration;
      existing.required_before_publish ||= r.required_before_publish;
      existing.required_before_verification ||= r.required_before_verification;
      existing.is_admin_only ||= r.is_admin_only;
      existing.requires_verification ||= r.requires_verification;
    }
  }

  // 9. Resolve fields.
  const resolved: ResolvedField[] = [];
  const groupFieldCount = new Map<string, number>();

  for (const d of defs ?? []) {
    const o = overrideByField.get(d.id);
    if (o?.enabled_override === false) continue;

    let include = false;
    let relationship: string = "applies";
    let display_order = d.display_order ?? 100;
    let source_term_id: string | null = null;
    let brought_in_by: ResolvedField["brought_in_by"] = { kind: "tier" };

    // C1 fix (2026-05-07): type-specific fields require a recommendation
    // matching one of the talent's terms. Group membership alone is NOT
    // sufficient to include a type-specific field — otherwise chef.cuisines
    // (in media-portfolio group) would leak onto every Influencer profile,
    // since media-portfolio is auto-loaded for nearly all parents.
    //
    // Universal/global fields always render. Type-specific MUST have a
    // direct recommendation. The field_group_id is for UI bucketing only.
    if (d.tier === "universal" || d.tier === "global") {
      include = true;
      brought_in_by = { kind: "tier" };
    } else {
      const r = recsByField.get(d.id);
      if (r) {
        include = true;
        relationship = r.relationship;
        display_order = r.display_order || d.display_order || 100;
        source_term_id = r.term_id;
        // Surface group attribution if available so the UI buckets correctly,
        // but the gate is always the recommendation match.
        if (d.field_group_id && groupMetaById.has(d.field_group_id)) {
          const meta = groupMetaById.get(d.field_group_id)!;
          brought_in_by = { kind: "group", group_slug: meta.slug, weight: meta.weight };
        } else {
          brought_in_by = { kind: "recommendation", term_id: r.term_id };
        }
      }
    }
    if (!include) continue;

    // Get full requirement-level flags from rec (if any).
    const r = recsByField.get(d.id);
    const required_at_registration = r?.required_at_registration ?? false;
    const required_before_publish = r?.required_before_publish ?? false;
    const required_before_verification = r?.required_before_verification ?? false;
    const is_admin_only = r?.is_admin_only ?? false;
    const requires_verification = r?.requires_verification ?? false;

    const catalogRequired =
      relationship === "required" ||
      required_before_publish ||
      (d.tier === "universal" && d.is_optional === false);

    // Group metadata (if any)
    const groupMeta = d.field_group_id ? groupMetaById.get(d.field_group_id) : null;

    // Phase 1b — tenant field-visibility override. When (and ONLY when) a
    // tenant has explicitly set a visibility override for this field,
    // route it through the single shared primitive so editor / Agency
    // Fields / public all agree. No override row (the default / empty
    // table) → keep the exact prior values (byte-identical behaviour).
    const rawVis = Array.isArray(d.default_visibility)
      ? (d.default_visibility as string[])
      : [];
    let out_visibility = rawVis;
    let out_admin_only = is_admin_only;
    const hasVisOverride =
      !!o &&
      (o.show_in_public_override != null ||
        o.admin_only_override != null ||
        Array.isArray(o.default_visibility_override));
    if (hasVisOverride) {
      const eff = effectiveFieldVisibility(
        {
          default_visibility: rawVis,
          admin_only: d.admin_only,
          is_sensitive: d.is_sensitive,
          show_in_public: d.show_in_public,
        },
        {
          show_in_public_override: o!.show_in_public_override,
          admin_only_override: o!.admin_only_override,
          default_visibility_override: o!.default_visibility_override,
        },
      );
      out_visibility =
        eff === "public" ? ["public", "agency"] : eff === "admin" ? ["agency"] : [];
      out_admin_only = is_admin_only || eff !== "public";
    }

    // Phase 4 (additive, read-only) — provenance: this field carries a
    // tenant override when the workspace_profile_field_settings row has ANY
    // non-null override column (visibility / enable / required / relabel /
    // helper / order). Disabled fields (`enabled_override === false`) were
    // already `continue`d above, so an enabled-override here is meaningful.
    const tenant_override =
      !!o &&
      (o.show_in_public_override != null ||
        o.admin_only_override != null ||
        Array.isArray(o.default_visibility_override) ||
        o.enabled_override != null ||
        o.required_override != null ||
        (o.custom_label != null && o.custom_label !== "") ||
        (o.custom_helper != null && o.custom_helper !== "") ||
        o.display_order_override != null);

    resolved.push({
      field_definition_id: d.id,
      field_key: d.field_key,
      label: o?.custom_label ?? d.label,
      label_es: (d as { label_es?: string | null }).label_es ?? null,
      helper: o?.custom_helper ?? d.helper ?? null,
      tier: d.tier as "universal" | "global" | "type-specific",
      section: d.section as string,
      subsection: d.subsection,
      kind: d.kind,
      unit: (d as { unit?: string | null }).unit ?? null,
      placeholder: d.placeholder,
      options: Array.isArray(d.options) ? (d.options as string[]) : null,
      default_visibility: out_visibility,
      is_required: o?.required_override ?? catalogRequired,
      is_recommended: relationship === "recommended",
      display_order: o?.display_order_override ?? display_order,
      source_term_id,
      field_group_slug: groupMeta?.slug ?? null,
      field_group_label: groupMeta?.label ?? null,
      required_at_registration,
      required_before_publish,
      required_before_verification,
      is_admin_only: out_admin_only,
      requires_verification,
      validation_rules: (d.validation_rules as Record<string, unknown> | null) ?? null,
      show_when:
        (d.show_when as { field_key: string; operator: string; value: unknown } | null) ??
        null,
      brought_in_by,
      tenant_override,
      has_value: valuePresenceIds.has(d.id),
    });

    if (groupMeta) {
      groupFieldCount.set(groupMeta.slug, (groupFieldCount.get(groupMeta.slug) ?? 0) + 1);
    }
  }

  // Sort by group display_order → display_order within group → label.
  // Pre-build a slug → display_order lookup so the comparator is O(1) per
  // call rather than re-scanning groupMetaById.entries() each comparison
  // (was O(n²) over the resolved field list — §11 known debt).
  // Behaviour is byte-identical: same lookup-by-slug, same fallback to 0
  // when a slug is missing, same tie-breaks.
  const groupOrderBySlug = new Map<string, number>();
  for (const meta of groupMetaById.values()) {
    groupOrderBySlug.set(meta.slug, meta.display_order);
  }
  resolved.sort((a, b) => {
    const aOrder = a.field_group_slug
      ? (groupOrderBySlug.get(a.field_group_slug) ?? 0)
      : 0;
    const bOrder = b.field_group_slug
      ? (groupOrderBySlug.get(b.field_group_slug) ?? 0)
      : 0;
    if (aOrder !== bOrder) return aOrder - bOrder;
    if (a.display_order !== b.display_order)
      return a.display_order - b.display_order;
    return a.label.localeCompare(b.label);
  });

  // Build the resolved groups list (sorted by display_order).
  for (const [groupId, meta] of groupMetaById) {
    void groupId;
    resolvedGroups.push({
      group_slug: meta.slug,
      group_label_en: meta.label,
      group_label_es: meta.label_es,
      weight: meta.weight as ResolvedFieldGroup["weight"],
      display_order: meta.display_order,
      in_registration_wizard: meta.in_wizard,
      field_count: groupFieldCount.get(meta.slug) ?? 0,
    });
  }
  resolvedGroups.sort((a, b) => a.display_order - b.display_order);

  try {
    console.info(
      `[engine.resolver] tenant=${tenantId} talent=${talentProfileId}` +
        ` cache_hit=${_catalogHit} ms=${Date.now() - _t0} fields=${resolved.length}`,
    );
  } catch {
    // telemetry must never block the resolver
  }

  return { ok: true, fields: resolved, groups: resolvedGroups };
}
