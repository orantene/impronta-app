/**
 * Phase E — Pitch history (admin).
 *
 * Server Component. Lists every pitch this tenant has created — drafts,
 * sent, viewed, edited, converted, declined, expired, cancelled. Status
 * chips convey state at a glance; actions inline (cancel for active, link
 * to converted inquiry).
 *
 * Capability: agency.pitch.manage. Renders as a real server-rendered page
 * (children content wins; the prototype shell's PageRouter has no
 * "pitches" case so it stays empty for this surface).
 */

import { notFound } from "next/navigation";
import Link from "next/link";

import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { PitchRow, PitchStatus } from "@/lib/pitch/pitch-types";

import { PitchRowActions } from "./_pitch-row-actions";
import { PitchListShell } from "./_pitch-list-shell";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

// ─── Design tokens (mirrors bookings/page.tsx) ─────────────────────────────

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  cardBg:     "#ffffff",
  surface:    "rgba(11,11,13,0.02)",
  accent:     "#0F4F3E",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

// Status chip palette — neutral by default, semantic for terminal states.
const STATUS_PALETTE: Record<PitchStatus, { bg: string; fg: string; label: string }> = {
  draft:     { bg: "rgba(11,11,13,0.04)",   fg: C.inkMuted, label: "Draft" },
  sent:      { bg: "rgba(15,79,62,0.08)",   fg: C.accent,   label: "Sent" },
  viewed:    { bg: "rgba(15,79,62,0.14)",   fg: C.accent,   label: "Viewed" },
  edited:    { bg: "rgba(202,138,4,0.12)",  fg: "#a16207",  label: "Edited" },
  converted: { bg: "rgba(46,125,91,0.16)",  fg: "#1f6c47",  label: "Converted" },
  declined:  { bg: "rgba(11,11,13,0.06)",   fg: C.inkMuted, label: "Declined" },
  cancelled: { bg: "rgba(11,11,13,0.06)",   fg: C.inkMuted, label: "Cancelled" },
  expired:   { bg: "rgba(11,11,13,0.06)",   fg: C.inkMuted, label: "Expired" },
};

const ACTIVE_STATUSES = new Set<PitchStatus>(["draft", "sent", "viewed", "edited"]);

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(d);
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(iso);
}

// ─── Row type ──────────────────────────────────────────────────────────────

type PitchListRow = {
  id: string;
  status: PitchStatus;
  recipientLabel: string;
  recipientSubLabel: string | null;
  talentCount: number;
  removedCount: number;
  sentAt: string | null;
  createdAt: string;
  lastViewedAt: string | null;
  viewCount: number;
  expiresAt: string | null;
  convertedInquiryId: string | null;
};

// ─── Page ──────────────────────────────────────────────────────────────────

