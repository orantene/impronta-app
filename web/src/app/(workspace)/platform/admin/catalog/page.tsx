/* eslint-disable max-lines -- the Profile Fields hub shell + inline Fields view; tab bodies are already split into _tabs/*. */
// Phase 9A — Platform HQ · Catalog Map.
// Server Component — no "use client". Platform-admin gated by the
// (workspace)/platform/admin layout (super_admin). Mutations are delegated to
// scoped server actions; this page renders the control-room overview.

import Link from "next/link";
import {
  loadPlatformCatalogMap,
  type CatalogField,
  type CatalogRisk,
} from "../../catalog-map-data";
import {
  canViewerSee,
  type ViewerRole,
} from "@/lib/field-engine/effective-visibility";
import { CreateFieldForm } from "./create-field-form";
import { FieldOrderPanel } from "./field-order-panel";
import { HQ, F, FD, HqCard, HqAccordion, Stat } from "./_ui";
import { GroupsTab } from "./_tabs/groups-tab";
import { TypesTab } from "./_tabs/types-tab";
import { SectionCategoryTab } from "./_tabs/section-category-tab";
import { SectionFieldsGroupTab } from "./_tabs/section-fields-group-tab";
import { SectionFieldsTab } from "./_tabs/section-fields-tab";

export const dynamic = "force-dynamic";

const navLink: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  color: HQ.green,
  textDecoration: "none",
  letterSpacing: 0.2,
};

function VisChip({ v }: { v: CatalogField["visibility"] }) {
  const meta =
    v === "public"
      ? { t: "Public", c: HQ.green }
      : v === "admin"
        ? { t: "Admin-only", c: HQ.amber }
        : { t: "Hidden", c: HQ.inkDim };
  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        color: meta.c,
        border: `1px solid ${meta.c}33`,
        borderRadius: 999,
        padding: "1px 7px",
        whiteSpace: "nowrap",
      }}
    >
      {meta.t}
    </span>
  );
}

function FieldRow({
  f,
  viewAs,
}: {
  f: CatalogField;
  viewAs: ViewerRole;
}) {
  // Phase 9A slice 3 — per-row visibility for the selected viewer.
  // platform_admin is the default and always sees everything.
  const seen = viewAs === "platform_admin" ? true : canViewerSee(f.visibility, viewAs);
  const dim = !seen || f.deprecated;
  // Whole row is the click target — opens the field editor drawer.
  return (
    <Link
      href={`/platform/admin/catalog/${encodeURIComponent(f.field_key)}`}
      className="hq-field-row"
      title={`Edit ${f.label} — click to open field editor`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderTop: `1px solid ${HQ.borderSoft}`,
        fontSize: 12.5,
        color: dim ? HQ.inkDim : HQ.ink,
        opacity: dim ? 0.55 : 1,
        textDecoration: "none",
        cursor: "pointer",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontWeight: 600 }}>{f.label}</span>
          <span style={{ fontSize: 10, color: HQ.green, letterSpacing: 0.2 }}>›</span>
          {f.deprecated && (
            <span style={{ fontSize: 9.5, fontWeight: 700, color: HQ.red }}>DEPRECATED</span>
          )}
          {f.required_default && (
            <span style={{ fontSize: 9.5, fontWeight: 700, color: HQ.amber }}>REQUIRED</span>
          )}
          {f.is_sensitive && (
            <span style={{ fontSize: 9.5, fontWeight: 700, color: HQ.red }}>SENSITIVE</span>
          )}
          {f.admin_only && (
            <span style={{ fontSize: 9.5, fontWeight: 700, color: HQ.amber }}>ADMIN</span>
          )}
          {!seen && viewAs !== "platform_admin" && (
            <span
              style={{ fontSize: 9.5, fontWeight: 700, color: HQ.inkMuted }}
              title={`Effective visibility (${f.visibility}) hidden from ${VIEW_LABELS[viewAs]}`}
            >
              🚫 not shown to {VIEW_LABELS[viewAs].toLowerCase()}
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 10.5,
            color: HQ.inkMuted,
            fontFamily: "ui-monospace, monospace",
          }}
        >
          {f.field_key} · {f.tier} · #{f.display_order}
          {f.section ? ` · ${f.section}` : ""}
        </div>
      </div>
      <VisChip v={f.visibility} />
      <span style={{ fontSize: 11, color: HQ.inkMuted, minWidth: 82, textAlign: "right" }}>
        {f.override_count} overrides
      </span>
      <span style={{ fontSize: 11, color: HQ.inkMuted, minWidth: 78, textAlign: "right" }}>
        {f.value_count} values
      </span>
    </Link>
  );
}

