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
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";

type Translate = (key: string) => string;
const K = "dashboard.platform.catalog";

export const dynamic = "force-dynamic";

const navLink: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  color: HQ.green,
  textDecoration: "none",
  letterSpacing: 0.2,
};

function VisChip({ v, t }: { v: CatalogField["visibility"]; t: Translate }) {
  const meta =
    v === "public"
      ? { label: t(`${K}.visPublic`), c: HQ.green }
      : v === "admin"
        ? { label: t(`${K}.visAdmin`), c: HQ.amber }
        : { label: t(`${K}.visHidden`), c: HQ.inkDim };
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
      {meta.label}
    </span>
  );
}

function FieldRow({
  f,
  viewAs,
  t,
}: {
  f: CatalogField;
  viewAs: ViewerRole;
  t: Translate;
}) {
  // Phase 9A slice 3 — per-row visibility for the selected viewer.
  // platform_admin is the default and always sees everything.
  const seen = viewAs === "platform_admin" ? true : canViewerSee(f.visibility, viewAs);
  const dim = !seen || f.deprecated;
  const viewLabel = t(`${K}.${VIEW_LABEL_KEYS[viewAs]}`);
  // Whole row is the click target — opens the field editor drawer.
  return (
    <Link
      href={`/platform/admin/catalog/${encodeURIComponent(f.field_key)}`}
      className="hq-field-row"
      title={interpolate(t(`${K}.rowEditTitle`), { label: f.label })}
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
            <span style={{ fontSize: 9.5, fontWeight: 700, color: HQ.red }}>{t(`${K}.rowDeprecated`)}</span>
          )}
          {f.required_default && (
            <span style={{ fontSize: 9.5, fontWeight: 700, color: HQ.amber }}>{t(`${K}.rowRequired`)}</span>
          )}
          {f.is_sensitive && (
            <span style={{ fontSize: 9.5, fontWeight: 700, color: HQ.red }}>{t(`${K}.rowSensitive`)}</span>
          )}
          {f.admin_only && (
            <span style={{ fontSize: 9.5, fontWeight: 700, color: HQ.amber }}>{t(`${K}.rowAdmin`)}</span>
          )}
          {!seen && viewAs !== "platform_admin" && (
            <span
              style={{ fontSize: 9.5, fontWeight: 700, color: HQ.inkMuted }}
              title={interpolate(t(`${K}.rowNotShownTitle`), { visibility: f.visibility, role: viewLabel })}
            >
              {interpolate(t(`${K}.rowNotShownTo`), { role: viewLabel.toLowerCase() })}
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
      <VisChip v={f.visibility} t={t} />
      <span style={{ fontSize: 11, color: HQ.inkMuted, minWidth: 82, textAlign: "right" }}>
        {interpolate(t(`${K}.rowOverrides`), { count: f.override_count })}
      </span>
      <span style={{ fontSize: 11, color: HQ.inkMuted, minWidth: 78, textAlign: "right" }}>
        {interpolate(t(`${K}.rowValues`), { count: f.value_count })}
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
  t,
}: {
  fields: CatalogField[];
  fieldGroupId: string | null;
  viewAs: ViewerRole;
  filtersActive: boolean;
  t: Translate;
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
        {showOrder && <div style={colHead}>{t(`${K}.colFields`)}</div>}
        {fields.map((f) => (
          <FieldRow key={f.id} f={f} viewAs={viewAs} t={t} />
        ))}
      </div>
      {showOrder && (
        <div style={{ minWidth: 0 }}>
          <div style={colHead}>{t(`${K}.colDragReorder`)}</div>
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
};

// enum → catalog key; render label via t(), switch on the raw kind.
const RISK_LABEL_KEYS: Record<CatalogRisk["kind"], string> = {
  "sensitive-but-public": "riskSensitivePublic",
  "admin-but-public": "riskAdminPublic",
  "deprecated-with-values": "riskDeprecatedValues",
  "deprecated-active-overrides": "riskDeprecatedOverrides",
};

// Phase 9A slice 2 — URL-driven filters. Pure server-render (no client JS).
type FilterParams = {
  tier?: string;
  risk?: string;
  override?: string;
  status?: string;
  q?: string;
  view?: string;
  tab?: string;
};

// Active | Archived | All — deprecated (archived) fields are HIDDEN by default.
type StatusFilter = "active" | "archived" | "all";
function parseStatus(raw: string | undefined): StatusFilter {
  return raw === "archived" || raw === "all" ? raw : "active";
}

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
// enum → catalog key for the tab chip label + the one-line orientation blurb.
const HUB_TABS: ReadonlyArray<{ tab: HubTab; labelKey: string; descKey: string }> = [
  { tab: "types", labelKey: "tabTypes", descKey: "tabDescTypes" },
  { tab: "groups", labelKey: "tabGroups", descKey: "tabDescGroups" },
  { tab: "fields", labelKey: "tabFields", descKey: "tabDescFields" },
  { tab: "editor", labelKey: "tabEditor", descKey: "tabDescEditor" },
  { tab: "sections", labelKey: "tabSections", descKey: "tabDescSections" },
  { tab: "section-fields", labelKey: "tabSectionFields", descKey: "tabDescSectionFields" },
];

// Phase 9A slice 3 — "View-as" role preview. platform_admin = default
// (sees everything); the other three apply canViewerSee per row.
// enum → catalog key; render via t(), switch on the raw ViewerRole.
const VIEW_LABEL_KEYS: Record<ViewerRole, string> = {
  platform_admin: "viewPlatformAdmin",
  public: "viewPublicClient",
  agency_admin: "viewAgencyAdmin",
  talent: "viewTalent",
  client: "viewClient",
  manager: "viewManager",
};
const VIEW_PICKER_ROLES: ReadonlyArray<ViewerRole> = [
  "platform_admin",
  "public",
  "agency_admin",
  "talent",
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
  if (next.status && next.status !== "active") sp.set("status", next.status);
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
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const params = await searchParams;
  const tier = params.tier ?? "all";
  const riskFilter = params.risk === "yes";
  const overrideFilter = params.override === "yes";
  const status: StatusFilter = parseStatus(params.status);
  const q = (params.q ?? "").trim().toLowerCase();
  const viewAs: ViewerRole = parseView(params.view);
  const tab: HubTab = parseTab(params.tab);
  const filtersActive =
    tier !== "all" ||
    riskFilter ||
    overrideFilter ||
    status !== "active" ||
    !!q ||
    viewAs !== "platform_admin";

  if (!map.ok) {
    return (
      <div style={{ fontFamily: F, color: HQ.ink, padding: 4 }}>
        <h1 style={{ fontFamily: FD, fontSize: 20, fontWeight: 600 }}>{t(`${K}.title`)}</h1>
        <HqCard title={t(`${K}.unavailableTitle`)}>
          <div style={{ fontSize: 13, color: HQ.inkMuted }}>
            {t(`${K}.unavailableBody`)}
          </div>
        </HqCard>
      </div>
    );
  }

  const s = map.summary;

  // Apply slice-2 filters (purely in-memory; data was already loaded).
  const hasRiskByKey = new Set(map.risks.map((r) => r.field_key));
  function passes(f: CatalogField): boolean {
    // Status gate first: archived (deprecated) fields are hidden unless the
    // viewer opts into Archived / All.
    if (status === "active" && f.deprecated) return false;
    if (status === "archived" && !f.deprecated) return false;
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

  // Every remaining risk is action-worthy now that the high-volume "unused"
  // diagnostic is excluded at the loader (it's surfaced as a neutral coverage
  // line below instead of a risk row).
  const priorityRisks = map.risks;

  // Shared GET-form hidden inputs so the header search preserves active filters.
  const preservedParams = (
    <>
      {tier !== "all" && <input type="hidden" name="tier" value={tier} />}
      {riskFilter && <input type="hidden" name="risk" value="yes" />}
      {overrideFilter && <input type="hidden" name="override" value="yes" />}
      {status !== "active" && <input type="hidden" name="status" value={status} />}
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
          <h1 style={{ fontFamily: FD, fontSize: 20, fontWeight: 600, margin: 0 }}>{t(`${K}.title`)}</h1>
          <span style={{ fontSize: 12, color: HQ.inkMuted }}>
            {filtersActive
              ? interpolate(t(`${K}.countFieldsOfTotal`), { shown: filteredCount, total: s.totalFields })
              : interpolate(t(`${K}.countFieldsGroups`), { fields: s.totalFields, groups: s.totalGroups })}
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
              placeholder={t(`${K}.searchPlaceholder`)}
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
              {t(`${K}.searchButton`)}
            </button>
            {filtersActive && (
              <Link
                href="/platform/admin/catalog"
                style={{ fontSize: 11, color: HQ.inkMuted, textDecoration: "underline", whiteSpace: "nowrap" }}
              >
                {t(`${K}.clear`)}
              </Link>
            )}
          </form>
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10 }}>
          <Link href="/platform/admin/catalog/groups" style={navLink}>{t(`${K}.navFieldGroupsBuilder`)}</Link>
          <Link href="/platform/admin/taxonomy" style={navLink}>{t(`${K}.navTaxonomyBuilder`)}</Link>
          <Link href="/platform/admin/catalog/export?format=csv" style={navLink}>{t(`${K}.navExportCsv`)}</Link>
          <Link href="/platform/admin/catalog/export?format=json" style={navLink}>{t(`${K}.navExportJson`)}</Link>
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
            {t(`${K}.clusterCatalogEngine`)}
          </span>
          {(["types", "groups", "fields"] as const).map((tabId) => {
            const entry = HUB_TABS.find((h) => h.tab === tabId)!;
            const active = tab === tabId;
            return (
              <Link
                key={tabId}
                href={tabId === "types" ? "/platform/admin/catalog" : `?tab=${tabId}`}
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
                {t(`${K}.${entry.labelKey}`)}
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
            {t(`${K}.clusterSectionEditor`)}
          </span>
          {(["editor", "sections", "section-fields"] as const).map((tabId) => {
            const entry = HUB_TABS.find((h) => h.tab === tabId)!;
            const active = tab === tabId;
            return (
              <Link
                key={tabId}
                href={`?tab=${tabId}`}
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
                {t(`${K}.${entry.labelKey}`)}
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
        {t(`${K}.${HUB_TABS.find((h) => h.tab === tab)!.descKey}`)}
      </div>

      {/* Field-engine overview — only on the Talent-Type Fields tab, where these
          field-level stats are the relevant summary. Every other tab shows its
          own contextual stats, so the global strip would just be noise there. */}
      {tab === "fields" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <Stat label={t(`${K}.statFields`)} value={s.totalFields} />
          <Stat label={t(`${K}.statGroups`)} value={s.totalGroups} />
          <Stat label={t(`${K}.statDeprecated`)} value={s.deprecated} tone={s.deprecated ? HQ.amber : undefined} />
          <Stat label={t(`${K}.statSensitive`)} value={s.sensitive} tone={s.sensitive ? HQ.red : undefined} />
          <Stat label={t(`${K}.statAdminOnly`)} value={s.adminOnly} />
          <Stat label={t(`${K}.statWithValues`)} value={s.fieldsWithValues} />
          <Stat label={t(`${K}.statHasEsLabel`)} value={`${s.withEsLabel}/${s.totalFields}`} />
          <Stat
            label={t(`${K}.statRisks`)}
            value={priorityRisks.length}
            tone={priorityRisks.length ? HQ.red : HQ.green}
          />
        </div>
      )}

      {tab === "fields" && (
        <>
      {/* Create field — collapsed by default; occasional action. */}
      <HqAccordion
        title={t(`${K}.createFieldTitle`)}
        meta={t(`${K}.createFieldMeta`)}
      >
        <CreateFieldForm groups={map.groups.map((group) => ({ id: group.id, name: group.name, slug: group.slug }))} t={t} />
      </HqAccordion>

      {/* Filters — collapsed unless something is active. Search lives in the toolbar. */}
      <HqAccordion
        title={t(`${K}.filtersTitle`)}
        defaultOpen={filtersActive}
        badge={
          filtersActive
            ? { text: interpolate(t(`${K}.filtersShownBadge`), { count: filteredCount }), tone: HQ.green }
            : undefined
        }
        meta={filtersActive ? undefined : t(`${K}.filtersMeta`)}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10.5, color: HQ.inkDim, minWidth: 56 }}>{t(`${K}.filterTier`)}</span>
            <FilterChip label={t(`${K}.filterAll`)} href={urlFor(params, { tier: undefined })} active={tier === "all"} />
            <FilterChip label={t(`${K}.filterUniversal`)} href={urlFor(params, { tier: "universal" })} active={tier === "universal"} />
            <FilterChip label={t(`${K}.filterGlobal`)} href={urlFor(params, { tier: "global" })} active={tier === "global"} />
            <FilterChip label={t(`${K}.filterTypeSpecific`)} href={urlFor(params, { tier: "type-specific" })} active={tier === "type-specific"} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span
              style={{ fontSize: 10.5, color: HQ.inkDim, minWidth: 56 }}
              title={t(`${K}.filterLifecycleTitle`)}
            >
              {t(`${K}.filterLifecycle`)}
            </span>
            <FilterChip label={t(`${K}.filterActive`)} href={urlFor(params, { status: undefined })} active={status === "active"} />
            <FilterChip label={interpolate(t(`${K}.filterArchivedCount`), { count: s.deprecated })} href={urlFor(params, { status: "archived" })} active={status === "archived"} />
            <FilterChip label={t(`${K}.filterAll`)} href={urlFor(params, { status: "all" })} active={status === "all"} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10.5, color: HQ.inkDim, minWidth: 56 }}>{t(`${K}.filterStatus`)}</span>
            <FilterChip
              label={interpolate(t(`${K}.filterHasRisks`), { count: map.risks.length })}
              href={urlFor(params, { risk: riskFilter ? undefined : "yes" })}
              active={riskFilter}
            />
            {(s.fieldsWithOverrides > 0 || overrideFilter) && (
              <FilterChip
                label={interpolate(t(`${K}.filterWorkspaceOverride`), { count: s.fieldsWithOverrides })}
                href={urlFor(params, { override: overrideFilter ? undefined : "yes" })}
                active={overrideFilter}
              />
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span
              style={{ fontSize: 10.5, color: HQ.inkDim, minWidth: 56 }}
              title={t(`${K}.filterViewAsTitle`)}
            >
              {t(`${K}.filterViewAs`)}
            </span>
            {VIEW_PICKER_ROLES.map((role) => (
              <FilterChip
                key={role}
                label={t(`${K}.${VIEW_LABEL_KEYS[role]}`)}
                href={urlFor(params, { view: role === "platform_admin" ? undefined : role })}
                active={viewAs === role}
              />
            ))}
          </div>
        </div>
      </HqAccordion>

      {/* Risk warnings — only action-worthy issues now. "No data yet" is a
          neutral coverage line, not a risk, so it can't bury the real ones. */}
      {priorityRisks.length > 0 && (
        <HqAccordion
          title={t(`${K}.riskWarningsTitle`)}
          defaultOpen
          badge={{ text: interpolate(t(`${K}.${priorityRisks.length === 1 ? "riskNeedsAttentionOne" : "riskNeedsAttentionMany"}`), { count: priorityRisks.length }), tone: HQ.red }}
          meta={t(`${K}.riskWarningsMeta`)}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {priorityRisks.map((r, i) => (
              <Link
                key={`${r.kind}-${r.field_key}-${i}`}
                href={`/platform/admin/catalog/${encodeURIComponent(r.field_key)}`}
                className="hq-field-row"
                title={interpolate(t(`${K}.riskOpenTitle`), { fieldKey: r.field_key, label: t(`${K}.${RISK_LABEL_KEYS[r.kind]}`) })}
                style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, padding: "5px 8px", background: HQ.cardSoft, borderRadius: 8, textDecoration: "none" }}
              >
                <span style={{ fontSize: 10, fontWeight: 700, color: RISK_TONE[r.kind], minWidth: 168 }} title={r.kind}>
                  {t(`${K}.${RISK_LABEL_KEYS[r.kind]}`)}
                </span>
                <span style={{ color: HQ.ink, fontFamily: "ui-monospace, monospace" }}>{r.field_key}</span>
                <span style={{ color: HQ.inkMuted }}>{r.detail}</span>
                <span style={{ marginLeft: "auto", fontSize: 11, color: HQ.green }}>›</span>
              </Link>
            ))}
          </div>
        </HqAccordion>
      )}

      {/* Neutral coverage line — fields with no data yet are informational, not
          a risk. Replaces the old high-volume "unused" risk rows. */}
      {s.noDataCount > 0 && (
        <div style={{ fontSize: 11.5, color: HQ.inkDim, padding: "4px 2px 10px" }}>
          {interpolate(t(`${K}.${s.noDataCount === 1 ? "noDataOne" : "noDataMany"}`), { count: s.noDataCount })}
        </div>
      )}

      {/* Field-group index — each group a collapsed accordion. Auto-opens while
          a filter/search is active so matches stay visible. */}
      {filteredGroups.map((g) => {
        const deprecatedInGroup = g.fields.filter((f) => f.deprecated).length;
        const partial = g.fields.length < g.field_count;
        const one = g.fields.length === 1;
        const metaKey = partial
          ? one ? "groupFieldsMetaOfOne" : "groupFieldsMetaOfMany"
          : one ? "groupFieldsMetaOne" : "groupFieldsMetaMany";
        return (
          <HqAccordion
            key={g.id}
            title={g.name}
            defaultOpen={filtersActive}
            badge={
              !g.is_active
                ? { text: t(`${K}.groupInactive`), tone: HQ.amber }
                : deprecatedInGroup > 0
                  ? { text: interpolate(t(`${K}.groupDeprecatedCount`), { count: deprecatedInGroup }), tone: HQ.amber }
                  : undefined
            }
            meta={interpolate(t(`${K}.${metaKey}`), { count: g.fields.length, shown: g.fields.length, total: g.field_count, slug: g.slug })}
          >
            {g.fields.length === 0 ? (
              <div style={{ fontSize: 12, color: HQ.inkDim, padding: "6px 0" }}>
                {t(`${K}.groupEmpty`)}
              </div>
            ) : (
              <GroupFields
                fields={g.fields}
                fieldGroupId={g.id}
                viewAs={viewAs}
                filtersActive={filtersActive}
                t={t}
              />
            )}
          </HqAccordion>
        );
      })}

      {filteredUngrouped.length > 0 && (
        <HqAccordion
          title={t(`${K}.ungrouped`)}
          defaultOpen={filtersActive}
          meta={interpolate(t(`${K}.${filteredUngrouped.length === 1 ? "ungroupedMetaOne" : "ungroupedMetaMany"}`), { count: filteredUngrouped.length })}
        >
          <GroupFields
            fields={filteredUngrouped}
            fieldGroupId={null}
            viewAs={viewAs}
            filtersActive={filtersActive}
            t={t}
          />
        </HqAccordion>
      )}

      {filtersActive && filteredCount === 0 && (
        <HqCard title={t(`${K}.noMatchesTitle`)} subtitle={t(`${K}.noMatchesSubtitle`)}>
          <div style={{ fontSize: 12, color: HQ.inkMuted }}>
            <Link href="/platform/admin/catalog" style={{ color: HQ.green, textDecoration: "underline" }}>
              {t(`${K}.noMatchesClear`)}
            </Link>{" "}
            {interpolate(t(`${K}.noMatchesToSee`), { total: s.totalFields })}
          </div>
        </HqCard>
      )}
        </>
      )}

      {tab === "groups" && <GroupsTab sp={params} t={t} />}
      {tab === "types" && <TypesTab sp={params} t={t} />}
      {tab === "editor" && <SectionCategoryTab sp={params} t={t} />}
      {tab === "sections" && <SectionFieldsGroupTab sp={params} t={t} />}
      {tab === "section-fields" && <SectionFieldsTab sp={params} t={t} />}
    </div>
  );
}
