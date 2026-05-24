// Phase 9A slices 4 + 5 — Platform HQ · Catalog · per-field detail (read-only).
// Server Component. Platform-admin gated by the (workspace)/platform/admin
// layout (super_admin). Zero mutation; aggregates over the canonical
// engine + a tenant join for workspace-name expansion + per-tenant talent-value counts.

import Link from "next/link";
import {
  loadPlatformCatalogFieldDetail,
  type FieldDetailField,
  type FieldDetailRisk,
  type FieldDetailWorkspace,
} from "../../../catalog-field-detail-data";
import {
  setPlatformFieldLifecycleAction,
  updatePlatformFieldAction,
  updatePlatformFieldRecommendationAction,
} from "../actions";
import {
  Check,
  FIELD_KINDS,
  FIELD_SECTIONS,
  FIELD_TIERS,
  FieldInput,
  FieldSelect,
  FieldTextarea,
  MappingRow,
  SaveNotice,
  SubmitButton,
  optionsJson,
} from "./field-detail-editor-parts";

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
          <div style={{ fontSize: 12, color: HQ.inkMuted, marginTop: 2 }}>{subtitle}</div>
        )}
      </div>
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: string;
}) {
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

function VisChip({ v }: { v: FieldDetailField["visibility"] }) {
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

const RISK_TONE: Record<FieldDetailRisk["kind"], string> = {
  "sensitive-but-public": HQ.red,
  "admin-but-public": HQ.red,
  "deprecated-with-values": HQ.amber,
  "deprecated-active-overrides": HQ.amber,
  unused: HQ.inkMuted,
};

function summariseOverride(w: FieldDetailWorkspace): string {
  const parts: string[] = [];
  if (w.enabled_override === false) parts.push("disabled");
  if (w.required_override === true) parts.push("required");
  if (w.required_override === false) parts.push("optional");
  if (w.custom_label) parts.push(`label: "${w.custom_label}"`);
  if (w.custom_helper) parts.push("custom helper");
  if (w.show_in_public_override === true) parts.push("→ public");
  if (w.show_in_public_override === false) parts.push("→ hidden from public");
  if (w.admin_only_override === true) parts.push("admin-only");
  return parts.length === 0 ? "no override columns set (legacy row)" : parts.join(" · ");
}

function WorkspaceRow({ w, isFirst }: { w: FieldDetailWorkspace; isFirst: boolean }) {
  const planTone =
    w.plan === "agency" || w.plan === "network"
      ? HQ.green
      : w.plan === "studio"
        ? HQ.amber
        : HQ.inkMuted;
  // Seed/dummy tenants often lack display_name + slug + status. The loader
  // falls back to tenant_id for name+slug and "unknown" for status. Detect
  // that fallback and render gracefully instead of leaking raw UUIDs.
  const isUnnamed = w.name === w.tenant_id;
  const hasRealSlug = w.slug !== w.tenant_id;
  const hasRealStatus = w.status !== "unknown" && w.status !== "active";
  return (
    <Link
      href={`/platform/admin/tenants/${w.tenant_id}/catalog`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderTop: isFirst ? "none" : `1px solid ${HQ.borderSoft}`,
        fontSize: 12.5,
        opacity: w.status === "active" ? 1 : 0.7,
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontWeight: 600,
              color: isUnnamed ? HQ.inkDim : HQ.ink,
              fontStyle: isUnnamed ? "italic" : "normal",
            }}
          >
            {isUnnamed ? "Unnamed workspace" : w.name}
          </span>
          {isUnnamed && (
            <span
              style={{
                fontSize: 10,
                color: HQ.inkDim,
                fontFamily: "ui-monospace, monospace",
              }}
              title={w.tenant_id}
            >
              {`${w.tenant_id.slice(0, 4)}…${w.tenant_id.slice(-4)}`}
            </span>
          )}
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              padding: "1px 5px",
              borderRadius: 4,
              background: HQ.cardSoft,
              color: HQ.inkMuted,
              textTransform: "uppercase",
              letterSpacing: 0.4,
            }}
          >
            {w.entity_type}
          </span>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: planTone }}>
            {w.plan}
          </span>
          {!w.has_override && (
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                padding: "1px 5px",
                borderRadius: 4,
                background: HQ.cardSoft,
                color: HQ.inkDim,
                letterSpacing: 0.3,
              }}
            >
              no override
            </span>
          )}
          {hasRealStatus && (
            <span style={{ fontSize: 9.5, fontWeight: 700, color: HQ.red }}>
              {w.status.toUpperCase()}
            </span>
          )}
        </div>
        <div style={{ fontSize: 10.5, color: HQ.inkMuted, marginTop: 2 }}>
          {w.has_override ? summariseOverride(w) : "Using platform defaults — no field override set."}
        </div>
      </div>
      {/* Talents with a value */}
      <div style={{ textAlign: "right", minWidth: 56 }}>
        <div
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: 15,
            fontWeight: 600,
            color: w.value_count > 0 ? HQ.green : HQ.inkDim,
          }}
        >
          {w.value_count}
        </div>
        <div style={{ fontSize: 9.5, color: HQ.inkDim, marginTop: 1 }}>talents</div>
      </div>
      {hasRealSlug && (
        <span
          style={{
            fontSize: 10.5,
            color: HQ.inkDim,
            fontFamily: "ui-monospace, monospace",
            minWidth: 80,
            textAlign: "right",
          }}
        >
          {w.slug}
        </span>
      )}
    </Link>
  );
}