// Two-column group body: scannable field list on the left, drag-to-reorder
// panel on the right. The order panel is hidden while a filter/search is
// active (reordering a filtered subset would be misleading) and for groups
// with fewer than two fields (nothing to reorder).
function GroupFields({
  fields,
  fieldGroupId,
  viewAs,
  filtersActive,
}: {
  fields: CatalogField[];
  fieldGroupId: string | null;
  viewAs: ViewerRole;
  filtersActive: boolean;
}) {
  const showOrder = !filtersActive && fields.length >= 2;
  const colHead: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: HQ.inkDim,
    padding: "0 2px 6px",
  };
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: showOrder ? "minmax(0, 1fr) 340px" : "1fr",
        gap: 18,
        alignItems: "start",
      }}
    >
      <div style={{ minWidth: 0 }}>
        {showOrder && <div style={colHead}>Fields</div>}
        {fields.map((f) => (
          <FieldRow key={f.id} f={f} viewAs={viewAs} />
        ))}
      </div>
      {showOrder && (
        <div style={{ minWidth: 0 }}>
          <div style={colHead}>Drag to reorder</div>
          <FieldOrderPanel
            fieldGroupId={fieldGroupId}
            fields={fields.map((f) => ({
              id: f.id,
              field_key: f.field_key,
              label: f.label,
              display_order: f.display_order,
              deprecated: f.deprecated,
            }))}
          />
        </div>
      )}
    </div>
  );
}

const RISK_TONE: Record<CatalogRisk["kind"], string> = {
  "sensitive-but-public": HQ.red,
  "admin-but-public": HQ.red,
  "deprecated-with-values": HQ.amber,
  "deprecated-active-overrides": HQ.amber,
  unused: HQ.inkMuted,
};

const RISK_LABEL: Record<CatalogRisk["kind"], string> = {
  "sensitive-but-public": "Sensitive + public",
  "admin-but-public": "Admin-only + public",
  "deprecated-with-values": "Deprecated with values",
  "deprecated-active-overrides": "Deprecated with overrides",
  unused: "Unused",
};

// Phase 9A slice 2 — URL-driven filters. Pure server-render (no client JS).
type FilterParams = {
  tier?: string;
  risk?: string;
  override?: string;
  q?: string;
  view?: string;
  tab?: string;
};

// Profile Fields hub tabs. The Fields view is the default and lives inline in
// this page; the other five are extracted tab modules.
type HubTab = "fields" | "groups" | "types" | "editor" | "sections" | "section-fields";
function parseTab(raw: string | undefined): HubTab {
  switch (raw) {
    case "fields":
    case "groups":
    case "editor":
    case "sections":
    case "section-fields":
      return raw;
    default:
      // Talent-Type Category (the taxonomy tree) is the first tab + default landing.
      return "types";
  }
}
const HUB_TABS: ReadonlyArray<{ tab: HubTab; label: string }> = [
  { tab: "types", label: "Talent-Type Category" },
  { tab: "groups", label: "Talent-Type Fields Groups" },
  { tab: "fields", label: "Talent-Type Fields" },
  { tab: "editor", label: "Section Category" },
  { tab: "sections", label: "Section Fields Groups" },
  { tab: "section-fields", label: "Section Fields" },
];

// One-line orientation per tab — rendered under the tab chips so each surface
// is self-explanatory and the six pages read consistently.
const TAB_DESC: Record<HubTab, string> = {
  types:
    "The talent-type taxonomy — parent categories → category groups → talent types. Expand to edit; analytics show agencies + talents per type.",
  groups:
    "Field groups bundle profile fields. Edit, reorder, archive, or permanently remove a group; expand one to see its fields.",
  fields:
    "Every canonical profile field. Filter, search, preview by role, and reorder within each group. Click a field to edit it.",
  editor:
    "The profile-editor rail groups (Profile, Craft, …) that head the talent editor's left rail. Rename, reorder, archive, or remove.",
  sections:
    "The profile-editor sections (Identity → Admin) within each rail group. Edit labels EN/ES, move between groups, and reorder.",
  "section-fields":
    "Each profile-editor section and the fields it shows. Expand a section to view and reorder its fields.",
};

