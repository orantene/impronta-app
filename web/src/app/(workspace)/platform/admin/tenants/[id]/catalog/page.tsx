// Phase 9A slice 7 — Platform HQ · Tenant Catalog Posture
// Read-only inspection of a single tenant's field-engine posture:
// which fields they've overridden, which fields their talents fill in,
// and config risks specific to their setup. Server component, zero
// mutation. HQ dark theme (mirrors /platform/admin/catalog).

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  loadTenantCatalogPosture,
  type TenantFieldOverride,
  type TenantFieldAdoption,
  type TenantCatalogRisk,
} from "../../../../tenant-catalog-data";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ id: string }>;

// ─── Design tokens (mirror /platform/admin/catalog/page.tsx) ─────────────────

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
  purple: "#A07AE0",
} as const;

const F = '"Inter", system-ui, sans-serif';
const FD = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';
const FM = '"JetBrains Mono", "Fira Code", ui-monospace, monospace';

// ─── Shared sub-components ────────────────────────────────────────────────────

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

function VisChip({ v }: { v: "public" | "admin" | "hidden" }) {
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

const PLAN_COLORS: Record<string, { bg: string; color: string }> = {
  free:    { bg: "rgba(245,242,235,0.08)", color: "rgba(245,242,235,0.62)" },
  studio:  { bg: "rgba(155,168,183,0.15)", color: "#9BA8B7" },
  agency:  { bg: "rgba(93,211,160,0.12)",  color: "#5DD3A0" },
  network: { bg: "rgba(160,122,224,0.15)", color: "#A07AE0" },
};

function PlanChip({ plan }: { plan: string }) {
  const c = PLAN_COLORS[plan] ?? PLAN_COLORS.free;
  return (
    <span
      style={{
        display: "inline-flex",
        padding: "3px 9px",
        background: c.bg,
        color: c.color,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        borderRadius: 999,
        fontFamily: F,
      }}
    >
      {plan}
    </span>
  );
}

const RISK_TONE: Record<TenantCatalogRisk["kind"], string> = {
  "deprecated-field-overridden": HQ.amber,
  "deprecated-field-has-values": HQ.amber,
  "admin-field-made-public": HQ.red,
  "sensitive-field-made-public": HQ.red,
  "field-disabled-but-has-values": HQ.amber,
};

// ─── Override card ────────────────────────────────────────────────────────────

function OverrideRow({ ov }: { ov: TenantFieldOverride }) {
  const dim = ov.deprecated || ov.enabled_override === false;
  const visChanged = ov.effectiveVisibility !== ov.platformVisibility;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "8px 10px",
        borderTop: `1px solid ${HQ.borderSoft}`,
        fontSize: 12.5,
        opacity: dim ? 0.55 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <Link
            href={`/platform/admin/catalog/${encodeURIComponent(ov.field_key)}`}
            style={{ fontWeight: 600, color: HQ.ink, textDecoration: "none" }}
            title="Open platform field detail"
          >
            {ov.custom_label ? (
              <>
                <span style={{ color: HQ.green }}>{ov.custom_label}</span>
                <span style={{ color: HQ.inkMuted, fontSize: 11, marginLeft: 4 }}>
                  ({ov.label})
                </span>
              </>
            ) : (
              ov.label
            )}
          </Link>
          {ov.deprecated && (
            <span style={{ fontSize: 9.5, fontWeight: 700, color: HQ.red }}>DEPRECATED</span>
          )}
          {ov.enabled_override === false && (
            <span style={{ fontSize: 9.5, fontWeight: 700, color: HQ.amber }}>DISABLED</span>
          )}
          {ov.required_override === true && (
            <span style={{ fontSize: 9.5, fontWeight: 700, color: HQ.amber }}>REQUIRED</span>
          )}
        </div>
        <div
          style={{
            fontSize: 10.5,
            color: HQ.inkMuted,
            fontFamily: FM,
            marginTop: 2,
          }}
        >
          {ov.field_key} · {ov.tier}
        </div>
        {ov.custom_helper && (
          <div style={{ fontSize: 11, color: HQ.inkDim, marginTop: 3, fontStyle: "italic" }}>
            helper: {ov.custom_helper}
          </div>
        )}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 4,
          flexShrink: 0,
        }}
      >
        {visChanged ? (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <VisChip v={ov.platformVisibility} />
            <span style={{ color: HQ.inkDim, fontSize: 11 }}>→</span>
            <VisChip v={ov.effectiveVisibility} />
          </div>
        ) : (
          <VisChip v={ov.platformVisibility} />
        )}
      </div>
    </div>
  );
}

