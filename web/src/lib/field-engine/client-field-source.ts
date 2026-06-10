// src/lib/field-engine/client-field-source.ts
//
// SERVER loader for the "repoint the client field catalog to the DB" work
// (profile-field-engine unification, P1). Runs only on the server (pulls in
// the service-role Supabase client), reads `profile_field_definitions` via
// `profile-fields-service.ts`, and projects the type-specific catalog into the
// exact `RegField`-group shape the registration wizard + editor drawer already
// consume — grouped by talent-type parent slug.
//
// The output (`ClientFieldSourcePayload`) is serializable and carried on the
// AdminShell bridge into the `"use client"` surfaces. The CLIENT never imports
// this module — only the pure types in `client-field-source-types.ts`. This
// preserves the "no server-only imports in a client component" rule (same
// precedent as the `loadProfileEditorLayout` → bridge → drawer flow).
//
// Flag-gated: when EVERY client field surface is `static` (the default), the
// loader short-circuits to `null` (no DB work, no payload) and the client uses
// its existing static path untouched. Cache-tagged with
// `CACHE_TAG_FIELD_CATALOG` so a Profile Fields hub edit busts it.

import "server-only";

import { unstable_cache } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  loadFieldCatalog,
  type ResolvedFieldDefinition,
} from "@/lib/profile-fields-service";
import {
  CACHE_TAG_FIELD_CATALOG,
  fieldCatalogTagForTenant,
} from "@/lib/field-engine/cache-tags";
import { logServerError } from "@/lib/server/safe-error";
import {
  parseFieldEngineClientSourceFlags,
  FIELD_ENGINE_CLIENT_SURFACES,
  type ClientDynamicFieldDTO,
  type ClientFieldSourcePayload,
  type FieldEngineClientSourceFlags,
} from "@/lib/field-engine/client-field-source-types";
import type { RegFieldKind, RegFieldChannel } from
  "@/components/admin/shell/internal/state/types";

/** Read the per-surface flags from the environment (server-only). */
export function getFieldEngineClientSourceFlags(): FieldEngineClientSourceFlags {
  return parseFieldEngineClientSourceFlags(
    process.env.FIELD_ENGINE_CLIENT_SOURCE,
  );
}

/** True when at least one surface is flipped to `db` (so a payload is worth
 *  resolving). When all-static, callers skip the DB work entirely. */
export function anyClientFieldSurfaceIsDb(
  flags: FieldEngineClientSourceFlags = getFieldEngineClientSourceFlags(),
): boolean {
  return FIELD_ENGINE_CLIENT_SURFACES.some((s) => flags[s] === "db");
}

// ── DB kind → RegField kind mapping ─────────────────────────────────────────
// The wizard/drawer `RegField.kind` union is narrower than the DB `kind`
// (no date/toggle/textarea). Map the DB extras onto the closest renderable
// RegField kind so a flipped surface degrades gracefully instead of crashing.
const REG_FIELD_KINDS: ReadonlySet<string> = new Set([
  "text",
  "number",
  "select",
  "multiselect",
  "chips",
]);

function toRegFieldKind(dbKind: string): RegFieldKind {
  if (REG_FIELD_KINDS.has(dbKind)) return dbKind as RegFieldKind;
  switch (dbKind) {
    case "toggle":
      return "select";
    case "date":
      return "text";
    case "textarea":
      return "text";
    default:
      return "text";
  }
}

function toRegFieldChannels(
  vis: ReadonlyArray<string>,
): ReadonlyArray<RegFieldChannel> | undefined {
  const allowed: RegFieldChannel[] = [];
  for (const v of vis) {
    if (v === "public" || v === "agency" || v === "private") allowed.push(v);
  }
  return allowed.length > 0 ? allowed : undefined;
}

function shortId(fieldKey: string): string {
  const parts = fieldKey.split(".");
  return parts[parts.length - 1] || fieldKey;
}

/** Project a resolved catalog def into the wizard/drawer DTO shape. */
function toDynamicFieldDTO(f: ResolvedFieldDefinition): ClientDynamicFieldDTO {
  return {
    id: shortId(f.fieldKey),
    fieldKey: f.fieldKey,
    label: f.label,
    kind: toRegFieldKind(f.kind),
    optional: f.isOptional,
    placeholder: f.placeholder ?? undefined,
    helper: f.helper ?? undefined,
    options: f.options ? [...f.options] : undefined,
    subsection: f.subsection ?? undefined,
    sensitive: f.isSensitive,
    defaultVisibility: toRegFieldChannels(f.defaultVisibility),
    displayOrder: f.displayOrder,
  };
}

/**
 * Build the per-parent-slug map of type-specific (`render_mode='catalog'`)
 * fields from the resolved catalog + an explicit field→parent-slug map.
 *
 * NOTE: we resolve `appliesTo` ourselves via `appliesByFieldKey` rather than
 * trusting `ResolvedFieldDefinition.appliesTo` — the `profile-fields-service`
 * recommendation embedding (`taxonomy_terms(slug)`) resolves to empty at
 * runtime for these rows, so its `appliesTo` is unreliable here. We keep using
 * the service for the field metadata (label/order/kind/overrides) which IS
 * correct, and bring our own applicability map.
 */
