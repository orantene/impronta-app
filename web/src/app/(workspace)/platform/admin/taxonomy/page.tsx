import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  setPlatformTaxonomyLifecycleAction,
  updatePlatformTaxonomyTermAction,
} from "./actions";

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

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: `1px solid ${HQ.borderSoft}`,
  borderRadius: 8,
  background: "#101014",
  color: HQ.ink,
  padding: "8px 10px",
  fontSize: 12.5,
  fontFamily: F,
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

function Input({
  label,
  name,
  defaultValue,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
}) {
  return (
    <label style={{ display: "grid", gap: 5, color: HQ.inkMuted, fontSize: 11, fontWeight: 650 }}>
      {label}
      <input name={name} type={type} defaultValue={defaultValue ?? ""} style={inputStyle} />
    </label>
  );
}

function Textarea({
  label,
  name,
  defaultValue,
  rows = 3,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  rows?: number;
}) {
  return (
    <label style={{ display: "grid", gap: 5, color: HQ.inkMuted, fontSize: 11, fontWeight: 650 }}>
      {label}
      <textarea name={name} defaultValue={defaultValue ?? ""} rows={rows} style={{ ...inputStyle, resize: "vertical" }} />
    </label>
  );
}

function Check({
  name,
  label,
  defaultChecked,
  tone,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
  tone?: "danger" | "safe";
}) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 7, color: tone === "danger" ? HQ.red : tone === "safe" ? HQ.green : HQ.inkMuted, fontSize: 11.5 }}>
      <input type="checkbox" name={name} defaultChecked={!!defaultChecked} />
      {label}
    </label>
  );
}

function listText(values: string[]): string {
  return values.join("\n");
}

function TaxonomyTermForm({
  term,
  allTerms,
  open = false,
}: {
  term: TaxonomyRow;
  allTerms: TaxonomyRow[];
  open?: boolean;
}) {
  const status = term.archived_at ? "archived" : term.is_active ? "active" : "inactive";
  const statusColor = term.archived_at || !term.is_active ? HQ.red : HQ.green;

  return (
    <details
      open={open}
      style={{
        borderTop: `1px solid ${HQ.borderSoft}`,
        padding: "10px 0",
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 10,
          listStyle: "none",
        }}
      >
        <span style={{ width: 24, color: HQ.inkDim, fontSize: 12 }}>L{term.level}</span>
        <span style={{ minWidth: 24, textAlign: "center" }}>{term.icon ?? "•"}</span>
        <span style={{ flex: 1, color: HQ.ink, fontWeight: 700 }}>{term.name_en}</span>
        <span style={{ color: HQ.inkDim, fontFamily: "ui-monospace, monospace", fontSize: 10.5 }}>{term.slug}</span>
        <span style={{ color: statusColor, fontSize: 10.5, fontWeight: 800, textTransform: "uppercase" }}>{status}</span>
        {term.is_public_filter && <span style={{ color: HQ.green, fontSize: 10.5, fontWeight: 800 }}>PUBLIC FILTER</span>}
        {term.is_restricted && <span style={{ color: HQ.red, fontSize: 10.5, fontWeight: 800 }}>RESTRICTED</span>}
      </summary>

      <div style={{ marginTop: 12, paddingLeft: 34, display: "grid", gap: 12 }}>
        <form action={updatePlatformTaxonomyTermAction} style={{ display: "grid", gap: 12 }}>
          <input type="hidden" name="id" value={term.id} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
            <Input label="Slug" name="slug" defaultValue={term.slug} />
            <Input label="Name EN" name="name_en" defaultValue={term.name_en} />
            <Input label="Name ES" name="name_es" defaultValue={term.name_es} />
            <Input label="Plural name" name="plural_name" defaultValue={term.plural_name} />
            <Input label="Icon" name="icon" defaultValue={term.icon} />
            <Input label="Sort order" name="sort_order" type="number" defaultValue={term.sort_order} />
            <Input label="Term type" name="term_type" defaultValue={term.term_type} />
            <Input label="Level" name="level" type="number" defaultValue={term.level} />
            <label style={{ display: "grid", gap: 5, color: HQ.inkMuted, fontSize: 11, fontWeight: 650 }}>
              Parent
              <select name="parent_id" defaultValue={term.parent_id ?? ""} style={inputStyle}>
                <option value="">No parent</option>
                {allTerms
                  .filter((candidate) => candidate.id !== term.id)
                  .map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {"  ".repeat(Math.max(0, candidate.level - 1))}
                      {candidate.name_en} · L{candidate.level}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          <Textarea label="Description" name="description" defaultValue={term.description} />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
            <Textarea label="Aliases" name="aliases" defaultValue={listText(term.aliases)} rows={4} />
            <Textarea label="Search synonyms" name="search_synonyms" defaultValue={listText(term.search_synonyms)} rows={4} />
            <Textarea label="AI keywords" name="ai_keywords" defaultValue={listText(term.ai_keywords)} rows={4} />
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, padding: 12, border: `1px solid ${HQ.borderSoft}`, borderRadius: 10, background: HQ.cardSoft }}>
            <Check name="is_active" label="Active" defaultChecked={term.is_active} tone="safe" />
            <Check name="is_public_filter" label="Public filter" defaultChecked={term.is_public_filter} />
            <Check name="is_visible_by_default" label="Visible by default" defaultChecked={term.is_visible_by_default} />
            <Check name="is_profile_badge" label="Profile badge" defaultChecked={term.is_profile_badge} />
            <Check name="is_restricted" label="Restricted/internal" defaultChecked={term.is_restricted} tone="danger" />
            <Check name="is_generic_fallback" label="Generic fallback" defaultChecked={term.is_generic_fallback} />
            <Input label="Restriction level" name="restriction_level" defaultValue={term.restriction_level} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button type="submit" style={{ border: "1px solid rgba(93,211,160,0.35)", background: "rgba(93,211,160,0.12)", color: HQ.green, borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, fontFamily: F, cursor: "pointer" }}>
              Save term
            </button>
            <span style={{ color: HQ.inkDim, fontSize: 11.5 }}>
              {term.tenant_count} tenant override{term.tenant_count === 1 ? "" : "s"} currently reference this term.
            </span>
          </div>
        </form>

        <form action={setPlatformTaxonomyLifecycleAction}>
          <input type="hidden" name="id" value={term.id} />
          <input type="hidden" name="mode" value={term.archived_at ? "restore" : "archive"} />
          <button type="submit" style={{ border: `1px solid ${term.archived_at ? "rgba(93,211,160,0.35)" : "rgba(243,103,114,0.35)"}`, background: term.archived_at ? "rgba(93,211,160,0.12)" : "rgba(243,103,114,0.10)", color: term.archived_at ? HQ.green : HQ.red, borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, fontFamily: F, cursor: "pointer" }}>
            {term.archived_at ? "Restore taxonomy term" : "Archive taxonomy term"}
          </button>
        </form>
      </div>
    </details>
  );
}