export default async function WorkspacePitchesPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const canManage = await userHasCapability("agency.pitch.manage", scope.tenantId);
  if (!canManage) notFound();

  const admin = createServiceRoleClient();
  if (!admin) {
    return <PageError message="Server configuration error." />;
  }

  // Load all pitches for this tenant (most recent first). Cap at 200 to keep
  // first-paint snappy; pagination can come in a polish pass.
  const { data: pitchRows, error: pitchErr } = await admin
    .from("pitches")
    .select("*")
    .eq("tenant_id", scope.tenantId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (pitchErr) {
    console.error("[admin/pitches] load failed:", pitchErr);
    return <PageError message={`Could not load pitches: ${pitchErr.message ?? "unknown error"}`} />;
  }

  const pitches = (pitchRows ?? []) as PitchRow[];

  // Aggregate talent counts — both active (not removed by client) and total.
  const pitchIds = pitches.map((p) => p.id);
  const { data: talentRows } = pitchIds.length
    ? await admin
        .from("pitch_talents")
        .select("pitch_id, removed_by_client_at")
        .in("pitch_id", pitchIds)
    : { data: [] };

  const talentCounts = new Map<string, { active: number; removed: number }>();
  for (const row of (talentRows ?? []) as Array<{
    pitch_id: string;
    removed_by_client_at: string | null;
  }>) {
    const cur = talentCounts.get(row.pitch_id) ?? { active: 0, removed: 0 };
    if (row.removed_by_client_at) cur.removed++;
    else cur.active++;
    talentCounts.set(row.pitch_id, cur);
  }

  const rows: PitchListRow[] = pitches.map((p) => {
    const counts = talentCounts.get(p.id) ?? { active: 0, removed: 0 };
    const recipient = p.recipient_contact ?? {};
    const name =
      (typeof recipient.name === "string" && recipient.name.trim()) ||
      (typeof recipient.email === "string" && recipient.email.trim()) ||
      (typeof recipient.phone === "string" && recipient.phone.trim()) ||
      "Unaddressed";
    const company =
      typeof recipient.company === "string" && recipient.company.trim()
        ? recipient.company.trim()
        : null;
    return {
      id: p.id,
      status: p.status,
      recipientLabel: name,
      recipientSubLabel: company,
      talentCount: counts.active,
      removedCount: counts.removed,
      sentAt: p.sent_at,
      createdAt: p.created_at,
      lastViewedAt: p.last_viewed_at,
      viewCount: p.view_count,
      expiresAt: p.expires_at,
      convertedInquiryId: p.converted_inquiry_id,
    };
  });

  // Aggregate counts by status for the strip.
  const counts = rows.reduce(
    (acc, r) => {
      acc.total++;
      if (ACTIVE_STATUSES.has(r.status)) acc.active++;
      if (r.status === "converted") acc.converted++;
      if (r.status === "declined") acc.declined++;
      return acc;
    },
    { total: 0, active: 0, converted: 0, declined: 0 },
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, fontFamily: FONT, padding: "32px 28px 96px" }}>
      {/* ── Header row ── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: 0.7,
              textTransform: "uppercase",
              color: C.accent,
              marginBottom: 4,
            }}
          >
            {scope.membership.display_name}
          </div>
          <h1
            style={{
              fontFamily: FONT,
              fontSize: 26,
              fontWeight: 700,
              color: C.ink,
              margin: 0,
              lineHeight: 1.1,
              display: "flex",
              alignItems: "baseline",
              gap: 8,
            }}
          >
            Pitches
            <span
              style={{
                fontSize: 16,
                fontWeight: 400,
                color: C.inkDim,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {counts.total}
            </span>
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: C.inkMuted }}>
            Curated talent suggestions you've sent to clients. Each opens a
            mobile-friendly link they can review, narrow down, and convert
            into an inquiry.
          </p>
        </div>

        <Link
          href={`/${tenantSlug}/admin/roster`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: 34,
            padding: "0 14px",
            borderRadius: 8,
            background: C.cardBg,
            border: `1px solid ${C.border}`,
            color: C.ink,
            fontSize: 12.5,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          + New pitch from roster
        </Link>
      </div>

      {/* ── Stat strip ── */}
      {counts.total > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 12,
          }}
        >
          <StatCell label="Active"     value={counts.active} />
          <StatCell label="Converted"  value={counts.converted} tone={C.accent} />
          <StatCell label="Declined"   value={counts.declined} />
          <StatCell label="Total sent" value={counts.total} />
        </div>
      )}

      {/* ── List ── */}
      {rows.length === 0 ? (
        <EmptyState tenantSlug={tenantSlug} />
      ) : (
        <PitchListShell tenantSlug={tenantSlug}>
          <div
            style={{
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              overflow: "hidden",
              background: C.cardBg,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(220px, 2fr) 110px 110px 130px 130px 200px",
                gap: 12,
                alignItems: "center",
                padding: "12px 18px",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                color: C.inkDim,
                borderBottom: `1px solid ${C.borderSoft}`,
                background: C.surface,
              }}
            >
              <div>Recipient</div>
              <div>Status</div>
              <div>Talents</div>
              <div>Sent</div>
              <div>Last view</div>
              <div style={{ textAlign: "right" }}>Actions</div>
            </div>
            {rows.map((r, idx) => (
              <PitchListItem
                key={r.id}
                row={r}
                tenantSlug={tenantSlug}
                isLast={idx === rows.length - 1}
              />
            ))}
          </div>
        </PitchListShell>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function PitchListItem({
  row,
  tenantSlug,
  isLast,
}: {
  row: PitchListRow;
  tenantSlug: string;
  isLast: boolean;
}) {
  const palette = STATUS_PALETTE[row.status];
  const sentLabel = row.sentAt
    ? fmtDate(row.sentAt)
    : row.status === "draft"
      ? "—"
      : fmtDate(row.createdAt);
  const lastViewLabel = row.lastViewedAt
    ? `${fmtRelative(row.lastViewedAt)}${row.viewCount > 1 ? ` · ${row.viewCount}×` : ""}`
    : row.status === "sent"
      ? "Not yet"
      : "—";

  return (
    <div
      data-pitch-row-id={row.id}
      role="button"
      tabIndex={0}
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(220px, 2fr) 110px 110px 130px 130px 200px",
        gap: 12,
        alignItems: "center",
        padding: "14px 18px",
        fontSize: 13,
        color: C.ink,
        borderBottom: isLast ? "none" : `1px solid ${C.borderSoft}`,
        cursor: "pointer",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontWeight: 600,
            color: C.ink,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={row.recipientLabel}
        >
          {row.recipientLabel}
        </div>
        {row.recipientSubLabel && (
          <div
            style={{
              fontSize: 12,
              color: C.inkMuted,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              marginTop: 2,
            }}
          >
            {row.recipientSubLabel}
          </div>
        )}
      </div>

      <div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "3px 10px",
            borderRadius: 999,
            background: palette.bg,
            color: palette.fg,
            fontSize: 11.5,
            fontWeight: 600,
            letterSpacing: 0.2,
          }}
        >
          {palette.label}
        </span>
      </div>

      <div style={{ color: C.inkMuted, fontVariantNumeric: "tabular-nums" }}>
        {row.talentCount}
        {row.removedCount > 0 && (
          <span title="Removed by client" style={{ color: C.inkDim, fontSize: 12, marginLeft: 4 }}>
            (−{row.removedCount})
          </span>
        )}
      </div>

      <div style={{ color: C.inkMuted, fontVariantNumeric: "tabular-nums" }}>{sentLabel}</div>

      <div style={{ color: C.inkMuted, fontVariantNumeric: "tabular-nums" }}>{lastViewLabel}</div>

      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
        {row.convertedInquiryId && (
          <Link
            href={`/${tenantSlug}/admin/work/${row.convertedInquiryId}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 28,
              padding: "0 10px",
              borderRadius: 6,
              background: C.cardBg,
              border: `1px solid ${C.border}`,
              color: C.accent,
              fontSize: 12,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            View inquiry →
          </Link>
        )}
        <PitchRowActions
          tenantSlug={tenantSlug}
          pitchId={row.id}
          status={row.status}
          isCancellable={ACTIVE_STATUSES.has(row.status)}
        />
      </div>
    </div>
  );
}

function StatCell({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div
      style={{
        background: C.cardBg,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: "12px 14px",
      }}
    >
      <div style={{ fontSize: 11, color: C.inkDim, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: tone ?? C.ink,
          marginTop: 4,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function EmptyState({ tenantSlug }: { tenantSlug: string }) {
  return (
    <div
      style={{
        border: `1px dashed ${C.border}`,
        borderRadius: 12,
        padding: "60px 24px",
        textAlign: "center",
        background: C.cardBg,
      }}
    >
      <div style={{ fontSize: 26, marginBottom: 8 }}>📨</div>
      <h2 style={{ fontSize: 16, fontWeight: 600, color: C.ink, margin: 0 }}>No pitches yet</h2>
      <p style={{ fontSize: 13, color: C.inkMuted, margin: "8px auto 0", maxWidth: 380, lineHeight: 1.5 }}>
        Select talents from your roster and choose <strong>Send as pitch…</strong> from the bulk
        actions menu to share a curated, mobile-friendly link with a client.
      </p>
      <Link
        href={`/${tenantSlug}/admin/roster`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          height: 34,
          padding: "0 16px",
          marginTop: 18,
          borderRadius: 8,
          background: C.ink,
          color: "#fff",
          fontSize: 13,
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        Open roster →
      </Link>
    </div>
  );
}

function PageError({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: "60px 24px",
        textAlign: "center",
        fontFamily: FONT,
        color: C.inkMuted,
      }}
    >
      <p>{message}</p>
    </div>
  );
}