function buildDynamicFieldsByParent(
  catalog: ReadonlyArray<ResolvedFieldDefinition>,
  appliesByFieldKey: ReadonlyMap<string, ReadonlySet<string>>,
): Record<string, ClientDynamicFieldDTO[]> {
  const byParent: Record<string, ClientDynamicFieldDTO[]> = {};
  const seen = new Set<string>();
  for (const f of catalog) {
    if (f.tier !== "type-specific") continue;
    if (f.renderMode !== "catalog") continue;
    if (!f.enabled) continue;
    const parents = appliesByFieldKey.get(f.fieldKey);
    if (!parents || parents.size === 0) continue;
    for (const parentSlug of parents) {
      const dedupeKey = `${parentSlug}::${shortId(f.fieldKey)}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      (byParent[parentSlug] ??= []).push(toDynamicFieldDTO(f));
    }
  }
  for (const slug of Object.keys(byParent)) {
    byParent[slug]!.sort(
      (a, b) =>
        a.displayOrder - b.displayOrder || a.label.localeCompare(b.label),
    );
  }
  return byParent;
}

type FieldKeyRow = { id: string; field_key: string };
type RecRow = { field_definition_id: string; taxonomy_term_id: string };
type TermSlugRow = { id: string; slug: string; term_type: string };

/**
 * Resolve, for every type-specific field, the set of PARENT-CATEGORY slugs it
 * applies to. Explicit queries (no PostgREST relation embedding). A field's
 * `applies` / `recommended` recommendations point at taxonomy terms at any
 * level; we walk each term up to its parent_category and use that slug — the
 * same parent-slug vocabulary the wizard + drawer key on.
 */
async function loadAppliesByFieldKey(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc: any,
): Promise<Map<string, Set<string>>> {
  const [{ data: defs }, { data: recs }, { data: terms }] = await Promise.all([
    svc
      .from("profile_field_definitions")
      .select("id, field_key")
      .eq("tier", "type-specific")
      .is("deprecated_at", null),
    svc
      .from("profile_field_recommendations")
      .select("field_definition_id, taxonomy_term_id")
      .in("relationship", ["applies", "recommended", "required"]),
    svc.from("taxonomy_terms").select("id, slug, term_type, parent_id"),
  ]);

  const fieldKeyById = new Map<string, string>(
    ((defs ?? []) as FieldKeyRow[]).map((d) => [d.id, d.field_key]),
  );
  type TermNode = TermSlugRow & { parent_id: string | null };
  const termById = new Map<string, TermNode>(
    ((terms ?? []) as TermNode[]).map((t) => [t.id, t]),
  );

  /** Walk a term up to its parent_category slug. */
  const parentCategorySlug = (termId: string): string | null => {
    let cur = termById.get(termId);
    let guard = 0;
    while (cur && guard++ < 8) {
      if (cur.term_type === "parent_category") return cur.slug;
      if (!cur.parent_id) return null;
      cur = termById.get(cur.parent_id);
    }
    return null;
  };

  const out = new Map<string, Set<string>>();
  for (const r of (recs ?? []) as RecRow[]) {
    const fieldKey = fieldKeyById.get(r.field_definition_id);
    if (!fieldKey) continue;
    const slug = parentCategorySlug(r.taxonomy_term_id);
    if (!slug) continue;
    (out.get(fieldKey) ?? out.set(fieldKey, new Set()).get(fieldKey)!).add(slug);
  }
  return out;
}

async function resolveClientFieldSourceUncached(
  tenantId: string,
): Promise<Record<string, ClientDynamicFieldDTO[]>> {
  const svc = createServiceRoleClient();
  if (!svc) return {};
  // Tenant-scoped catalog (applies workspace label/order/enabled overrides).
  // We pair it with our own applicability map (see loadAppliesByFieldKey).
  const [catalog, appliesByFieldKey] = await Promise.all([
    loadFieldCatalog(svc, { tenantId }),
    loadAppliesByFieldKey(svc),
  ]);
  return buildDynamicFieldsByParent(catalog, appliesByFieldKey);
}

/**
 * Load the `ClientFieldSourcePayload` for a tenant. Returns `null` when every
 * client field surface is `static` (the default) — the caller then injects
 * `null` on the bridge and the client uses its static path untouched.
 *
 * Never throws: any failure resolving the DB catalog degrades to `null`
 * (static fallback), so a flipped flag can never break a layout render.
 */
export async function loadClientFieldSource(
  tenantId: string | null | undefined,
): Promise<ClientFieldSourcePayload | null> {
  const flags = getFieldEngineClientSourceFlags();
  if (!anyClientFieldSurfaceIsDb(flags)) return null;
  if (!tenantId) {
    // No tenant scope → no catalog to resolve. Surface the flags so the
    // client knows a surface WANTS db, but with no fields it falls back to
    // static for every parent (safe).
    return { flags, dynamicFieldsByParent: {}, generatedAt: new Date().toISOString() };
  }
  try {
    const dynamicFieldsByParent = await unstable_cache(
      () => resolveClientFieldSourceUncached(tenantId),
      ["client-field-source", "v1", tenantId],
      {
        tags: [CACHE_TAG_FIELD_CATALOG, fieldCatalogTagForTenant(tenantId)],
        revalidate: 120,
      },
    )();
    return {
      flags,
      dynamicFieldsByParent,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    logServerError("field-engine.loadClientFieldSource", err);
    return null; // degrade to static
  }
}