// Phase 9A slice 3 — "View-as" role preview. platform_admin = default
// (sees everything); the other three apply canViewerSee per row.
const VIEW_LABELS: Record<ViewerRole, string> = {
  platform_admin: "Platform admin",
  public: "Public client",
  agency_admin: "Agency admin",
  talent: "Talent",
  client: "Client",
  manager: "Manager",
};
const VIEW_PICKER: ReadonlyArray<{ role: ViewerRole; label: string }> = [
  { role: "platform_admin", label: VIEW_LABELS.platform_admin },
  { role: "public", label: VIEW_LABELS.public },
  { role: "agency_admin", label: VIEW_LABELS.agency_admin },
  { role: "talent", label: VIEW_LABELS.talent },
];
function parseView(raw: string | undefined): ViewerRole {
  switch (raw) {
    case "public":
    case "agency_admin":
    case "talent":
    case "client":
    case "manager":
    case "platform_admin":
      return raw;
    default:
      return "platform_admin";
  }
}

function urlFor(current: FilterParams, patch: Partial<FilterParams>): string {
  const next: FilterParams = { ...current, ...patch };
  const sp = new URLSearchParams();
  if (next.tier && next.tier !== "all") sp.set("tier", next.tier);
  if (next.risk === "yes") sp.set("risk", "yes");
  if (next.override === "yes") sp.set("override", "yes");
  if (next.q) sp.set("q", next.q);
  if (next.view && next.view !== "platform_admin") sp.set("view", next.view);
  const qs = sp.toString();
  return qs ? `?${qs}` : "/platform/admin/catalog";
}

function FilterChip({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 9px",
        borderRadius: 999,
        border: `1px solid ${active ? HQ.green : HQ.borderSoft}`,
        background: active ? "rgba(93,211,160,0.14)" : HQ.cardSoft,
        color: active ? HQ.green : HQ.inkMuted,
        textDecoration: "none",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </Link>
  );
}