// ─── Adoption row ─────────────────────────────────────────────────────────────

function AdoptionRow({
  a,
  totalTalents,
}: {
  a: TenantFieldAdoption;
  totalTalents: number;
}) {
  const pct = totalTalents > 0 ? Math.round((a.talentCount / totalTalents) * 100) : 0;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "7px 10px",
        borderTop: `1px solid ${HQ.borderSoft}`,
        fontSize: 12.5,
        opacity: a.deprecated ? 0.55 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Link
            href={`/platform/admin/catalog/${encodeURIComponent(a.field_key)}`}
            style={{ fontWeight: 600, color: HQ.ink, textDecoration: "none" }}
            title="Open platform field detail"
          >
            {a.label}
          </Link>
          {a.deprecated && (
            <span style={{ fontSize: 9.5, fontWeight: 700, color: HQ.red }}>DEPRECATED</span>
          )}
        </div>
        <div style={{ fontSize: 10.5, color: HQ.inkMuted, fontFamily: FM, marginTop: 1 }}>
          {a.field_key} · {a.tier}
        </div>
      </div>
      <VisChip v={a.platformVisibility} />
      {/* Adoption bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          minWidth: 120,
          justifyContent: "flex-end",
        }}
      >
        <div
          style={{
            width: 60,
            height: 5,
            background: HQ.borderSoft,
            borderRadius: 999,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: pct > 80 ? HQ.green : pct > 40 ? HQ.amber : HQ.inkMuted,
              borderRadius: 999,
            }}
          />
        </div>
        <span
          style={{
            fontSize: 11,
            color: HQ.inkMuted,
            minWidth: 48,
            textAlign: "right",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {a.talentCount}/{totalTalents}
        </span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function TenantCatalogPage({ params }: { params: PageParams }) {
  const { id } = await params;
  const posture = await loadTenantCatalogPosture(id);

  if (!posture.ok || !posture.header) {
    notFound();
  }

  const h = posture.header;

  return (
    <div style={{ fontFamily: F, color: HQ.ink, padding: 4 }}>
      {/* Breadcrumbs */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 16,
          fontSize: 12,
          color: HQ.inkMuted,
        }}
      >
        <Link
          href="/platform/admin/tenants"
          style={{ color: HQ.inkMuted, textDecoration: "none" }}
        >
          All tenants
        </Link>
        <span style={{ color: HQ.inkDim }}>›</span>
        <Link
          href={`/platform/admin/tenants/${id}`}
          style={{ color: HQ.inkMuted, textDecoration: "none" }}
        >
          {h.name}
        </Link>
        <span style={{ color: HQ.inkDim }}>›</span>
        <span style={{ color: HQ.ink }}>Catalog</span>
      </div>

      {/* Page title */}
      <h1
        style={{
          fontFamily: FD,
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: -0.4,
          color: HQ.ink,
          margin: "0 0 4px",
        }}
      >
        Catalog Posture
      </h1>
      <div style={{ fontSize: 12.5, color: HQ.inkMuted, marginBottom: 20 }}>
        Read-only inspection of field-engine configuration for this workspace.
        To curate this workspace&rsquo;s talent registration wizard (which fields
        show, are required, and in what order), open{" "}
        <Link
          href={`/platform/admin/tenants/${id}/registration-fields`}
          style={{ color: HQ.green, textDecoration: "none" }}
        >
          Registration fields
        </Link>
        . Cross-links go to the platform-wide{" "}
        <Link
          href="/platform/admin/catalog"
          style={{ color: HQ.green, textDecoration: "none" }}
        >
          Catalog Map
        </Link>
        .
      </div>

      {/* Tenant header */}
      <HqCard title="Workspace" subtitle="Identity + plan">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          <span style={{ fontFamily: FD, fontSize: 18, fontWeight: 600, color: HQ.ink }}>
            {h.name}
          </span>
          <span style={{ fontFamily: FM, fontSize: 12, color: HQ.inkMuted }}>{h.slug}</span>
          <span style={{ color: HQ.inkDim }}>·</span>
          <span style={{ fontSize: 12, color: HQ.inkMuted, textTransform: "capitalize" }}>
            {h.entityType}
          </span>
          <span style={{ color: HQ.inkDim }}>·</span>
          <PlanChip plan={h.plan} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <Stat label="Overridden fields" value={posture.fieldOverrides.length} />
          <Stat label="Group overrides" value={posture.groupOverrides.length} />
          <Stat label="Active talents" value={h.totalTalents} />
          <Stat
            label="Fields w/ values"
            value={posture.valueAdoption.length}
            tone={posture.valueAdoption.length > 0 ? HQ.green : undefined}
          />
          <Stat
            label="Risks"
            value={posture.risks.length}
            tone={posture.risks.length > 0 ? HQ.red : HQ.green}
          />
        </div>
      </HqCard>

      {/* Risk warnings */}
      {posture.risks.length > 0 && (
        <HqCard
          title={`Risk warnings (${posture.risks.length})`}
          subtitle="Read-only diagnostics specific to this workspace — never auto-acted."
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {posture.risks.map((r, i) => (
              <div
                key={`${r.kind}-${r.field_key}-${i}`}
                style={{
                  display: "flex",
                  gap: 8,
                  fontSize: 12,
                  padding: "6px 8px",
                  background: HQ.cardSoft,
                  borderRadius: 8,
                  alignItems: "flex-start",
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: RISK_TONE[r.kind],
                    minWidth: 200,
                    paddingTop: 1,
                  }}
                >
                  {r.kind}
                </span>
                <Link
                  href={`/platform/admin/catalog/${encodeURIComponent(r.field_key)}`}
                  style={{
                    color: HQ.ink,
                    fontFamily: FM,
                    fontSize: 11,
                    textDecoration: "none",
                    minWidth: 120,
                  }}
                  title="Open platform field detail"
                >
                  {r.field_key}
                </Link>
                <span style={{ color: HQ.inkMuted, fontSize: 11 }}>{r.detail}</span>
              </div>
            ))}
          </div>
        </HqCard>
      )}

      {/* Field overrides */}
      <HqCard
        title={`Field overrides (${posture.fieldOverrides.length})`}
        subtitle={
          posture.fieldOverrides.length === 0
            ? "This workspace has not overridden any fields."
            : "Fields where this workspace diverges from platform defaults. Visibility arrows show platform → effective."
        }
      >
        {posture.fieldOverrides.length === 0 ? (
          <div style={{ fontSize: 13, color: HQ.inkDim, padding: "8px 0" }}>
            No field overrides found. All fields inherit platform defaults.
          </div>
        ) : (
          <div>
            {posture.fieldOverrides.map((ov) => (
              <OverrideRow key={ov.field_definition_id} ov={ov} />
            ))}
          </div>
        )}
      </HqCard>

      {/* Group overrides */}
      {posture.groupOverrides.length > 0 && (
        <HqCard
          title={`Group overrides (${posture.groupOverrides.length})`}
          subtitle="Field groups this workspace has relabeled or toggled."
        >
          <div>
            {posture.groupOverrides.map((g) => (
              <div
                key={g.field_group_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 10px",
                  borderTop: `1px solid ${HQ.borderSoft}`,
                  fontSize: 12.5,
                  opacity: g.is_enabled === false ? 0.55 : 1,
                }}
              >
                <div style={{ flex: 1 }}>
                  {g.custom_label ? (
                    <>
                      <span style={{ color: HQ.green, fontWeight: 600 }}>{g.custom_label}</span>
                      <span style={{ color: HQ.inkMuted, fontSize: 11, marginLeft: 6 }}>
                        ({g.group_name})
                      </span>
                    </>
                  ) : (
                    <span style={{ color: HQ.ink, fontWeight: 600 }}>{g.group_name}</span>
                  )}
                </div>
                {g.is_enabled === false && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: HQ.amber }}>DISABLED</span>
                )}
              </div>
            ))}
          </div>
        </HqCard>
      )}

      {/* Value adoption */}
      <HqCard
        title={`Value adoption (${posture.valueAdoption.length} fields)`}
        subtitle={
          h.totalTalents === 0
            ? "No active talents on roster — no adoption data."
            : `Fields where this workspace's talents have live values. Sorted by talent count. ${h.totalTalents} active talent(s) total.`
        }
      >
        {posture.valueAdoption.length === 0 ? (
          <div style={{ fontSize: 13, color: HQ.inkDim, padding: "8px 0" }}>
            {h.totalTalents === 0
              ? "No active talents on this workspace's roster."
              : "No live field values found for any talent on this roster."}
          </div>
        ) : (
          <div>
            {posture.valueAdoption.map((a) => (
              <AdoptionRow key={a.field_definition_id} a={a} totalTalents={h.totalTalents} />
            ))}
          </div>
        )}
      </HqCard>
    </div>
  );
}
