import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { CreateTaxonomyTermForm } from "./create-taxonomy-term-form";
import { TaxonomyFieldMappingPanel } from "./taxonomy-field-mapping-panel";
import { TaxonomyReorderPanel } from "./taxonomy-reorder-panel";
import { TaxonomyTermForm } from "./taxonomy-term-form";

export const dynamic = "force-dynamic";

const HQ = {
  card: "#16161A",
  cardSoft: "rgba(255,255,255,0.04)",
  borderSoft: "rgba(255,255,255,0.06)",
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
  inkDim: "rgba(245,242,235,0.38)",
  green: "#5DD3A0",
  amber: "#9BA8B7",
  red: "#F36772",
} as const;

const F = '"Inter", system-ui, sans-serif';
const FD = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

type TaxonomyRow = {
  id: string;
  slug: string;
  name_en: string;
  name_es: string | null;
  plural_name: string | null;
  description: string | null;
  icon: string | null;
  term_type: string;
  level: number;
  parent_id: string | null;
  sort_order: number;
  aliases: string[];
  search_synonyms: string[];
  ai_keywords: string[];
  is_active: boolean;
  archived_at: string | null;
  is_public_filter: boolean;
  is_visible_by_default: boolean;
  is_profile_badge: boolean;
  is_restricted: boolean;
  is_generic_fallback: boolean;
  restriction_level: string | null;
  tenant_count: number;
  children: TaxonomyRow[];
};

type TaxonomyImpact = {
  descendant_count: number;
  tenant_override_count: number;
  field_mapping_count: number;
  required_mapping_count: number;
  talent_assignment_count: number;
};

type TaxonomyAuditRow = {
  id: string;
  created_at: string;
  action: string;
  severity: string;
  target_type: string;
  target_id: string | null;
};

type TaxonomyIssue = {
  kind: "name-collision" | "group-leaf-same-label" | "spanish-missing";
  title: string;
  detail: string;
  slugs: string[];
};

const ISSUE_LABEL: Record<TaxonomyIssue["kind"], string> = {
  "name-collision": "Name collision",
  "group-leaf-same-label": "Group / leaf shared label",
  "spanish-missing": "Spanish labels missing",
};

type TaxonomyFieldOption = {
  id: string;
  field_key: string;
  label: string;
  tier: string;
  section: string | null;
  deprecated_at: string | null;
};

type TaxonomyFieldMapping = {
  id: string;
  field_definition_id: string;
  field_key: string;
  field_label: string;
  field_tier: string;
  field_section: string | null;
  field_deprecated: boolean;
  relationship: string;
  display_order: number;
  required_at_registration: boolean;
  required_before_publish: boolean;
  required_before_verification: boolean;
  requires_verification: boolean;
  is_admin_only: boolean;
};

function HqCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: HQ.card,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 12,
        padding: 16,
        fontFamily: F,
        marginBottom: 16,
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: FD, fontSize: 15, fontWeight: 600, color: HQ.ink }}>
          {title}
        </div>
        {subtitle && <div style={{ fontSize: 12, color: HQ.inkMuted, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {children}
    </section>
  );
}

function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function Stat({
  label,
  value,
  tone = HQ.ink,
}: {
  label: string;
  value: React.ReactNode;
  tone?: string;
}) {
  return (
    <div style={{ background: HQ.cardSoft, border: `1px solid ${HQ.borderSoft}`, borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ color: HQ.inkMuted, fontSize: 11 }}>{label}</div>
      <div style={{ color: tone, fontFamily: FD, fontSize: 20, fontWeight: 650 }}>{value}</div>
    </div>
  );
}

async function loadTaxonomy(): Promise<{
  terms: TaxonomyRow[];
  roots: TaxonomyRow[];
  impacts: Map<string, TaxonomyImpact>;
  issues: TaxonomyIssue[];
  audits: TaxonomyAuditRow[];
  fieldOptions: TaxonomyFieldOption[];
  mappingsByTerm: Map<string, TaxonomyFieldMapping[]>;
} | null> {
  const sb = createServiceRoleClient();
  if (!sb) return null;

  const [termsR, settingsR, recsR, assignmentsR, auditsR, fieldsR] = await Promise.all([
    sb
      .from("taxonomy_terms")
      .select(
        "id, slug, name_en, name_es, plural_name, description, icon, term_type, level, parent_id, sort_order, aliases, search_synonyms, ai_keywords, is_active, archived_at, is_public_filter, is_visible_by_default, is_profile_badge, is_restricted, is_generic_fallback, restriction_level",
      )
      .order("level", { ascending: true })
      .order("sort_order", { ascending: true }),
    sb.from("agency_taxonomy_settings").select("taxonomy_term_id, tenant_id"),
    sb
      .from("profile_field_recommendations")
      .select(
        "id, field_definition_id, taxonomy_term_id, relationship, display_order, required_at_registration, required_before_publish, required_before_verification, requires_verification, is_admin_only",
      ),
    sb.from("talent_profile_taxonomy").select("taxonomy_term_id"),
    sb
      .from("platform_audit_log")
      .select("id, created_at, action, severity, target_type, target_id")
      .in("target_type", ["taxonomy_term", "taxonomy_field_mapping"])
      .order("created_at", { ascending: false })
      .limit(8),
    sb
      .from("profile_field_definitions")
      .select("id, field_key, label, tier, section, deprecated_at")
      .order("label", { ascending: true }),
  ]);

  if (termsR.error || recsR.error || fieldsR.error) return null;

  const tenantCounts = new Map<string, number>();
  for (const row of (settingsR.data ?? []) as Array<{ taxonomy_term_id: string | null }>) {
    if (!row.taxonomy_term_id) continue;
    tenantCounts.set(row.taxonomy_term_id, (tenantCounts.get(row.taxonomy_term_id) ?? 0) + 1);
  }

  const terms: TaxonomyRow[] = ((termsR.data ?? []) as Array<Omit<TaxonomyRow, "tenant_count" | "children">>).map((term) => ({
    ...term,
    tenant_count: tenantCounts.get(term.id) ?? 0,
    children: [] as TaxonomyRow[],
  }));
  const byId = new Map(terms.map((term) => [term.id, term] as const));
  const roots: TaxonomyRow[] = [];
  for (const term of terms) {
    if (term.parent_id && byId.has(term.parent_id)) {
      byId.get(term.parent_id)!.children.push(term);
    } else {
      roots.push(term);
    }
  }
  const sortTree = (list: TaxonomyRow[]) => {
    list.sort((a, b) => a.sort_order - b.sort_order || a.name_en.localeCompare(b.name_en));
    for (const item of list) sortTree(item.children);
  };
  sortTree(roots);

  const descendantsById = new Map<string, Set<string>>();
  const collectDescendants = (term: TaxonomyRow): Set<string> => {
    const cached = descendantsById.get(term.id);
    if (cached) return cached;
    const ids = new Set<string>([term.id]);
    for (const child of term.children) {
      for (const childId of collectDescendants(child)) ids.add(childId);
    }
    descendantsById.set(term.id, ids);
    return ids;
  };
  for (const term of terms) collectDescendants(term);

  const fieldOptions = ((fieldsR.data ?? []) as TaxonomyFieldOption[]).sort((a, b) =>
    a.label.localeCompare(b.label) || a.field_key.localeCompare(b.field_key),
  );
  const fieldById = new Map(fieldOptions.map((field) => [field.id, field] as const));
  const recs = (recsR.data ?? []) as Array<{
    id: string;
    field_definition_id: string | null;
    taxonomy_term_id: string | null;
    relationship: string | null;
    display_order: number | null;
    required_at_registration: boolean | null;
    required_before_publish: boolean | null;
    required_before_verification: boolean | null;
    requires_verification: boolean | null;
    is_admin_only: boolean | null;
  }>;
  const mappingsByTerm = new Map<string, TaxonomyFieldMapping[]>();
  for (const rec of recs) {
    if (!rec.taxonomy_term_id || !rec.field_definition_id) continue;
    const field = fieldById.get(rec.field_definition_id);
    if (!field) continue;
    const list = mappingsByTerm.get(rec.taxonomy_term_id) ?? [];
    list.push({
      id: rec.id,
      field_definition_id: rec.field_definition_id,
      field_key: field.field_key,
      field_label: field.label,
      field_tier: field.tier,
      field_section: field.section,
      field_deprecated: !!field.deprecated_at,
      relationship: rec.relationship ?? "applies",
      display_order: rec.display_order ?? 100,
      required_at_registration: !!rec.required_at_registration,
      required_before_publish: !!rec.required_before_publish,
      required_before_verification: !!rec.required_before_verification,
      requires_verification: !!rec.requires_verification,
      is_admin_only: !!rec.is_admin_only,
    });
    mappingsByTerm.set(rec.taxonomy_term_id, list);
  }
  for (const list of mappingsByTerm.values()) {
    list.sort((a, b) => a.display_order - b.display_order || a.field_label.localeCompare(b.field_label));
  }
  const assignments = (assignmentsR.data ?? []) as Array<{ taxonomy_term_id: string | null }>;
  const settings = (settingsR.data ?? []) as Array<{ taxonomy_term_id: string | null; tenant_id: string | null }>;
  const impacts = new Map<string, TaxonomyImpact>();
  for (const term of terms) {
    const ids = descendantsById.get(term.id) ?? new Set([term.id]);
    const fieldMappings = recs.filter((row) => row.taxonomy_term_id && ids.has(row.taxonomy_term_id));
    impacts.set(term.id, {
      descendant_count: Math.max(0, ids.size - 1),
      tenant_override_count: settings.filter((row) => row.taxonomy_term_id && ids.has(row.taxonomy_term_id)).length,
      field_mapping_count: fieldMappings.length,
      required_mapping_count: fieldMappings.filter((row) => row.relationship === "required" || row.required_before_publish).length,
      talent_assignment_count: assignments.filter((row) => row.taxonomy_term_id && ids.has(row.taxonomy_term_id)).length,
    });
  }

  const active = terms.filter((term) => term.is_active && !term.archived_at);
  const byLabel = new Map<string, TaxonomyRow[]>();
  for (const term of active) {
    const key = normalizeLabel(term.name_en);
    if (!key) continue;
    byLabel.set(key, [...(byLabel.get(key) ?? []), term]);
  }
  const issues: TaxonomyIssue[] = [];
  for (const group of byLabel.values()) {
    if (group.length < 2) continue;
    const slugs = group.map((term) => term.slug);
    const types = new Set(group.map((term) => term.term_type));
    issues.push({
      kind: types.has("category_group") && types.has("talent_type") ? "group-leaf-same-label" : "name-collision",
      title: `Shared label: ${group[0].name_en}`,
      detail: `${group.length} active terms share this label across ${[...types].join(", ")}.`,
      slugs,
    });
  }
  const missingSpanish = active.filter((term) => !term.name_es && ["parent_category", "category_group", "talent_type"].includes(term.term_type));
  if (missingSpanish.length > 0) {
    issues.push({
      kind: "spanish-missing",
      title: `${missingSpanish.length} active talent terms need Spanish labels`,
      detail: "Bilingual catalog labels should be complete before talent self-edit and registration rely on this engine.",
      slugs: missingSpanish.slice(0, 12).map((term) => term.slug),
    });
  }

  return {
    terms,
    roots,
    impacts,
    issues,
    audits: ((auditsR.data ?? []) as TaxonomyAuditRow[]),
    fieldOptions,
    mappingsByTerm,
  };
}

function flattenTree(roots: TaxonomyRow[]): TaxonomyRow[] {
  const rows: TaxonomyRow[] = [];
  const walk = (items: TaxonomyRow[]) => {
    for (const item of items) {
      rows.push(item);
      walk(item.children);
    }
  };
  walk(roots);
  return rows;
}

export default async function PlatformTaxonomyBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; type?: string; term?: string }>;
}) {
  const params = await searchParams;
  const data = await loadTaxonomy();
  const type = params.type ?? "all";

  const flat = data ? flattenTree(data.roots) : [];
  const visibleTerms =
    type === "all" ? flat : flat.filter((term) => term.term_type === type);
  const selectedTerm =
    visibleTerms.find((term) => term.id === params.term || term.slug === params.term) ??
    visibleTerms[0] ??
    null;
  const types = [...new Set(flat.map((term) => term.term_type))].sort();
  const activeCount = flat.filter((term) => term.is_active && !term.archived_at).length;
  const publicFilters = flat.filter((term) => term.is_public_filter && !term.archived_at).length;
  const restricted = flat.filter((term) => term.is_restricted && !term.archived_at).length;
  const selectedImpact = selectedTerm && data ? data.impacts.get(selectedTerm.id) : null;
  const selectedSiblings = selectedTerm
    ? flat
        .filter((term) => term.term_type === selectedTerm.term_type && term.parent_id === selectedTerm.parent_id)
        .sort((a, b) => a.sort_order - b.sort_order || a.name_en.localeCompare(b.name_en))
    : [];

  return (
    <div style={{ fontFamily: F, color: HQ.ink, padding: 4 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 4 }}>
        <h1 style={{ fontFamily: FD, fontSize: 22, fontWeight: 600, margin: 0 }}>Taxonomy Builder</h1>
        <Link href="/platform/admin/catalog" style={{ fontSize: 11, fontWeight: 700, color: HQ.green, textDecoration: "none" }}>
          Catalog Map
        </Link>
      </div>
      <div style={{ fontSize: 12.5, color: HQ.inkMuted, marginBottom: 18 }}>
        The global talent-type tree. Select a term to edit bilingual names, aliases, search synonyms, visibility flags, lifecycle, and field mappings.
      </div>

      {params.saved && (
        <div style={{ border: "1px solid rgba(93,211,160,0.28)", background: "rgba(93,211,160,0.10)", color: HQ.green, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, marginBottom: 14 }}>
          Saved taxonomy change.
        </div>
      )}
      {params.error && (
        <div style={{ border: "1px solid rgba(243,103,114,0.32)", background: "rgba(243,103,114,0.10)", color: HQ.red, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, marginBottom: 14 }}>
          {params.error}
        </div>
      )}

      {!data ? (
        <HqCard title="Unavailable" subtitle="Could not load taxonomy.">
          <div style={{ color: HQ.inkMuted, fontSize: 12 }}>Retry shortly.</div>
        </HqCard>
      ) : (
        <>
          <HqCard title="Overview" subtitle="Platform sees all terms. Tenant admins, talent, and public users receive filtered/resolved subsets.">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
              <div style={{ background: HQ.cardSoft, border: `1px solid ${HQ.borderSoft}`, borderRadius: 10, padding: "10px 14px", minWidth: 110 }}>
                <div style={{ fontSize: 11, color: HQ.inkMuted }}>Terms</div>
                <div style={{ fontFamily: FD, fontSize: 22, fontWeight: 650 }}>{flat.length}</div>
              </div>
              <div style={{ background: HQ.cardSoft, border: `1px solid ${HQ.borderSoft}`, borderRadius: 10, padding: "10px 14px", minWidth: 110 }}>
                <div style={{ fontSize: 11, color: HQ.inkMuted }}>Active</div>
                <div style={{ fontFamily: FD, fontSize: 22, fontWeight: 650, color: HQ.green }}>{activeCount}</div>
              </div>
              <div style={{ background: HQ.cardSoft, border: `1px solid ${HQ.borderSoft}`, borderRadius: 10, padding: "10px 14px", minWidth: 110 }}>
                <div style={{ fontSize: 11, color: HQ.inkMuted }}>Public filters</div>
                <div style={{ fontFamily: FD, fontSize: 22, fontWeight: 650, color: HQ.green }}>{publicFilters}</div>
              </div>
              <div style={{ background: HQ.cardSoft, border: `1px solid ${HQ.borderSoft}`, borderRadius: 10, padding: "10px 14px", minWidth: 110 }}>
                <div style={{ fontSize: 11, color: HQ.inkMuted }}>Restricted</div>
                <div style={{ fontFamily: FD, fontSize: 22, fontWeight: 650, color: restricted ? HQ.red : HQ.ink }}>{restricted}</div>
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <Link href="/platform/admin/taxonomy" style={{ color: type === "all" ? HQ.green : HQ.inkMuted, border: `1px solid ${type === "all" ? HQ.green : HQ.borderSoft}`, borderRadius: 999, padding: "4px 9px", fontSize: 11.5, textDecoration: "none" }}>
                All
              </Link>
              {types.map((termType) => (
                <Link key={termType} href={`/platform/admin/taxonomy?type=${encodeURIComponent(termType)}`} style={{ color: type === termType ? HQ.green : HQ.inkMuted, border: `1px solid ${type === termType ? HQ.green : HQ.borderSoft}`, borderRadius: 999, padding: "4px 9px", fontSize: 11.5, textDecoration: "none" }}>
                  {termType}
                </Link>
              ))}
            </div>
          </HqCard>

          <HqCard
            title="Taxonomy Health"
            subtitle="Diagnostics for duplicate labels, bilingual readiness, and hierarchy hygiene. These do not mutate data."
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginBottom: 12 }}>
              <Stat label="Warnings" value={data.issues.length} tone={data.issues.length > 0 ? HQ.amber : HQ.green} />
              <Stat
                label="Group/leaf label collisions"
                value={data.issues.filter((issue) => issue.kind === "group-leaf-same-label").length}
                tone={data.issues.some((issue) => issue.kind === "group-leaf-same-label") ? HQ.amber : HQ.green}
              />
              <Stat
                label="Spanish readiness"
                value={data.issues.some((issue) => issue.kind === "spanish-missing") ? "Needs pass" : "Ready"}
                tone={data.issues.some((issue) => issue.kind === "spanish-missing") ? HQ.amber : HQ.green}
              />
            </div>
            {data.issues.length === 0 ? (
              <div style={{ color: HQ.green, fontSize: 12 }}>No active taxonomy health warnings.</div>
            ) : (
              <div style={{ display: "grid", gap: 7 }}>
                {data.issues.slice(0, 8).map((issue) => (
                  <div
                    key={`${issue.kind}-${issue.title}`}
                    style={{
                      background: HQ.cardSoft,
                      border: `1px solid ${HQ.borderSoft}`,
                      borderRadius: 10,
                      padding: "8px 10px",
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span
                        style={{ color: issue.kind === "spanish-missing" ? HQ.amber : HQ.red, fontSize: 10, fontWeight: 700, minWidth: 150 }}
                        title={issue.kind}
                      >
                        {ISSUE_LABEL[issue.kind]}
                      </span>
                      <strong style={{ color: HQ.ink }}>{issue.title}</strong>
                    </div>
                    <div style={{ color: HQ.inkMuted, marginTop: 3 }}>{issue.detail}</div>
                    <div style={{ color: HQ.inkDim, marginTop: 3, fontFamily: "ui-monospace, monospace", fontSize: 10.5 }}>
                      {issue.slugs.join(", ")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </HqCard>

          <HqCard
            title="Create Taxonomy Term"
            subtitle="Add a platform category, group, talent type, skill, context, or credential to the canonical engine."
          >
            <CreateTaxonomyTermForm allTerms={flat} />
          </HqCard>

          <HqCard title="Tree editor" subtitle={`${visibleTerms.length} visible term${visibleTerms.length === 1 ? "" : "s"} in this view. Select one term to edit.`}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 0.7fr) minmax(0, 1.3fr)", gap: 16 }}>
              <div style={{ maxHeight: 620, overflow: "auto", border: `1px solid ${HQ.borderSoft}`, borderRadius: 12 }}>
                {visibleTerms.map((term) => {
                  const selected = selectedTerm?.id === term.id;
                  const status = term.archived_at ? "archived" : term.is_active ? "active" : "inactive";
                  const href =
                    `/platform/admin/taxonomy?${new URLSearchParams({
                      ...(type === "all" ? {} : { type }),
                      term: term.slug,
                    }).toString()}`;
                  return (
                    <Link
                      key={term.id}
                      href={href}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "22px 1fr auto",
                        gap: 8,
                        alignItems: "center",
                        padding: "9px 10px",
                        borderBottom: `1px solid ${HQ.borderSoft}`,
                        background: selected ? "rgba(93,211,160,0.10)" : "transparent",
                        color: selected ? HQ.green : HQ.ink,
                        textDecoration: "none",
                        fontSize: 12,
                      }}
                    >
                      <span style={{ color: HQ.inkDim }}>L{term.level}</span>
                      <span>
                        <span style={{ marginRight: 6 }}>{term.icon ?? "•"}</span>
                        {term.name_en}
                        <span style={{ display: "block", color: HQ.inkDim, fontFamily: "ui-monospace, monospace", fontSize: 10 }}>{term.slug}</span>
                      </span>
                      <span style={{ color: term.archived_at || !term.is_active ? HQ.red : HQ.green, fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}>
                        {status}
                      </span>
                    </Link>
                  );
                })}
              </div>
              <div>
                {selectedTerm ? (
                  <>
                    <TaxonomyTermForm term={selectedTerm} allTerms={flat} open />
                    {selectedImpact && (
                      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                        <div style={{ border: `1px solid ${HQ.borderSoft}`, borderRadius: 12, padding: 12, background: HQ.cardSoft }}>
                          <div style={{ color: HQ.ink, fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Impact preview</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8 }}>
                            <Stat label="Descendants" value={selectedImpact.descendant_count} tone={selectedImpact.descendant_count > 0 ? HQ.green : HQ.inkDim} />
                            <Stat label="Mappings" value={selectedImpact.field_mapping_count} tone={selectedImpact.field_mapping_count > 0 ? HQ.green : HQ.inkDim} />
                            <Stat label="Required" value={selectedImpact.required_mapping_count} tone={selectedImpact.required_mapping_count > 0 ? HQ.amber : HQ.inkDim} />
                            <Stat label="Profiles" value={selectedImpact.talent_assignment_count} tone={selectedImpact.talent_assignment_count > 0 ? HQ.green : HQ.inkDim} />
                            <Stat label="Tenant overrides" value={selectedImpact.tenant_override_count} tone={selectedImpact.tenant_override_count > 0 ? HQ.amber : HQ.inkDim} />
                          </div>
                          <div style={{ color: HQ.inkMuted, fontSize: 11.5, marginTop: 9 }}>
                            Lifecycle and parent changes should be reviewed here before saving. Assignments and values are never deleted by this page.
                          </div>
                        </div>
                        <div style={{ border: `1px solid ${HQ.borderSoft}`, borderRadius: 12, padding: 12, background: HQ.cardSoft }}>
                          <div style={{ color: HQ.ink, fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Drag order</div>
                          <TaxonomyReorderPanel
                            siblings={selectedSiblings.map((term) => ({
                              id: term.id,
                              slug: term.slug,
                              name_en: term.name_en,
                              sort_order: term.sort_order,
                              icon: term.icon,
                              is_active: term.is_active,
                              archived_at: term.archived_at,
                            }))}
                            selectedId={selectedTerm.id}
                            returnTerm={selectedTerm.slug}
                          />
                        </div>
                        <TaxonomyFieldMappingPanel
                          term={selectedTerm}
                          mappings={data.mappingsByTerm.get(selectedTerm.id) ?? []}
                          fieldOptions={data.fieldOptions}
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ color: HQ.inkMuted, fontSize: 12, padding: "8px 0" }}>
                    No terms match this filter. Select <strong style={{ color: HQ.ink }}>All</strong> above or create a new term.
                  </div>
                )}
              </div>
            </div>
          </HqCard>

          <HqCard title="Preview rules" subtitle="The same term flags feed every downstream surface.">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, fontSize: 12 }}>
              <div style={{ background: HQ.cardSoft, borderRadius: 10, padding: 10 }}>
                <strong style={{ color: HQ.ink }}>Platform Admin</strong>
                <p style={{ color: HQ.inkMuted, margin: "5px 0 0" }}>Sees active and archived terms for engine maintenance.</p>
              </div>
              <div style={{ background: HQ.cardSoft, borderRadius: 10, padding: 10 }}>
                <strong style={{ color: HQ.ink }}>Tenant Admin</strong>
                <p style={{ color: HQ.inkMuted, margin: "5px 0 0" }}>Sees active global terms, narrowed by plan and tenant enablement.</p>
              </div>
              <div style={{ background: HQ.cardSoft, borderRadius: 10, padding: 10 }}>
                <strong style={{ color: HQ.ink }}>Talent</strong>
                <p style={{ color: HQ.inkMuted, margin: "5px 0 0" }}>Sees tenant-enabled terms allowed in registration/self-edit.</p>
              </div>
              <div style={{ background: HQ.cardSoft, borderRadius: 10, padding: 10 }}>
                <strong style={{ color: HQ.ink }}>Public</strong>
                <p style={{ color: HQ.inkMuted, margin: "5px 0 0" }}>Sees public-filter and directory-enabled terms only.</p>
              </div>
            </div>
          </HqCard>

          <HqCard title="Recent Taxonomy Audit" subtitle="Platform mutations write audit rows so engine edits remain accountable.">
            {data.audits.length === 0 ? (
              <div style={{ color: HQ.inkDim, fontSize: 12 }}>
                No audit rows yet. Every create, edit, or archive of a taxonomy term will appear here.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {data.audits.map((audit) => {
                  const d = new Date(audit.created_at);
                  const sameYear = d.getFullYear() === new Date().getFullYear();
                  const formatted = new Intl.DateTimeFormat("en", {
                    month: "short",
                    day: "numeric",
                    ...(sameYear ? {} : { year: "numeric" }),
                    hour: "numeric",
                    minute: "2-digit",
                    timeZoneName: "short",
                  }).format(d);
                  const severityTone =
                    audit.severity === "warn" ? HQ.amber
                    : audit.severity === "emergency" ? HQ.red
                    : HQ.green;
                  return (
                    <div
                      key={audit.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "160px 1fr auto",
                        gap: 10,
                        alignItems: "center",
                        background: HQ.cardSoft,
                        borderRadius: 9,
                        padding: "7px 9px",
                        fontSize: 12,
                      }}
                    >
                      <time dateTime={audit.created_at} title={audit.created_at} style={{ color: HQ.inkDim, fontSize: 11 }}>
                        {formatted}
                      </time>
                      <span style={{ color: HQ.ink, minWidth: 0 }}>
                        <span style={{ fontWeight: 600 }}>{audit.action}</span>
                        <span style={{ color: HQ.inkDim }}> · {audit.target_type}</span>
                      </span>
                      <span style={{ color: severityTone, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}>
                        {audit.severity}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </HqCard>
        </>
      )}
    </div>
  );
}
