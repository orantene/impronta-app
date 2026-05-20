"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cancelPitchAction } from "@/app/(workspace)/[tenantSlug]/admin/pitches/actions";
import type { PitchStatus } from "@/lib/pitch/pitch-types";
import type { WorkspacePitchRow } from "../data-bridge";
import { PitchComposeDrawer } from "../pitch-compose";
import { Card, H3, PrimaryButton, StatusPill } from "../primitives";
import { COLORS, getClients, meetsRole, useAdminShell } from "../state";
import { PitchDetailDrawerInline } from "./PitchesPage-2";
import { PageHeader } from "./pages-shared";


/**
 * Thin wrapper kept for call-site clarity. Delegates to the primitive
 * StatusPill — capitalize=true matches the prior raw-status display.
 */
export function StatusBadge({
  tone,
  label,
}: {
  tone: "ink" | "amber" | "green" | "dim";
  label: string;
}) {
  return <StatusPill tone={tone} label={label} capitalize />;
}

// ════════════════════════════════════════════════════════════════════
// PITCHES — curated talent suggestions (history view)
// ════════════════════════════════════════════════════════════════════


export const PITCH_STATUS_TONE: Record<PitchStatus, { tone: "ink" | "amber" | "green" | "dim"; label: string }> = {
  draft:     { tone: "dim",   label: "Draft" },
  sent:      { tone: "ink",   label: "Sent" },
  viewed:    { tone: "ink",   label: "Viewed" },
  edited:    { tone: "amber", label: "Edited" },
  // Step-8: `approved` is the new middle step between viewed/edited
  // and converted — recipient said yes but hasn't submitted the inquiry
  // form yet. Green-tone since it's a positive recipient signal.
  approved:  { tone: "green", label: "Approved" },
  converted: { tone: "green", label: "Converted" },
  declined:  { tone: "dim",   label: "Declined" },
  cancelled: { tone: "dim",   label: "Cancelled" },
  expired:   { tone: "dim",   label: "Expired" },
};

// `approved` counts as still-active for admin "in flight" filters —
// the pitch hasn't terminated; recipient might still convert.
export const PITCH_ACTIVE: ReadonlyArray<PitchStatus> = ["draft", "sent", "viewed", "edited", "approved"];

export function fmtPitchDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat("en-GB", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) }).format(d);
}

function fmtPitchRelative(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return fmtPitchDate(iso);
}

