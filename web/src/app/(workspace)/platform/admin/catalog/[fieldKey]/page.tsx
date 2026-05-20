// Phase 9A slice 4 — Platform HQ · Catalog · per-field detail (read-only).
// Server Component. Platform-admin gated by the (workspace)/platform/admin
// layout (super_admin). Zero mutation; aggregates over the canonical
// engine + a tenant join for workspace-name expansion.

import Link from "next/link";
import {
  loadPlatformCatalogFieldDetail,
  type FieldDetailField,
  type FieldDetailRisk,
  type FieldDetailWorkspace,
} from "../../../catalog-field-detail-data";

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
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderTop: isFirst ? "none" : `1px solid ${HQ.borderSoft}`,
        fontSize: 12.5,
        opacity: w.status === "active" ? 1 : 0.7,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontWeight: 600, color: HQ.ink }}>{w.name}</span>
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
          {w.status !== "active" && (
            <span style={{ fontSize: 9.5, fontWeight: 700, color: HQ.red }}>
              {w.status.toUpperCase()}
            </span>
          )}
        </div>
        <div style={{ fontSize: 10.5, color: HQ.inkMuted, marginTop: 2 }}>
          {summariseOverride(w)}
        </div>
      </div>
      <span
        style={{
          fontSize: 10.5,
          color: HQ.inkDim,
          fontFamily: "ui-monospace, monospace",
        }}
      >
        {w.slug}
      </span>
    </div>
  );
}

export default async function PlatformCatalogFieldDetailPage({
  params,
}: {
  params: Promise<{ fieldKey: string }>;
}) {
  const { fieldKey } = await params;
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

  return (
    <div style={{ fontFamily: F, color: HQ.ink, padding: 4 }}>
      {breadcrumb}

      <h1 style={{ fontFamily: FD, fontSize: 22, fontWeight: 600, marginBottom: 4 }}>
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
        subtitle={
          detail.workspaces.length === 0
            ? "No workspace has a per-field override row for this field."
            : `${detail.workspaces.length} workspace${detail.workspaces.length === 1 ? "" : "s"} with an override (each row = one workspace_profile_field_settings row)`
        }
      >
        {detail.workspaces.length === 0 ? (
          <div style={{ fontSize: 12, color: HQ.inkDim }}>
            No data — the field is on the platform default everywhere.
          </div>
        ) : (
          <div>
            {detail.workspaces.map((w, i) => (
              <WorkspaceRow key={w.tenant_id} w={w} isFirst={i === 0} />
            ))}
          </div>
        )}
      </HqCard>
    </div>
  );
}
