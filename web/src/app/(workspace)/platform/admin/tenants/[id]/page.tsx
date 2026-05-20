// Phase 3.11 — Platform HQ · Tenant detail
// Single tenant view: identity, members, roster, counts.
// Service-role access — no RLS gate (the platform layout enforces super_admin).

import Link from "next/link";
import { notFound } from "next/navigation";
import { loadPlatformTenantDetail } from "../../../platform-data";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ id: string }>;

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

const PLAN_COLORS: Record<string, { bg: string; color: string }> = {
  free:    { bg: "rgba(245,242,235,0.08)", color: "rgba(245,242,235,0.62)" },
  studio:  { bg: "rgba(155,168,183,0.15)", color: "#9BA8B7" },
  agency:  { bg: "rgba(93,211,160,0.12)",  color: "#5DD3A0" },
  network: { bg: "rgba(160,122,224,0.15)", color: "#A07AE0" },
};

function planChip(plan: string) {
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

function statusChip(status: string) {
  const map: Record<string, { color: string; label: string }> = {
    active:    { color: HQ.green, label: "Active" },
    suspended: { color: HQ.red,   label: "Suspended" },
    inactive:  { color: HQ.amber, label: "Inactive" },
    deleted:   { color: HQ.inkDim, label: "Deleted" },
  };
  const s = map[status] ?? { color: HQ.amber, label: status };
  return (
    <span className="inline-flex items-center gap-1.5">
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
      <span style={{ color: HQ.ink, fontSize: 12.5 }}>{s.label}</span>
    </span>
  );
}

function workflowChip(workflow: string | null) {
  if (!workflow) return <span style={{ color: HQ.inkDim, fontSize: 11 }}>—</span>;
  const map: Record<string, string> = {
    published: HQ.green,
    draft: HQ.amber,
    invited: HQ.purple,
    archived: HQ.inkDim,
  };
  const c = map[workflow] ?? HQ.inkDim;
  return (
    <span
      style={{
        display: "inline-flex",
        padding: "1px 7px",
        background: HQ.cardSoft,
        color: c,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        borderRadius: 999,
        fontFamily: F,
      }}
    >
      {workflow}
    </span>
  );
}

function roleChip(role: string) {
  const map: Record<string, string> = {
    owner:       HQ.green,
    admin:       HQ.purple,
    coordinator: "#7AB7E0",
    editor:      HQ.amber,
    viewer:      HQ.inkDim,
  };
  const c = map[role] ?? HQ.inkMuted;
  return (
    <span
      style={{
        display: "inline-flex",
        padding: "2px 7px",
        background: HQ.cardSoft,
        color: c,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        borderRadius: 999,
        fontFamily: F,
      }}
    >
      {role}
    </span>
  );
}

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
      }}
    >
      <div className="mb-2.5">
        <span
          style={{
            fontSize: 10.5,
            color: HQ.inkMuted,
            fontWeight: 600,
            letterSpacing: 1.2,
            textTransform: "uppercase",
          }}
        >
          {title}
        </span>
        {subtitle && (
          <p style={{ margin: "3px 0 0", fontSize: 12.5, color: HQ.inkMuted }}>
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function StatCard({
  label,
  value,
  caption,
  tone = "ink",
}: {
  label: string;
  value: React.ReactNode;
  caption?: string;
  tone?: "ink" | "green" | "amber" | "red" | "dim";
}) {
  const accent =
    tone === "green"
      ? HQ.green
      : tone === "amber"
      ? HQ.amber
      : tone === "red"
      ? HQ.red
      : tone === "dim"
      ? HQ.inkDim
      : HQ.ink;

  return (
    <div
      style={{
        background: HQ.card,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 12,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <span style={{ fontFamily: F, fontSize: 10.5, color: HQ.inkMuted, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase" as const }}>
        {label}
      </span>
      <span
        style={{
          fontFamily: FD,
          fontSize: 24,
          fontWeight: 500,
          letterSpacing: -0.4,
          color: accent,
          lineHeight: 1.05,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
      {caption && (
        <span style={{ fontFamily: F, fontSize: 11, color: HQ.inkMuted }}>
          {caption}
        </span>
      )}
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 0",
        borderTop: `1px solid ${HQ.borderSoft}`,
        fontFamily: F,
      }}
    >
      <span style={{ flex: 1, fontSize: 13, color: HQ.ink }}>{label}</span>
      <span style={{ fontSize: 13, color: HQ.inkMuted, textAlign: "right" }}>{value}</span>
    </div>
  );
}

export default async function PlatformTenantDetailPage({
  params,
}: {
  params: PageParams;
}) {
  const { id } = await params;
  const tenant = await loadPlatformTenantDetail(id);
  if (!tenant) notFound();

  return (
    <>
      {/* Page header */}
      <div className="mb-5">
        <Link
          href="/platform/admin/tenants"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            color: HQ.inkMuted,
            fontSize: 12,
            fontFamily: F,
            textDecoration: "none",
            marginBottom: 12,
          }}
        >
          ← All tenants
        </Link>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1
              style={{
                fontFamily: FD,
                fontSize: 26,
                fontWeight: 600,
                letterSpacing: -0.5,
                color: HQ.ink,
                margin: 0,
                lineHeight: 1.1,
              }}
            >
              {tenant.name}
            </h1>
            <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontFamily: FM, fontSize: 12, color: HQ.inkMuted }}>{tenant.slug}</span>
              <span style={{ color: HQ.inkDim, fontSize: 12 }}>·</span>
              <span style={{ color: HQ.inkMuted, fontSize: 12, textTransform: "capitalize" as const }}>{tenant.entityType}</span>
              <span style={{ color: HQ.inkDim, fontSize: 12 }}>·</span>
              {planChip(tenant.plan)}
              <span style={{ color: HQ.inkDim, fontSize: 12 }}>·</span>
              {statusChip(tenant.status)}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
            <Link
              href={`/platform/admin/tenants/${tenant.id}/catalog`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "7px 12px",
                borderRadius: 8,
                background: "rgba(93,211,160,0.08)",
                border: "1px solid rgba(93,211,160,0.25)",
                color: HQ.green,
                fontSize: 12.5,
                fontWeight: 500,
                fontFamily: F,
                textDecoration: "none",
              }}
            >
              Catalog →
            </Link>
            {tenant.primaryDomain && (
              <a
                href={`https://${tenant.primaryDomain}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "7px 12px",
                  borderRadius: 8,
                  background: HQ.cardSoft,
                  border: `1px solid ${HQ.borderSoft}`,
                  color: HQ.ink,
                  fontSize: 12.5,
                  fontWeight: 500,
                  fontFamily: F,
                  textDecoration: "none",
                }}
              >
                {tenant.primaryDomain} ↗
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Stat grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <StatCard label="Roster" value={tenant.talentCount} caption="active talent" tone="ink" />
        <StatCard label="Members" value={tenant.memberCount} caption="staff seats used" tone="ink" />
        <StatCard label="Inquiries" value={tenant.inquiryCount} caption="lifetime total" tone="ink" />
        <StatCard label="Bookings" value={tenant.bookingCount} caption="lifetime total" tone="ink" />
        <StatCard
          label="Domains"
          value={tenant.domainCount}
          caption="custom + reserved"
          tone={tenant.domainCount > 0 ? "ink" : "dim"}
        />
        <StatCard
          label="Seat limit"
          value={tenant.seats === null ? "∞" : tenant.seats}
          caption={tenant.seats !== null && tenant.talentCount >= tenant.seats ? "at capacity" : "available"}
          tone={tenant.seats !== null && tenant.talentCount >= tenant.seats ? "amber" : "ink"}
        />
      </div>

      {/* Two-col: members + recent talent */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <HqCard title={`Members (${tenant.members.length})`} subtitle="Staff with access to this workspace">
          {tenant.members.length === 0 ? (
            <div style={{ padding: "16px 0", color: HQ.inkMuted, fontSize: 13 }}>
              No active members.
            </div>
          ) : (
            tenant.members.map((m) => (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 0",
                  borderTop: `1px solid ${HQ.borderSoft}`,
                  fontFamily: F,
                }}
              >
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 13, color: HQ.ink, fontWeight: 500 }}>
                    {m.displayName}
                  </div>
                  <div
                    style={{
                      fontFamily: FM,
                      fontSize: 11,
                      color: HQ.inkMuted,
                      marginTop: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {m.email}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  {roleChip(m.role)}
                  {m.status !== "active" && (
                    <span
                      style={{
                        fontSize: 10,
                        color: HQ.amber,
                        textTransform: "uppercase" as const,
                        letterSpacing: 0.4,
                        fontFamily: F,
                      }}
                    >
                      {m.status}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </HqCard>

        <HqCard
          title={`Roster (${tenant.talent.length})`}
          subtitle={tenant.talentCount > tenant.talent.length ? `Showing ${tenant.talent.length} of ${tenant.talentCount}` : undefined}
        >
          {tenant.talent.length === 0 ? (
            <div style={{ padding: "16px 0", color: HQ.inkMuted, fontSize: 13 }}>
              No talent on roster.
            </div>
          ) : (
            tenant.talent.map((t) => (
              <div
                key={t.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 0",
                  borderTop: `1px solid ${HQ.borderSoft}`,
                  fontFamily: F,
                }}
              >
                <span
                  style={{
                    flex: 1,
                    fontSize: 13,
                    color: HQ.ink,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {t.displayName}
                </span>
                {workflowChip(t.workflowStatus)}
                <span style={{ fontSize: 11, color: HQ.inkDim }}>{t.createdAt}</span>
              </div>
            ))
          )}
        </HqCard>
      </div>

      {/* Settings ledger */}
      <HqCard title="Tenant configuration">
        <SettingRow
          label="Tenant ID"
          value={
            <code style={{ fontFamily: FM, fontSize: 11, color: HQ.inkMuted }}>{tenant.id}</code>
          }
        />
        <SettingRow
          label="Slug"
          value={
            <code style={{ fontFamily: FM, fontSize: 11, color: HQ.inkMuted }}>{tenant.slug}</code>
          }
        />
        <SettingRow label="Entity type" value={tenant.entityType} />
        <SettingRow label="Plan tier" value={planChip(tenant.plan)} />
        <SettingRow label="Status" value={statusChip(tenant.status)} />
        <SettingRow
          label="Talent seat limit"
          value={tenant.seats === null ? "Unlimited" : `${tenant.talentCount} / ${tenant.seats}`}
        />
        <SettingRow label="Custom domains" value={tenant.domainCount.toString()} />
        <SettingRow label="Created" value={tenant.createdAt} />
      </HqCard>
    </>
  );
}