export function PitchesPage() {
  const { state, effectivePitches, effectiveRoster, tenantSlug, toast, effectiveTenant } = useAdminShell();
  const router = useRouter();
  const canEdit = meetsRole(state.role, "coordinator");
  const [openDetailId, setOpenDetailId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  const counts = effectivePitches.reduce(
    (acc, p) => {
      acc.total++;
      if (PITCH_ACTIVE.includes(p.status)) acc.active++;
      if (p.status === "converted") acc.converted++;
      if (p.status === "declined" || p.status === "cancelled" || p.status === "expired") acc.closed++;
      return acc;
    },
    { total: 0, active: 0, converted: 0, closed: 0 },
  );

  return (
    <>
      <PageHeader
        title="Pitches"
        subtitle={
          counts.total === 0
            ? "Curated talent suggestions you've sent to clients."
            : `${counts.total} sent · ${counts.active} active · ${counts.converted} converted into bookings`
        }
        actions={
          canEdit ? (
            <PrimaryButton size="sm" onClick={() => setComposeOpen(true)}>
              + New pitch
            </PrimaryButton>
          ) : null
        }
      />

      {effectivePitches.length === 0 ? (
        <Card>
          <div style={{ padding: "44px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📨</div>
            <H3>No pitches yet</H3>
            <p style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.5, maxWidth: 380, marginInline: "auto" }} className="text-admin-ink-muted">
              Curate a talent suggestion, attach a brief, and send a mobile-friendly
              link your client can review and convert into a booking inquiry.
            </p>
            {canEdit ? (
              <div style={{ marginTop: 18, display: "inline-flex", gap: 8 }}>
                <PrimaryButton size="sm" onClick={() => setComposeOpen(true)}>
                  + Compose your first pitch
                </PrimaryButton>
              </div>
            ) : null}
          </div>
        </Card>
      ) : (
        <>
          {/* Stat strip */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 10,
              marginBottom: 16,
            }}
          >
            <StatTile label="Active"     value={counts.active} />
            <StatTile label="Converted"  value={counts.converted} accent />
            <StatTile label="Closed"     value={counts.closed} />
            <StatTile label="Total"      value={counts.total} />
          </div>

          {/* List */}
          <Card>
            <div role="table" style={{ width: "100%" }}>
              <div
                role="row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(220px, 2fr) 110px 90px 110px 110px 90px",
                  gap: 12,
                  alignItems: "center",
                  padding: "10px 16px",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  color: COLORS.inkMuted,
                  borderBottom: `1px solid ${COLORS.borderSoft}`,
                  background: COLORS.fill,
                }}
              >
                <div>Recipient</div>
                <div>Status</div>
                <div>Talents</div>
                <div>Sent</div>
                <div>Last view</div>
                <div className="text-right">Action</div>
              </div>
              {effectivePitches.map((p, idx) => (
                <PitchRow
                  key={p.id}
                  row={p}
                  isLast={idx === effectivePitches.length - 1}
                  onOpen={() => setOpenDetailId(p.id)}
                  tenantSlug={tenantSlug ?? "impronta"}
                  canEdit={canEdit}
                  onCancelled={() => {
                    toast("Pitch cancelled. Share link revoked.");
                    router.refresh();
                  }}
                />
              ))}
            </div>
          </Card>
        </>
      )}

      {openDetailId ? (
        <PitchDetailDrawerInline
          tenantSlug={tenantSlug ?? "impronta"}
          pitchId={openDetailId}
          onClose={() => setOpenDetailId(null)}
          onCancelled={() => {
            toast("Pitch cancelled. Share link revoked.");
            router.refresh();
          }}
        />
      ) : null}

      {composeOpen ? (
        <PitchComposeDrawer
          open={composeOpen}
          onOpenChange={setComposeOpen}
          selectedTalents={effectiveRoster.slice(0, 0)}
          clients={getClients(state.plan)}
          tenantSlug={tenantSlug ?? "impronta"}
          agencyName={effectiveTenant.name}
          onPitchSent={() => {
            toast("Pitch sent!");
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

function StatTile({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div
      style={{
        background: accent ? "rgba(15,79,62,0.06)" : "#fff",
        border: `1px solid ${accent ? "rgba(15,79,62,0.18)" : COLORS.borderSoft}`,
        borderRadius: 10,
        padding: "10px 12px",
      }}
    >
      <div style={{ fontSize: 10, letterSpacing: 0.5, fontWeight: 600, textTransform: "uppercase" }} className="text-admin-ink-muted">
        {label}
      </div>
      <div style={{ marginTop: 2, fontSize: 22, fontWeight: 700, color: accent ? "#0F4F3E" : COLORS.ink, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}

function PitchRow({
  row,
  isLast,
  onOpen,
  tenantSlug,
  canEdit,
  onCancelled,
}: {
  row: WorkspacePitchRow;
  isLast: boolean;
  onOpen: () => void;
  tenantSlug: string;
  canEdit: boolean;
  onCancelled: () => void;
}) {
  const palette = PITCH_STATUS_TONE[row.status];
  const sentLabel = row.sentAt ? fmtPitchDate(row.sentAt) : row.status === "draft" ? "—" : fmtPitchDate(row.createdAt);
  const lastViewLabel = row.lastViewedAt
    ? `${fmtPitchRelative(row.lastViewedAt)}${row.viewCount > 1 ? ` · ${row.viewCount}×` : ""}`
    : row.status === "sent"
      ? "Not yet"
      : "—";
  const isActive = PITCH_ACTIVE.includes(row.status);

  return (
    <div
      role="row"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      tabIndex={0}
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(220px, 2fr) 110px 90px 110px 110px 90px",
        gap: 12,
        alignItems: "center",
        padding: "12px 16px",
        fontSize: 13,
        color: COLORS.ink,
        borderBottom: isLast ? "none" : `1px solid ${COLORS.borderSoft}`,
        cursor: "pointer",
        outline: "none",
      }}
    >
      <div className="min-w-0">
        <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {row.recipientName}
        </div>
        {row.recipientCompany ? (
          <div style={{ fontSize: 12, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} className="text-admin-ink-muted">
            {row.recipientCompany}
          </div>
        ) : null}
      </div>
      <div>
        <StatusPill tone={palette.tone} label={palette.label} capitalize />
      </div>
      <div style={{ fontVariantNumeric: "tabular-nums" }} className="text-admin-ink-muted">
        {row.talentCount}
        {row.removedCount > 0 ? (
          <span style={{ fontSize: 12, marginLeft: 4 }} title="Removed by client">
            (−{row.removedCount})
          </span>
        ) : null}
      </div>
      <div style={{ color: COLORS.inkMuted, fontVariantNumeric: "tabular-nums" }} className="text-admin-ink-dim">{sentLabel}</div>
      <div style={{ fontVariantNumeric: "tabular-nums" }} className="text-admin-ink-muted">{lastViewLabel}</div>
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
        {row.convertedInquiryId ? (
          <Link
            href={`/${tenantSlug}/admin/work/${row.convertedInquiryId}`}
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              color: "#0F4F3E",
              textDecoration: "none",
              padding: "5px 9px",
              borderRadius: 6,
              border: "1px solid rgba(15,79,62,0.18)",
              background: "rgba(15,79,62,0.06)",
            }}
          >
            Inquiry →
          </Link>
        ) : isActive && canEdit ? (
          <PitchRowCancel tenantSlug={tenantSlug} pitchId={row.id} onCancelled={onCancelled} />
        ) : null}
      </div>
    </div>
  );
}

function PitchRowCancel({
  tenantSlug,
  pitchId,
  onCancelled,
}: {
  tenantSlug: string;
  pitchId: string;
  onCancelled: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  if (confirming) {
    return (
      <div style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
        <button
          type="button"
          onClick={async () => {
            setPending(true);
            const r = await cancelPitchAction(tenantSlug, pitchId);
            setPending(false);
            if (r.ok) {
              setConfirming(false);
              onCancelled();
            }
          }}
          disabled={pending}
          style={{
            border: "none",
            background: "#b91c1c",
            color: "#fff",
            fontSize: 11,
            fontWeight: 600,
            padding: "5px 9px",
            borderRadius: 6,
            cursor: pending ? "default" : "pointer",
            opacity: pending ? 0.6 : 1,
          }}
        >
          {pending ? "…" : "Yes, cancel"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          style={{
            border: `1px solid ${COLORS.borderSoft}`,
            background: "#fff",
            color: COLORS.inkMuted,
            fontSize: 11,
            fontWeight: 600,
            padding: "5px 9px",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          No
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      style={{
        border: `1px solid ${COLORS.borderSoft}`,
        background: "#fff",
        color: COLORS.inkMuted,
        fontSize: 11.5,
        fontWeight: 600,
        padding: "5px 9px",
        borderRadius: 6,
        cursor: "pointer",
      }}
    >
      Cancel
    </button>
  );
}