export default async function PlatformCatalogMapPage({
  searchParams,
}: {
  searchParams: Promise<FilterParams>;
}) {
  const map = await loadPlatformCatalogMap();
  const params = await searchParams;
  const tier = params.tier ?? "all";
  const riskFilter = params.risk === "yes";
  const overrideFilter = params.override === "yes";
  const q = (params.q ?? "").trim().toLowerCase();
  const viewAs: ViewerRole = parseView(params.view);
  const tab: HubTab = parseTab(params.tab);
  const filtersActive =
    tier !== "all" ||
    riskFilter ||
    overrideFilter ||
    !!q ||
    viewAs !== "platform_admin";

  if (!map.ok) {
    return (
      <div style={{ fontFamily: F, color: HQ.ink, padding: 4 }}>
        <h1 style={{ fontFamily: FD, fontSize: 20, fontWeight: 600 }}>Profile Fields</h1>
        <HqCard title="Unavailable">
          <div style={{ fontSize: 13, color: HQ.inkMuted }}>
            Could not load the catalog (service client unavailable or query
            failed). This surface is read-only and degrades safely — retry
            shortly.
          </div>
        </HqCard>
      </div>
    );
  }

  const s = map.summary;

  // Apply slice-2 filters (purely in-memory; data was already loaded).
  const hasRiskByKey = new Set(map.risks.map((r) => r.field_key));
  function passes(f: CatalogField): boolean {
    if (tier !== "all" && f.tier !== tier) return false;
    if (riskFilter && !hasRiskByKey.has(f.field_key)) return false;
    if (overrideFilter && f.override_count === 0) return false;
    if (
      q &&
      !f.field_key.toLowerCase().includes(q) &&
      !f.label.toLowerCase().includes(q)
    )
      return false;
    return true;
  }
  const filteredGroups = map.groups
    .map((g) => ({ ...g, fields: g.fields.filter(passes) }))
    .filter((g) => g.fields.length > 0);
  const filteredUngrouped = map.ungrouped.filter(passes);
  const filteredCount =
    filteredGroups.reduce((n, g) => n + g.fields.length, 0) +
    filteredUngrouped.length;

  // Separate action-worthy risks from the high-volume "unused" diagnostic so
  // the two real warnings aren't buried under 100+ informational rows.
  const priorityRisks = map.risks.filter((r) => r.kind !== "unused");
  const unusedRisks = map.risks.filter((r) => r.kind === "unused");

  // Shared GET-form hidden inputs so the header search preserves active filters.
  const preservedParams = (
    <>
      {tier !== "all" && <input type="hidden" name="tier" value={tier} />}
      {riskFilter && <input type="hidden" name="risk" value="yes" />}
      {overrideFilter && <input type="hidden" name="override" value="yes" />}
      {viewAs !== "platform_admin" && <input type="hidden" name="view" value={viewAs} />}
    </>
  );

  return (
    <div style={{ fontFamily: F, color: HQ.ink, padding: 4 }}>
      <style>{`
        details.hq-acc > summary { list-style: none; }
        details.hq-acc > summary::-webkit-details-marker { display: none; }
        details.hq-acc[open] > summary .hq-chev { transform: rotate(90deg); }
        details.hq-acc > summary:hover { background: rgba(255,255,255,0.02); border-radius: 12px; }
        a.hq-field-row { transition: background .12s; border-radius: 8px; }
        a.hq-field-row:hover { background: rgba(255,255,255,0.05); }
      `}</style>

      {/* Sticky toolbar — title, primary search, and section actions. */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 5,
          background: "#0E0E11",
          paddingBottom: 12,
          marginBottom: 14,
          borderBottom: `1px solid ${HQ.borderSoft}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", paddingTop: 4 }}>
          <h1 style={{ fontFamily: FD, fontSize: 20, fontWeight: 600, margin: 0 }}>Profile Fields</h1>
          <span style={{ fontSize: 12, color: HQ.inkMuted }}>
            {filtersActive
              ? `${filteredCount} of ${s.totalFields} fields`
              : `${s.totalFields} fields · ${s.totalGroups} groups`}
          </span>
          <form
            method="GET"
            style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}
          >
            {preservedParams}
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search field key or label…"
              style={{
                fontSize: 12.5,
                padding: "6px 11px",
                borderRadius: 7,
                border: `1px solid ${HQ.border}`,
                background: HQ.cardSoft,
                color: HQ.ink,
                fontFamily: F,
                minWidth: 240,
              }}
            />
            <button
              type="submit"
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                padding: "6px 12px",
                border: `1px solid ${HQ.green}`,
                background: "rgba(93,211,160,0.12)",
                color: HQ.green,
                borderRadius: 7,
                cursor: "pointer",
                fontFamily: F,
              }}
            >
              Search
            </button>
            {filtersActive && (
              <Link
                href="/platform/admin/catalog"
                style={{ fontSize: 11, color: HQ.inkMuted, textDecoration: "underline", whiteSpace: "nowrap" }}
              >
                Clear
              </Link>
            )}
          </form>
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10 }}>
          <Link href="/platform/admin/catalog/groups" style={navLink}>Field Groups Builder</Link>
          <Link href="/platform/admin/taxonomy" style={navLink}>Taxonomy Builder</Link>
          <Link href="/platform/admin/catalog/export?format=csv" style={navLink}>Export CSV ↓</Link>
          <Link href="/platform/admin/catalog/export?format=json" style={navLink}>Export JSON ↓</Link>
        </div>
      </div>

      {/* Hub tabs — two labeled clusters: Catalog Engine + Section Editor. */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 12 }}>
        {/* Cluster A — Catalog Engine */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 800,
              letterSpacing: 0.7,
              textTransform: "uppercase",
              color: HQ.inkDim,
              whiteSpace: "nowrap",
              paddingRight: 2,
            }}
          >
            Catalog Engine
          </span>
          {(["types", "groups", "fields"] as const).map((t) => {
            const entry = HUB_TABS.find((h) => h.tab === t)!;
            const active = tab === t;
            return (
              <Link
                key={t}
                href={t === "types" ? "/platform/admin/catalog" : `?tab=${t}`}
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  padding: "5px 12px",
                  borderRadius: 999,
                  border: `1px solid ${active ? HQ.green : HQ.borderSoft}`,
                  background: active ? "rgba(93,211,160,0.14)" : HQ.cardSoft,
                  color: active ? HQ.green : HQ.inkMuted,
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {entry.label}
              </Link>
            );
          })}
        </div>

        {/* Thin divider */}
        <div
          style={{
            width: 1,
            height: 22,
            background: HQ.borderSoft,
            flexShrink: 0,
          }}
        />

        {/* Cluster B — Section Editor (3 chips) */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 800,
              letterSpacing: 0.7,
              textTransform: "uppercase",
              color: HQ.inkDim,
              whiteSpace: "nowrap",
              paddingRight: 2,
            }}
          >
            Section Editor
          </span>
          {(["editor", "sections", "section-fields"] as const).map((t) => {
            const entry = HUB_TABS.find((h) => h.tab === t)!;
            const active = tab === t;
            return (
              <Link
                key={t}
                href={`?tab=${t}`}
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  padding: "5px 12px",
                  borderRadius: 999,
                  border: `1px solid ${active ? HQ.green : HQ.borderSoft}`,
                  background: active ? "rgba(93,211,160,0.14)" : HQ.cardSoft,
                  color: active ? HQ.green : HQ.inkMuted,
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {entry.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Per-tab orientation line — keeps the six pages self-explanatory. */}
      <div
        style={{
          fontSize: 12.5,
          color: HQ.inkMuted,
          maxWidth: 920,
          lineHeight: 1.5,
          marginBottom: 14,
        }}
      >
        {TAB_DESC[tab]}
      </div>

      {/* Field-engine overview — only on the Talent-Type Fields tab, where these
          field-level stats are the relevant summary. Every other tab shows its
          own contextual stats, so the global strip would just be noise there. */}
      {tab === "fields" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <Stat label="Fields" value={s.totalFields} />
          <Stat label="Groups" value={s.totalGroups} />
          <Stat label="Deprecated" value={s.deprecated} tone={s.deprecated ? HQ.amber : undefined} />
          <Stat label="Sensitive" value={s.sensitive} tone={s.sensitive ? HQ.red : undefined} />
          <Stat label="Admin-only" value={s.adminOnly} />
          <Stat label="With values" value={s.fieldsWithValues} />
          <Stat
            label="Risks"
            value={priorityRisks.length}
            tone={priorityRisks.length ? HQ.red : HQ.green}
          />
        </div>
      )}

      {tab === "fields" && (
        <>
      {/* Create field — collapsed by default; occasional action. */}
      <HqAccordion
        title="＋ Create a field"
        meta="Add a canonical profile field, then map it to talent types"
      >
        <CreateFieldForm groups={map.groups.map((group) => ({ id: group.id, name: group.name, slug: group.slug }))} />
      </HqAccordion>

      {/* Filters — collapsed unless something is active. Search lives in the toolbar. */}
      <HqAccordion
        title="Filters"
        defaultOpen={filtersActive}
        badge={
          filtersActive
            ? { text: `${filteredCount} shown`, tone: HQ.green }
            : undefined
        }
        meta={filtersActive ? undefined : "Tier · status · view-as"}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10.5, color: HQ.inkDim, minWidth: 56 }}>Tier</span>
            <FilterChip label="All" href={urlFor(params, { tier: undefined })} active={tier === "all"} />
            <FilterChip label="Universal" href={urlFor(params, { tier: "universal" })} active={tier === "universal"} />
            <FilterChip label="Global" href={urlFor(params, { tier: "global" })} active={tier === "global"} />
            <FilterChip label="Type-specific" href={urlFor(params, { tier: "type-specific" })} active={tier === "type-specific"} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10.5, color: HQ.inkDim, minWidth: 56 }}>Status</span>
            <FilterChip
              label={`Has risks (${map.risks.length})`}
              href={urlFor(params, { risk: riskFilter ? undefined : "yes" })}
              active={riskFilter}
            />
            {(s.fieldsWithOverrides > 0 || overrideFilter) && (
              <FilterChip
                label={`Workspace override (${s.fieldsWithOverrides})`}
                href={urlFor(params, { override: overrideFilter ? undefined : "yes" })}
                active={overrideFilter}
              />
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span
              style={{ fontSize: 10.5, color: HQ.inkDim, minWidth: 56 }}
              title="Preview which fields each audience sees on the public/admin/talent surface"
            >
              View as
            </span>
            {VIEW_PICKER.map(({ role, label }) => (
              <FilterChip
                key={role}
                label={label}
                href={urlFor(params, { view: role === "platform_admin" ? undefined : role })}
                active={viewAs === role}
              />
            ))}
          </div>
        </div>
      </HqAccordion>

      {/* Risk warnings — real issues headlined; the high-volume "unused"
          diagnostic is tucked into its own nested collapse so it can't bury them. */}
      {map.risks.length > 0 && (
        <HqAccordion
          title="Risk warnings"
          defaultOpen={priorityRisks.length > 0}
          badge={
            priorityRisks.length > 0
              ? { text: `${priorityRisks.length} need${priorityRisks.length === 1 ? "s" : ""} attention`, tone: HQ.red }
              : { text: "all clear", tone: HQ.green }
          }
          meta="Read-only diagnostics"
        >
          {priorityRisks.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {priorityRisks.map((r, i) => (
                <div
                  key={`${r.kind}-${r.field_key}-${i}`}
                  style={{ display: "flex", gap: 8, fontSize: 12, padding: "5px 8px", background: HQ.cardSoft, borderRadius: 8 }}
                >
                  <span style={{ fontSize: 10, fontWeight: 700, color: RISK_TONE[r.kind], minWidth: 168 }} title={r.kind}>
                    {RISK_LABEL[r.kind]}
                  </span>
                  <span style={{ color: HQ.ink, fontFamily: "ui-monospace, monospace" }}>{r.field_key}</span>
                  <span style={{ color: HQ.inkMuted }}>{r.detail}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: HQ.inkMuted }}>
              No action-worthy risks. Only informational “unused field” diagnostics below.
            </div>
          )}
          {unusedRisks.length > 0 && (
            <details className="hq-acc" style={{ marginTop: priorityRisks.length ? 12 : 0 }}>
              <summary style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "8px 10px", background: HQ.cardSoft, borderRadius: 8, userSelect: "none" }}>
                <span className="hq-chev" aria-hidden style={{ fontSize: 10, color: HQ.inkDim, transition: "transform .15s", display: "inline-block" }}>▶</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: HQ.inkMuted }}>
                  {unusedRisks.length} unused fields
                </span>
                <span style={{ fontSize: 11, color: HQ.inkDim }}>no overrides, no stored values — informational</span>
              </summary>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "10px 4px 4px" }}>
                {unusedRisks.map((r, i) => (
                  <Link
                    key={`${r.field_key}-${i}`}
                    href={`/platform/admin/catalog/${encodeURIComponent(r.field_key)}`}
                    style={{
                      fontSize: 11,
                      fontFamily: "ui-monospace, monospace",
                      color: HQ.inkMuted,
                      background: HQ.cardSoft,
                      border: `1px solid ${HQ.borderSoft}`,
                      borderRadius: 6,
                      padding: "2px 7px",
                      textDecoration: "none",
                    }}
                  >
                    {r.field_key}
                  </Link>
                ))}
              </div>
            </details>
          )}
        </HqAccordion>
      )}

      {/* Field-group index — each group a collapsed accordion. Auto-opens while
          a filter/search is active so matches stay visible. */}
      {filteredGroups.map((g) => {
        const deprecatedInGroup = g.fields.filter((f) => f.deprecated).length;
        return (
          <HqAccordion
            key={g.id}
            title={g.name}
            defaultOpen={filtersActive}
            badge={
              !g.is_active
                ? { text: "INACTIVE", tone: HQ.amber }
                : deprecatedInGroup > 0
                  ? { text: `${deprecatedInGroup} deprecated`, tone: HQ.amber }
                  : undefined
            }
            meta={`${filtersActive ? `${g.fields.length} of ${g.field_count}` : g.field_count} field${g.field_count === 1 ? "" : "s"} · ${g.slug}`}
          >
            {g.fields.length === 0 ? (
              <div style={{ fontSize: 12, color: HQ.inkDim, padding: "6px 0" }}>
                No fields in this group yet — create one above and assign it here.
              </div>
            ) : (
              <GroupFields
                fields={g.fields}
                fieldGroupId={g.id}
                viewAs={viewAs}
                filtersActive={filtersActive}
              />
            )}
          </HqAccordion>
        );
      })}

      {filteredUngrouped.length > 0 && (
        <HqAccordion
          title="Ungrouped"
          defaultOpen={filtersActive}
          meta={`${filteredUngrouped.length} field${filteredUngrouped.length === 1 ? "" : "s"} with no field group`}
        >
          <GroupFields
            fields={filteredUngrouped}
            fieldGroupId={null}
            viewAs={viewAs}
            filtersActive={filtersActive}
          />
        </HqAccordion>
      )}

      {filtersActive && filteredCount === 0 && (
        <HqCard title="No matches" subtitle="No fields match the current filter set.">
          <div style={{ fontSize: 12, color: HQ.inkMuted }}>
            <Link href="/platform/admin/catalog" style={{ color: HQ.green, textDecoration: "underline" }}>
              Clear all filters
            </Link>{" "}
            to see all {s.totalFields} fields.
          </div>
        </HqCard>
      )}
        </>
      )}

      {tab === "groups" && <GroupsTab sp={params} />}
      {tab === "types" && <TypesTab sp={params} />}
      {tab === "editor" && <SectionCategoryTab sp={params} />}
      {tab === "sections" && <SectionFieldsGroupTab sp={params} />}
      {tab === "section-fields" && <SectionFieldsTab sp={params} />}
    </div>
  );
}