async function loadTaxonomy(): Promise<{ terms: TaxonomyRow[]; roots: TaxonomyRow[] } | null> {
  const sb = createServiceRoleClient();
  if (!sb) return null;

  const [termsR, settingsR] = await Promise.all([
    sb
      .from("taxonomy_terms")
      .select(
        "id, slug, name_en, name_es, plural_name, description, icon, term_type, level, parent_id, sort_order, aliases, search_synonyms, ai_keywords, is_active, archived_at, is_public_filter, is_visible_by_default, is_profile_badge, is_restricted, is_generic_fallback, restriction_level",
      )
      .order("level", { ascending: true })
      .order("sort_order", { ascending: true }),
    sb.from("agency_taxonomy_settings").select("taxonomy_term_id"),
  ]);

  if (termsR.error) return null;

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
  return { terms, roots };
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

  return (
    <div style={{ fontFamily: F, color: HQ.ink, padding: 4 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 4 }}>
        <h1 style={{ fontFamily: FD, fontSize: 22, fontWeight: 600, margin: 0 }}>Taxonomy Builder</h1>
        <Link href="/platform/admin/catalog" style={{ fontSize: 11, fontWeight: 700, color: HQ.green, textDecoration: "none" }}>
          Catalog Map
        </Link>
      </div>
      <div style={{ fontSize: 12.5, color: HQ.inkMuted, marginBottom: 18 }}>
        Edit the global Tulala talent-type tree: bilingual names, aliases, search synonyms, visibility flags, lifecycle, and ordering.
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
                  <TaxonomyTermForm term={selectedTerm} allTerms={flat} open />
                ) : (
                  <div style={{ color: HQ.inkMuted, fontSize: 12 }}>No taxonomy terms in this view.</div>
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
        </>
      )}
    </div>
  );
}
