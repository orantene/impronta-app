"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { interpolate } from "@/i18n/interpolate";
import { useT } from "@/i18n/use-t";
import { cancelPitchAction } from "@/app/(workspace)/[tenantSlug]/admin/pitches/actions";
import type { PitchStatus } from "@/lib/pitch/pitch-types";
import type { WorkspacePitchRow } from "../data-bridge";
import { useDashboardText } from "../dashboard-i18n";
import { PitchComposeDrawer } from "../pitch-compose";
import { Card, GhostButton, H3, PrimaryButton, StatusPill } from "../primitives";
import { COLORS, meetsRole, useAdminShell } from "../state";
import { downloadCsv } from "../wave2";
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

// i18n sibling of PITCH_STATUS_TONE (additive enum-label pattern): maps each
// status to its catalog key so localized consumers render t(PITCH_STATUS_LABEL_KEYS[status]).
// The English `label` above stays for any non-localized consumer.
export const PITCH_STATUS_LABEL_KEYS: Record<PitchStatus, string> = {
  draft:     "dashboard.adminPitches.statusDraft",
  sent:      "dashboard.adminPitches.statusSent",
  viewed:    "dashboard.adminPitches.statusViewed",
  edited:    "dashboard.adminPitches.statusEdited",
  approved:  "dashboard.adminPitches.statusApproved",
  converted: "dashboard.adminPitches.statusConverted",
  declined:  "dashboard.adminPitches.statusDeclined",
  cancelled: "dashboard.adminPitches.statusCancelled",
  expired:   "dashboard.adminPitches.statusExpired",
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

function fmtPitchRelative(iso: string | null, justNowLabel: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return justNowLabel;
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return fmtPitchDate(iso);
}

export function PitchesPage() {
  // Real workspace clients for the pitch recipient autocomplete (the shell
  // already adapts the bridge rows to the Client shape), replacing the
  // per-plan getClients() mock.
  const { state, effectivePitches, effectiveRoster, effectiveClients, tenantSlug, toast, effectiveTenant } = useAdminShell();
  const t = useT();
  const copy = useDashboardText();
  const router = useRouter();
  const canEdit = meetsRole(state.role, "manager");
  const [openDetailId, setOpenDetailId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  // Bulk select — mirrors the Messages-inbox pattern (explicit Select mode,
  // checkbox lane, sticky bottom bar). The only bulk mutation with a real
  // backend today is CANCEL (loops the existing cancelPitchAction), so only
  // still-active, non-converted pitches are selectable — no dead CTAs.
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkPending, setBulkPending] = useState(false);
  const cancellableIds = new Set(
    effectivePitches
      .filter((p) => PITCH_ACTIVE.includes(p.status) && !p.convertedInquiryId)
      .map((p) => p.id),
  );
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const exitBulk = () => {
    setBulkMode(false);
    setSelectedIds(new Set());
    setBulkConfirm(false);
  };
  const runBulkCancel = async () => {
    if (bulkPending || selectedIds.size === 0 || !tenantSlug) return;
    setBulkPending(true);
    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(ids.map((id) => cancelPitchAction(tenantSlug, id)));
    const ok = results.filter((r) => r.status === "fulfilled" && r.value.ok).length;
    const failed = ids.length - ok;
    setBulkPending(false);
    exitBulk();
    toast(
      copy.isSpanish
        ? `${ok} pitch${ok === 1 ? "" : "es"} cancelado${ok === 1 ? "" : "s"}${failed > 0 ? ` (${failed} fallaron)` : ""}`
        : `Cancelled ${ok} pitch${ok === 1 ? "" : "es"}${failed > 0 ? ` (${failed} failed)` : ""}`,
    );
    router.refresh();
  };

  const exportPitchesCsv = () => {
    downloadCsv(
      `pitches-${new Date().toISOString().slice(0, 10)}.csv`,
      effectivePitches.map((p) => ({
        recipient: p.recipientName,
        company: p.recipientCompany ?? "",
        status: p.status,
        talents: p.talentCount,
        sentAt: p.sentAt ?? "",
        lastViewedAt: p.lastViewedAt ?? "",
        views: p.viewCount,
        convertedInquiryId: p.convertedInquiryId ?? "",
      })),
    );
    toast(
      copy.isSpanish
        ? `${effectivePitches.length} filas exportadas`
        : `Exported ${effectivePitches.length} rows`,
    );
  };

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
        title={t("dashboard.adminPitches.title")}
        subtitle={
          counts.total === 0
            ? t("dashboard.adminPitches.subtitleEmpty")
            : interpolate(t("dashboard.adminPitches.subtitleCount"), {
                total: counts.total,
                active: counts.active,
                converted: counts.converted,
              })
        }
        actions={
          <>
            {effectivePitches.length > 0 && (
              <GhostButton size="sm" onClick={exportPitchesCsv}>
                {copy.isSpanish ? "Exportar CSV" : "Export CSV"}
              </GhostButton>
            )}
            {canEdit && cancellableIds.size > 0 && (
              <GhostButton size="sm" onClick={() => (bulkMode ? exitBulk() : setBulkMode(true))}>
                {bulkMode
                  ? copy.isSpanish ? "Listo" : "Done"
                  : copy.isSpanish ? "Seleccionar" : "Select"}
              </GhostButton>
            )}
            {canEdit ? (
              <PrimaryButton size="sm" onClick={() => setComposeOpen(true)}>
                {t("dashboard.adminPitches.newPitch")}
              </PrimaryButton>
            ) : null}
          </>
        }
      />

      {effectivePitches.length === 0 ? (
        <Card>
          <div style={{ padding: "44px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📨</div>
            <H3>{t("dashboard.adminPitches.emptyTitle")}</H3>
            <p style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.5, maxWidth: 380, marginInline: "auto" }} className="text-admin-ink-muted">
              {t("dashboard.adminPitches.emptyBody")}
            </p>
            {canEdit ? (
              <div style={{ marginTop: 18, display: "inline-flex", gap: 8 }}>
                <PrimaryButton size="sm" onClick={() => setComposeOpen(true)}>
                  {t("dashboard.adminPitches.composeFirst")}
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
            <StatTile label={t("dashboard.adminPitches.statActive")}     value={counts.active} />
            <StatTile label={t("dashboard.adminPitches.statConverted")}  value={counts.converted} accent />
            <StatTile label={t("dashboard.adminPitches.statClosed")}     value={counts.closed} />
            <StatTile label={t("dashboard.adminPitches.statTotal")}      value={counts.total} />
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
                <div>{t("dashboard.adminPitches.colRecipient")}</div>
                <div>{t("dashboard.adminPitches.colStatus")}</div>
                <div>{t("dashboard.adminPitches.colTalents")}</div>
                <div>{t("dashboard.adminPitches.colSent")}</div>
                <div>{t("dashboard.adminPitches.colLastView")}</div>
                <div className="text-right">{t("dashboard.adminPitches.colAction")}</div>
              </div>
              {effectivePitches.map((p, idx) => {
                const row = (
                  <PitchRow
                    key={`pitch-${p.id}`}
                    row={p}
                    isLast={idx === effectivePitches.length - 1}
                    onOpen={() => (bulkMode ? toggleSelect(p.id) : setOpenDetailId(p.id))}
                    tenantSlug={tenantSlug ?? "impronta"}
                    canEdit={canEdit && !bulkMode}
                    t={t}
                    onCancelled={() => {
                      toast(t("dashboard.adminPitches.toastCancelled"));
                      router.refresh();
                    }}
                  />
                );
                if (!bulkMode) return row;
                const selectable = cancellableIds.has(p.id);
                return (
                  <div
                    key={p.id}
                    className={`flex items-center gap-[6px] pl-[10px] ${
                      selectedIds.has(p.id) ? "bg-admin-brand-soft" : ""
                    } ${selectable ? "" : "opacity-45"}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      disabled={!selectable}
                      onChange={() => toggleSelect(p.id)}
                      aria-label={`${copy.isSpanish ? "Seleccionar" : "Select"} ${p.recipientName}`}
                      className="h-[14px] w-[14px] shrink-0 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <div className="min-w-0 flex-1">{row}</div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Bulk action bar — sticky bottom strip while rows are selected.
              Cancel is the only real backend bulk op (loops the existing
              cancelPitchAction); it uses a two-step confirm since cancelling
              retracts the client-facing share link. */}
          {bulkMode && selectedIds.size > 0 && (
            <div className="sticky bottom-[16px] z-30 mt-[10px] flex items-center gap-[10px] rounded-[10px] bg-admin-fill px-[14px] py-[10px] font-admin-body text-[12px] text-white shadow-admin-hover">
              <span className="font-bold">
                {selectedIds.size} {copy.isSpanish ? "seleccionados" : "selected"}
              </span>
              <span className="flex-1" />
              {bulkConfirm ? (
                <>
                  <span className="text-white/80">
                    {copy.isSpanish
                      ? "¿Cancelar estos pitches? Los enlaces dejan de funcionar."
                      : "Cancel these pitches? Their share links stop working."}
                  </span>
                  <button
                    type="button"
                    onClick={() => setBulkConfirm(false)}
                    disabled={bulkPending}
                    className="cursor-pointer rounded-full border border-white/25 bg-transparent px-[10px] py-[5px] text-[11.5px] font-semibold text-white"
                  >
                    {copy.isSpanish ? "Mantener" : "Keep"}
                  </button>
                  <button
                    type="button"
                    onClick={runBulkCancel}
                    disabled={bulkPending}
                    className="cursor-pointer rounded-full border-none bg-white px-[12px] py-[5px] text-[11.5px] font-bold text-admin-critical disabled:opacity-60"
                  >
                    {bulkPending
                      ? copy.isSpanish ? "Cancelando…" : "Cancelling…"
                      : copy.isSpanish ? "Sí, cancelar" : "Yes, cancel"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setBulkConfirm(true)}
                  className="cursor-pointer rounded-full border-none bg-white px-[12px] py-[5px] text-[11.5px] font-bold text-admin-fill"
                >
                  {copy.isSpanish ? "Cancelar pitches" : "Cancel pitches"}
                </button>
              )}
            </div>
          )}
        </>
      )}

      {openDetailId ? (
        <PitchDetailDrawerInline
          tenantSlug={tenantSlug ?? "impronta"}
          pitchId={openDetailId}
          onClose={() => setOpenDetailId(null)}
          onCancelled={() => {
            toast(t("dashboard.adminPitches.toastCancelled"));
            router.refresh();
          }}
        />
      ) : null}

      {composeOpen ? (
        <PitchComposeDrawer
          open={composeOpen}
          onOpenChange={setComposeOpen}
          selectedTalents={effectiveRoster.slice(0, 0)}
          clients={effectiveClients}
          tenantSlug={tenantSlug ?? "impronta"}
          agencyName={effectiveTenant.name}
          onPitchSent={() => {
            toast(t("dashboard.adminPitches.toastSent"));
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
  t,
}: {
  row: WorkspacePitchRow;
  isLast: boolean;
  onOpen: () => void;
  tenantSlug: string;
  canEdit: boolean;
  onCancelled: () => void;
  t: ReturnType<typeof useT>;
}) {
  const palette = PITCH_STATUS_TONE[row.status];
  const sentLabel = row.sentAt ? fmtPitchDate(row.sentAt) : row.status === "draft" ? "—" : fmtPitchDate(row.createdAt);
  const lastViewLabel = row.lastViewedAt
    ? `${fmtPitchRelative(row.lastViewedAt, t("dashboard.adminPitches.relativeJustNow"))}${row.viewCount > 1 ? ` · ${row.viewCount}×` : ""}`
    : row.status === "sent"
      ? t("dashboard.adminPitches.notYet")
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
        <StatusPill tone={palette.tone} label={t(PITCH_STATUS_LABEL_KEYS[row.status])} capitalize />
      </div>
      <div style={{ fontVariantNumeric: "tabular-nums" }} className="text-admin-ink-muted">
        {row.talentCount}
        {row.removedCount > 0 ? (
          <span style={{ fontSize: 12, marginLeft: 4 }} title={t("dashboard.adminPitches.removedByClient")}>
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
            {t("dashboard.adminPitches.inquiryLink")}
          </Link>
        ) : isActive && canEdit ? (
          <PitchRowCancel tenantSlug={tenantSlug} pitchId={row.id} onCancelled={onCancelled} t={t} />
        ) : null}
      </div>
    </div>
  );
}

function PitchRowCancel({
  tenantSlug,
  pitchId,
  onCancelled,
  t,
}: {
  tenantSlug: string;
  pitchId: string;
  onCancelled: () => void;
  t: ReturnType<typeof useT>;
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
          {pending ? "…" : t("dashboard.adminPitches.confirmYesCancel")}
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
          {t("dashboard.adminPitches.confirmNo")}
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
      {t("dashboard.adminPitches.cancel")}
    </button>
  );
}