export default async function PlatformCatalogFieldDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ fieldKey: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { fieldKey } = await params;
  const { saved, error } = await searchParams;
  const decoded = decodeURIComponent(fieldKey);
  const detail = await loadPlatformCatalogFieldDetail(decoded);

  // Breadcrumb (shared by all states)
  const breadcrumb = (
    <div style={{ marginBottom: 16, fontFamily: F, fontSize: 12 }}>
      <Link
        href="/platform/admin/catalog"
        style={{ color: HQ.inkMuted, textDecoration: "none" }}
      >
        ← Catalog Map
      </Link>
    </div>
  );

  if (!detail.ok) {
    return (
      <div style={{ fontFamily: F, color: HQ.ink, padding: 4 }}>
        {breadcrumb}
        <h1 style={{ fontFamily: FD, fontSize: 20, fontWeight: 600 }}>Field detail</h1>
        <HqCard title="Unavailable">
          <div style={{ fontSize: 13, color: HQ.inkMuted }}>
            Could not load this field (service client unavailable or query
            failed). This surface is read-only and degrades safely — retry
            shortly.
          </div>
        </HqCard>
      </div>
    );
  }
  if (!detail.field) {
    return (
      <div style={{ fontFamily: F, color: HQ.ink, padding: 4 }}>
        {breadcrumb}
        <h1 style={{ fontFamily: FD, fontSize: 20, fontWeight: 600 }}>Field not found</h1>
        <HqCard title="No field with that key">
          <div style={{ fontSize: 13, color: HQ.inkMuted }}>
            <span style={{ fontFamily: "ui-monospace, monospace" }}>{decoded}</span>{" "}
            does not exist in <code>profile_field_definitions</code>.
          </div>
        </HqCard>
      </div>
    );
  }

  const f = detail.field;
  const fieldOptions = optionsJson(f.options);

  return (
    <div style={{ fontFamily: F, color: HQ.ink, padding: 4 }}>
      {breadcrumb}
      <SaveNotice saved={saved} error={error} />

      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 4 }}>
        <h1 style={{ fontFamily: FD, fontSize: 22, fontWeight: 600, margin: 0 }}>
          {f.label}
          {f.deprecated && (
            <span
              style={{
                marginLeft: 10,
                fontSize: 11,
                fontWeight: 700,
                color: HQ.red,
                verticalAlign: "middle",
              }}
            >
              DEPRECATED
            </span>
          )}
        </h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link
            href={`/platform/admin/catalog/${encodeURIComponent(f.field_key)}/export?format=csv`}
            style={{ fontSize: 11, fontWeight: 600, color: HQ.green, textDecoration: "none", letterSpacing: 0.2 }}
          >
            Export CSV ↓
          </Link>
          <span style={{ fontSize: 11, color: HQ.inkDim }}>·</span>
          <Link
            href={`/platform/admin/catalog/${encodeURIComponent(f.field_key)}/export?format=json`}
            style={{ fontSize: 11, fontWeight: 600, color: HQ.green, textDecoration: "none", letterSpacing: 0.2 }}
          >
            Export JSON ↓
          </Link>
        </div>
      </div>
      <div
        style={{
          fontSize: 12,
          color: HQ.inkMuted,
          marginBottom: 16,
          fontFamily: "ui-monospace, monospace",
        }}
      >
        {f.field_key}
        {" · "}
        {f.field_group_name ? `${f.field_group_name} · ` : ""}
        {f.tier}
        {f.section ? ` · ${f.section}` : ""}
      </div>

      <HqCard title="Field summary">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          <Stat label="Visibility" value={f.visibility} />
          <Stat label="Workspaces overriding" value={f.total_override_count} />
          <Stat
            label="Stored values"
            value={f.total_value_count}
            tone={f.deprecated && f.total_value_count > 0 ? HQ.amber : undefined}
          />
          <Stat
            label="Tenants with values"
            value={f.tenants_with_values}
            tone={f.tenants_with_values > 0 ? HQ.green : HQ.inkDim}
          />
          <Stat
            label="Risks"
            value={detail.risks.length}
            tone={detail.risks.length ? HQ.red : HQ.green}
          />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          <VisChip v={f.visibility} />
          {f.required_default && (
            <span style={{ fontSize: 10.5, fontWeight: 700, color: HQ.amber }}>
              REQUIRED by default
            </span>
          )}
          {f.is_sensitive && (
            <span style={{ fontSize: 10.5, fontWeight: 700, color: HQ.red }}>SENSITIVE</span>
          )}
          {f.admin_only && (
            <span style={{ fontSize: 10.5, fontWeight: 700, color: HQ.amber }}>ADMIN-ONLY</span>
          )}
          {f.show_in_public && (
            <span style={{ fontSize: 10.5, fontWeight: 700, color: HQ.green }}>
              show_in_public
            </span>
          )}
        </div>
        {f.helper && (
          <div
            style={{
              fontSize: 12.5,
              color: HQ.inkMuted,
              fontStyle: "italic",
              borderLeft: `2px solid ${HQ.borderSoft}`,
              paddingLeft: 10,
            }}
          >
            “{f.helper}”
          </div>
        )}
      </HqCard>

      <HqCard
        title="Engine editor"
        subtitle="Edits the canonical profile_field_definitions row. Save writes audit history and refreshes every resolved catalog surface."
      >
        <form action={updatePlatformFieldAction} style={{ display: "grid", gap: 14 }}>
          <input type="hidden" name="id" value={f.id} />
          <input type="hidden" name="current_field_key" value={f.field_key} />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
            <FieldInput label="Field key" name="field_key" defaultValue={f.field_key} />
            <FieldSelect label="Field group" name="field_group_id" defaultValue={f.field_group_id}>
              <option value="">Ungrouped</option>
              {detail.fieldGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name_en}{g.is_active ? "" : " (archived)"}
                </option>
              ))}
            </FieldSelect>
            <FieldInput label="Label EN" name="label" defaultValue={f.label} />
            <FieldInput label="Label ES" name="label_es" defaultValue={f.label_es} />
            <FieldTextarea label="Helper EN" name="helper" defaultValue={f.helper} />
            <FieldTextarea label="Helper ES" name="helper_es" defaultValue={f.helper_es} />
            <FieldInput label="Placeholder" name="placeholder" defaultValue={f.placeholder} />
            <FieldInput label="Unit" name="unit" defaultValue={f.unit} placeholder="cm, kg, people…" />
            <FieldSelect label="Tier" name="tier" defaultValue={f.tier}>
              {FIELD_TIERS.map((tier) => (
                <option key={tier} value={tier}>{tier}</option>
              ))}
            </FieldSelect>
            <FieldSelect label="Input type" name="kind" defaultValue={f.kind}>
              {FIELD_KINDS.map((kind) => (
                <option key={kind} value={kind}>{kind}</option>
              ))}
            </FieldSelect>
            <FieldSelect label="Editor section" name="section" defaultValue={f.section}>
              {[...new Set([...FIELD_SECTIONS, f.section ?? ""])].filter(Boolean).map((section) => (
                <option key={section} value={section}>{section}</option>
              ))}
            </FieldSelect>
            <FieldInput label="Subsection" name="subsection" defaultValue={f.subsection} />
            <FieldInput label="Display order" name="display_order" type="number" defaultValue={f.display_order} />
            <FieldInput label="Minimum count" name="count_min" type="number" defaultValue={f.count_min} />
          </div>

          <FieldTextarea
            label="Options JSON"
            name="options_json"
            defaultValue={fieldOptions}
            placeholder='["Option A", "Option B"]'
            rows={fieldOptions ? 8 : 3}
          />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 12,
              padding: 12,
              border: `1px solid ${HQ.borderSoft}`,
              borderRadius: 10,
              background: HQ.cardSoft,
            }}
          >
            <div style={{ display: "grid", gap: 7 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: HQ.ink }}>Default visibility</div>
              <Check name="default_visibility_public" label="Public" defaultChecked={f.default_visibility.includes("public")} />
              <Check name="default_visibility_agency" label="Agency/admin" defaultChecked={f.default_visibility.includes("agency")} />
              <Check name="default_visibility_private" label="Private" defaultChecked={f.default_visibility.includes("private")} />
            </div>
            <div style={{ display: "grid", gap: 7 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: HQ.ink }}>Surface flags</div>
              <Check name="show_in_public" label="Public profile" defaultChecked={f.show_in_public} tone={f.is_sensitive || f.admin_only ? "danger" : undefined} />
              <Check name="show_in_directory" label="Directory/search" defaultChecked={f.show_in_directory} />
              <Check name="show_in_registration" label="Registration" defaultChecked={f.show_in_registration} />
              <Check name="show_in_edit_drawer" label="Profile editor" defaultChecked={f.show_in_edit_drawer} />
            </div>
            <div style={{ display: "grid", gap: 7 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: HQ.ink }}>Safety flags</div>
              <Check name="admin_only" label="Admin only" defaultChecked={f.admin_only} tone="danger" />
              <Check name="is_sensitive" label="Sensitive" defaultChecked={f.is_sensitive} tone="danger" />
              <Check name="talent_editable" label="Talent editable" defaultChecked={f.talent_editable} />
              <Check name="requires_review_on_change" label="Review on change" defaultChecked={f.requires_review_on_change} />
              <Check name="is_searchable" label="Searchable" defaultChecked={f.is_searchable} />
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <SubmitButton>Save field definition</SubmitButton>
            <span style={{ color: HQ.inkDim, fontSize: 11.5 }}>
              Platform safety floors still apply in the resolver and public visibility engine.
            </span>
          </div>
        </form>
      </HqCard>

      <HqCard
        title="Lifecycle"
        subtitle="Soft archive only. Stored values remain intact; archived fields stop appearing for new input."
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div style={{ fontSize: 12.5, color: HQ.inkMuted }}>
            Status:{" "}
            <strong style={{ color: f.deprecated ? HQ.red : HQ.green }}>
              {f.deprecated ? `Deprecated since ${f.deprecated_at}` : "Active"}
            </strong>
            {" · "}
            {f.total_value_count} stored live value{f.total_value_count === 1 ? "" : "s"}
          </div>
          <form action={setPlatformFieldLifecycleAction}>
            <input type="hidden" name="id" value={f.id} />
            <input type="hidden" name="field_key" value={f.field_key} />
            <input type="hidden" name="mode" value={f.deprecated ? "restore" : "archive"} />
            <SubmitButton tone={f.deprecated ? "neutral" : "danger"}>
              {f.deprecated ? "Restore field" : "Archive field"}
            </SubmitButton>
          </form>
        </div>
      </HqCard>

      <HqCard
        title="Field-to-taxonomy mapping"
        subtitle="Controls when type-specific fields appear in Details, registration, and publish requirements."
      >
        {detail.recommendations.length === 0 ? (
          <div style={{ fontSize: 12, color: HQ.inkDim, marginBottom: 12 }}>
            No taxonomy mapping yet. Universal/global fields may still appear from tier rules; type-specific fields need mappings.
          </div>
        ) : (
          <div style={{ marginBottom: 14 }}>
            {detail.recommendations.map((rec) => (
              <MappingRow key={rec.id} rec={rec} fieldKey={f.field_key} />
            ))}
          </div>
        )}

        <form
          action={updatePlatformFieldRecommendationAction}
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.5fr) 160px 110px",
            gap: 10,
            alignItems: "end",
            paddingTop: 12,
            borderTop: `1px solid ${HQ.borderSoft}`,
          }}
        >
          <input type="hidden" name="field_definition_id" value={f.id} />
          <input type="hidden" name="field_key" value={f.field_key} />
          <FieldSelect label="Taxonomy term" name="taxonomy_term_id">
            <option value="">Choose a category/type…</option>
            {detail.taxonomyTerms.map((term) => (
              <option key={term.id} value={term.id}>
                {"  ".repeat(Math.max(0, term.level - 1))}
                {term.name_en} · {term.term_type}
              </option>
            ))}
          </FieldSelect>
          <FieldSelect label="Relationship" name="relationship" defaultValue="applies">
            <option value="applies">applies</option>
            <option value="recommended">recommended</option>
            <option value="required">required</option>
          </FieldSelect>
          <FieldInput label="Order" name="display_order" type="number" defaultValue={100} />
          <div style={{ gridColumn: "1 / -1", display: "flex", flexWrap: "wrap", gap: 14 }}>
            <Check name="required_at_registration" label="Required at registration" />
            <Check name="required_before_publish" label="Required before publish" />
            <Check name="required_before_verification" label="Required before verification" />
            <Check name="requires_verification" label="Requires verification" />
            <Check name="is_admin_only" label="Admin-only mapping" tone="danger" />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <SubmitButton>Save mapping</SubmitButton>
          </div>
        </form>
      </HqCard>

      <HqCard
        title="Impact preview"
        subtitle="Use this before changing lifecycle, visibility, required flags, or taxonomy mappings."
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
          <Stat label="Stored values" value={f.total_value_count} tone={f.total_value_count > 0 ? HQ.green : HQ.inkDim} />
          <Stat label="Tenant overrides" value={f.total_override_count} tone={f.total_override_count > 0 ? HQ.amber : HQ.inkDim} />
          <Stat label="Mapped terms" value={detail.recommendations.length} tone={detail.recommendations.length > 0 ? HQ.green : HQ.inkDim} />
          <Stat label="Risk warnings" value={detail.risks.length} tone={detail.risks.length > 0 ? HQ.red : HQ.green} />
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: HQ.inkMuted }}>
          Archive and visibility changes are intentionally soft: tenant settings, stored values, public exposure, and publish/completion behavior remain inspectable here before and after save.
        </div>
      </HqCard>

      {detail.risks.length > 0 && (
        <HqCard
          title={`Risks (${detail.risks.length})`}
          subtitle="Read-only diagnostics — never auto-acted."
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {detail.risks.map((r, i) => (
              <div
                key={`${r.kind}-${i}`}
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
                <span style={{ color: HQ.inkMuted }}>{r.detail}</span>
              </div>
            ))}
          </div>
        </HqCard>
      )}

      <HqCard
        title="Workspace adoption"
        subtitle={(() => {
          if (detail.workspaces.length === 0)
            return "No workspace has an override or talent with a value for this field.";
          const overrideCount = detail.workspaces.filter((w) => w.has_override).length;
          const valueOnlyCount = detail.workspaces.length - overrideCount;
          const parts: string[] = [];
          if (overrideCount > 0)
            parts.push(`${overrideCount} with a field override`);
          if (valueOnlyCount > 0)
            parts.push(`${valueOnlyCount} with talent values but no override`);
          return `${detail.workspaces.length} workspace${detail.workspaces.length === 1 ? "" : "s"} — ${parts.join(", ")}. Sorted by talent count.`;
        })()}
      >
        {detail.workspaces.length === 0 ? (
          <div style={{ fontSize: 12, color: HQ.inkDim }}>
            No data — the field is on the platform default everywhere and no talent has stored a value.
          </div>
        ) : (
          <div>
            {/* Column header */}
            <div
              style={{
                display: "flex",
                gap: 10,
                padding: "4px 10px 6px",
                fontSize: 10,
                fontWeight: 700,
                color: HQ.inkDim,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                borderBottom: `1px solid ${HQ.borderSoft}`,
              }}
            >
              <span style={{ flex: 1 }}>Workspace</span>
              <span style={{ minWidth: 56, textAlign: "right" }}>Talents</span>
              <span style={{ minWidth: 80, textAlign: "right" }}>Slug</span>
            </div>
            {detail.workspaces.map((w, i) => (
              <WorkspaceRow key={w.tenant_id} w={w} isFirst={i === 0} />
            ))}
          </div>
        )}
      </HqCard>
    </div>
  );
}
