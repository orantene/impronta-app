// Phase 9A — Platform HQ · Catalog Map (read-only).
// Server Component — no "use client". Platform-admin gated by the
// (workspace)/platform/admin layout (super_admin). Zero mutation: pure
// inspection of the talent field-engine catalog via read-only aggregates
// + the shared visibility engine.

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

export const dynamic = "force-dynamic";

const HQ = {
  card: "#16161A",
  cardSoft: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.10)",
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
        {subtitle && (
          <div style={{ fontSize: 12, color: HQ.inkMuted, marginTop: 2 }}>
            {subtitle}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div
      style={{
        background: HQ.cardSoft,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 10,
        padding: "10px 14px",
        minWidth: 110,
      }}
    >
      <div style={{ fontSize: 11, color: HQ.inkMuted, letterSpacing: 0.3 }}>{label}</div>
      <div
        style={{
          fontFamily: FD,
          fontSize: 22,
          fontWeight: 600,
          color: tone ?? HQ.ink,
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

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
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "7px 10px",
        borderTop: `1px solid ${HQ.borderSoft}`,
        fontSize: 12.5,
        color: dim ? HQ.inkDim : HQ.ink,
        opacity: dim ? 0.55 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Link
            href={`/platform/admin/catalog/${encodeURIComponent(f.field_key)}`}
            style={{ fontWeight: 600, color: "inherit", textDecoration: "none" }}
            title="Open field detail"
          >
            {f.label}
          </Link>
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
          {f.field_key} · {f.tier}
          {f.section ? ` · ${f.section}` : ""}
        </div>
      </div>
      <VisChip v={f.visibility} />
      <span style={{ fontSize: 11, color: HQ.inkMuted, minWidth: 72, textAlign: "right" }}>
        {f.override_count} ws ovr
      </span>
      <span style={{ fontSize: 11, color: HQ.inkMuted, minWidth: 78, textAlign: "right" }}>
        {f.value_count} values
      </span>
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

// Phase 9A slice 2 — URL-driven filters. Pure server-render (no client JS).
type FilterParams = {
  tier?: string;
  risk?: string;
  override?: string;
  q?: string;
  view?: string;
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
  const filtersActive =
    tier !== "all" ||
    riskFilter ||
    overrideFilter ||
    !!q ||
    viewAs !== "platform_admin";

  if (!map.ok) {
    return (
      <div style={{ fontFamily: F, color: HQ.ink, padding: 4 }}>
        <h1 style={{ fontFamily: FD, fontSize: 20, fontWeight: 600 }}>Catalog Map</h1>
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
  const tierEntries = Object.entries(s.byTier).sort((a, b) => b[1] - a[1]);

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

  return (
    <div style={{ fontFamily: F, color: HQ.ink, padding: 4 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 4 }}>
        <h1 style={{ fontFamily: FD, fontSize: 20, fontWeight: 600, margin: 0 }}>
          Catalog Map
        </h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link
            href="/platform/admin/catalog/groups"
            style={{ fontSize: 11, fontWeight: 700, color: HQ.green, textDecoration: "none", letterSpacing: 0.2 }}
          >
            Field Groups Builder
          </Link>
          <span style={{ fontSize: 11, color: HQ.inkDim }}>·</span>
          <Link
            href="/platform/admin/taxonomy"
            style={{ fontSize: 11, fontWeight: 700, color: HQ.green, textDecoration: "none", letterSpacing: 0.2 }}
          >
            Taxonomy Builder
          </Link>
          <span style={{ fontSize: 11, color: HQ.inkDim }}>·</span>
          <Link
            href="/platform/admin/catalog/export?format=csv"
            style={{ fontSize: 11, fontWeight: 600, color: HQ.green, textDecoration: "none", letterSpacing: 0.2 }}
          >
            Export CSV ↓
          </Link>
          <span style={{ fontSize: 11, color: HQ.inkDim }}>·</span>
          <Link
            href="/platform/admin/catalog/export?format=json"
            style={{ fontSize: 11, fontWeight: 600, color: HQ.green, textDecoration: "none", letterSpacing: 0.2 }}
          >
            Export JSON ↓
          </Link>
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: HQ.inkMuted, marginBottom: 18 }}>
        Platform control room for the talent field engine — every platform
        field, group, tier, default visibility (via the shared engine),
        workspace adoption, value usage, and config risk. Open a field to
        edit bilingual labels, lifecycle, visibility, and taxonomy mapping.
      </div>

      <HqCard
        title="Create Field"
        subtitle="Add a canonical profile field, then map it to the talent types that should load it."
      >
        <CreateFieldForm groups={map.groups.map((group) => ({ id: group.id, name: group.name, slug: group.slug }))} />
      </HqCard>

      <HqCard
        title="Filters"
        subtitle={
          filtersActive
            ? `Showing ${filteredCount} of ${s.totalFields} fields`
            : `All ${s.totalFields} fields`
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: 10.5, color: HQ.inkDim, minWidth: 56 }}>
              Tier
            </span>
            <FilterChip
              label="All"
              href={urlFor(params, { tier: undefined })}
              active={tier === "all"}
            />
            <FilterChip
              label="Universal"
              href={urlFor(params, { tier: "universal" })}
              active={tier === "universal"}
            />
            <FilterChip
              label="Global"
              href={urlFor(params, { tier: "global" })}
              active={tier === "global"}
            />
            <FilterChip
              label="Type-specific"
              href={urlFor(params, { tier: "type-specific" })}
              active={tier === "type-specific"}
            />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: 10.5, color: HQ.inkDim, minWidth: 56 }}>
              Status
            </span>
            <FilterChip
              label={`Has risks (${map.risks.length})`}
              href={urlFor(params, { risk: riskFilter ? undefined : "yes" })}
              active={riskFilter}
            />
            {(s.fieldsWithOverrides > 0 || overrideFilter) && (
              <FilterChip
                label={`Workspace override (${s.fieldsWithOverrides})`}
                href={urlFor(params, {
                  override: overrideFilter ? undefined : "yes",
                })}
                active={overrideFilter}
              />
            )}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
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
                href={urlFor(params, {
                  view: role === "platform_admin" ? undefined : role,
                })}
                active={viewAs === role}
              />
            ))}
          </div>
          <form
            method="GET"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: 10.5, color: HQ.inkDim, minWidth: 56 }}>
              Search
            </span>
            {/* Preserve other params on form submit. */}
            {tier !== "all" && <input type="hidden" name="tier" value={tier} />}
            {riskFilter && <input type="hidden" name="risk" value="yes" />}
            {overrideFilter && (
              <input type="hidden" name="override" value="yes" />
            )}
            {viewAs !== "platform_admin" && (
              <input type="hidden" name="view" value={viewAs} />
            )}
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="field key or label…"
              style={{
                fontSize: 12,
                padding: "5px 10px",
                borderRadius: 6,
                border: `1px solid ${HQ.borderSoft}`,
                background: HQ.cardSoft,
                color: HQ.ink,
                fontFamily: F,
                minWidth: 240,
              }}
            />
            <button
              type="submit"
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "5px 11px",
                border: `1px solid ${HQ.green}`,
                background: "rgba(93,211,160,0.12)",
                color: HQ.green,
                borderRadius: 6,
                cursor: "pointer",
                fontFamily: F,
              }}
            >
              Apply
            </button>
            {filtersActive && (
              <Link
                href="/platform/admin/catalog"
                style={{
                  fontSize: 11,
                  color: HQ.inkMuted,
                  textDecoration: "underline",
                }}
              >
                Clear all
              </Link>
            )}
          </form>
        </div>
      </HqCard>

      <HqCard title="Overview">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <Stat label="Fields" value={s.totalFields} />
          <Stat label="Groups" value={s.totalGroups} />
          <Stat label="Deprecated" value={s.deprecated} tone={s.deprecated ? HQ.amber : undefined} />
          <Stat label="Admin-only" value={s.adminOnly} />
          <Stat label="Sensitive" value={s.sensitive} tone={s.sensitive ? HQ.red : undefined} />
          <Stat label="With ws overrides" value={s.fieldsWithOverrides} />
          <Stat label="With values" value={s.fieldsWithValues} />
          <Stat label="Risks" value={map.risks.length} tone={map.risks.length ? HQ.red : HQ.green} />
        </div>
        {tierEntries.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 12, color: HQ.inkMuted }}>
            By tier:{" "}
            {tierEntries.map(([t, n], i) => (
              <span key={t}>
                {i > 0 ? " · " : ""}
                <strong style={{ color: HQ.ink }}>{n}</strong> {t}
              </span>
            ))}
          </div>
        )}
      </HqCard>

      {map.risks.length > 0 && (
        <HqCard
          title={`Risk warnings (${map.risks.length})`}
          subtitle="Read-only diagnostics — never auto-acted."
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {map.risks.map((r, i) => (
              <div
                key={`${r.kind}-${r.field_key}-${i}`}
                style={{
                  display: "flex",
                  gap: 8,
                  fontSize: 12,
                  padding: "5px 8px",
                  background: HQ.cardSoft,
                  borderRadius: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: RISK_TONE[r.kind],
                    minWidth: 168,
                  }}
                >
                  {r.kind}
                </span>
                <span style={{ color: HQ.ink, fontFamily: "ui-monospace, monospace" }}>
                  {r.field_key}
                </span>
                <span style={{ color: HQ.inkMuted }}>{r.detail}</span>
              </div>
            ))}
          </div>
        </HqCard>
      )}

      {filteredGroups.map((g) => (
        <HqCard
          key={g.id}
          title={g.name}
          subtitle={`${g.fields.length} of ${g.field_count} field${g.field_count === 1 ? "" : "s"} · ${g.slug}${g.is_active ? "" : " · INACTIVE"}`}
        >
          <div>
            {g.fields.length === 0 ? (
              <div style={{ fontSize: 12, color: HQ.inkDim }}>No fields.</div>
            ) : (
              g.fields.map((f) => <FieldRow key={f.id} f={f} viewAs={viewAs} />)
            )}
          </div>
        </HqCard>
      ))}

      {filteredUngrouped.length > 0 && (
        <HqCard
          title="Ungrouped"
          subtitle={`${filteredUngrouped.length} field${filteredUngrouped.length === 1 ? "" : "s"} with no field group`}
        >
          <div>
            {filteredUngrouped.map((f) => (
              <FieldRow key={f.id} f={f} viewAs={viewAs} />
            ))}
          </div>
        </HqCard>
      )}

      {filtersActive && filteredCount === 0 && (
        <HqCard
          title="No matches"
          subtitle="No fields match the current filter set."
        >
          <div style={{ fontSize: 12, color: HQ.inkMuted }}>
            <Link
              href="/platform/admin/catalog"
              style={{ color: HQ.green, textDecoration: "underline" }}
            >
              Clear all filters
            </Link>{" "}
            to see all {s.totalFields} fields.
          </div>
        </HqCard>
      )}
    </div>
  );
}
