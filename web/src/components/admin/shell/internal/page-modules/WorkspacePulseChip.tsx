"use client";

import { useEffect, useState } from "react";
import { formatMoneyCents } from "@/lib/talent/earnings-view";
import { useDashboardText } from "../dashboard-i18n";
import { Icon } from "../primitives";
import { COLORS, useAdminShell } from "../state";

/**
 * WorkspacePulseChip — the workspace surface's header-left context.
 *
 * Replaces the old acting-as chip, which duplicated the sidebar tenant
 * chip (same tenant name, same switcher drawer, ~100px apart). The rail
 * now owns identity + switching; this chip owns the LIVE BUSINESS
 * SIGNALS: pending payouts, confirmed bookings, open inquiries, unread.
 * Click opens a breakdown popover with deep links into Financials and
 * Messages. Renders nothing while the metrics bridge hasn't loaded —
 * a pulse with no data is dead chrome.
 */
export function WorkspacePulseChip() {
  const { overviewMetrics, totalUnread, bridgeWorkspaceUnread, tenantSlug, setPage } = useAdminShell();
  const copy = useDashboardText();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && !target.closest("[data-tulala-pulse-root]")) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const m = overviewMetrics;
  if (!m) return null;

  const currency = m.kpiCurrency ?? "USD";
  const pendingLabel =
    m.pendingPayoutCents != null ? formatMoneyCents(m.pendingPayoutCents, currency) : null;
  const offCurrencyParts: string[] = [];
  for (const sub of m.offCurrencySubtotals ?? []) {
    if (sub.pendingCents > 0) offCurrencyParts.push(`+${formatMoneyCents(sub.pendingCents, sub.currency)}`);
  }
  const pendingValue =
    pendingLabel != null
      ? `${pendingLabel}${offCurrencyParts.length > 0 ? ` ${offCurrencyParts.join(" ")}` : ""}`
      : null;
  const unread = totalUnread > 0 ? totalUnread : (bridgeWorkspaceUnread ?? 0);

  // Compact trigger line — money first, falls back to roster/inquiry counts.
  const summary =
    pendingValue != null && m.confirmedBookingCount != null
      ? copy.isSpanish
        ? `${pendingValue} pendiente · ${m.confirmedBookingCount} confirmada${m.confirmedBookingCount === 1 ? "" : "s"}`
        : `${pendingValue} pending · ${m.confirmedBookingCount} confirmed`
      : copy.isSpanish
        ? `${m.rosterTotal ?? 0} talento · ${m.openInquiries ?? 0} consultas abiertas`
        : `${m.rosterTotal ?? 0} talent · ${m.openInquiries ?? 0} open inquiries`;

  const rows: { label: string; value: string }[] = [];
  if (pendingValue != null) {
    rows.push({ label: copy.isSpanish ? "Pagos pendientes" : "Pending payouts", value: pendingValue });
  }
  if (m.confirmedBookingCount != null) {
    rows.push({ label: copy.isSpanish ? "Reservas confirmadas" : "Confirmed bookings", value: String(m.confirmedBookingCount) });
  }
  if (m.openInquiries != null) {
    rows.push({ label: copy.isSpanish ? "Consultas abiertas" : "Open inquiries", value: String(m.openInquiries) });
  }
  if (unread > 0) {
    rows.push({ label: copy.isSpanish ? "Mensajes sin leer" : "Unread messages", value: String(unread) });
  }
  if ((m.pendingApprovals ?? 0) > 0) {
    rows.push({ label: copy.isSpanish ? "Aprobaciones de roster" : "Roster approvals waiting", value: String(m.pendingApprovals) });
  }

  return (
    <div data-tulala-pulse-root className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={copy.isSpanish ? "Pulso del negocio — desglose" : "Business pulse — breakdown"}
        title={copy.isSpanish ? "Pulso del negocio" : "Business pulse"}
        className={`inline-flex cursor-pointer items-center gap-[8px] rounded-[999px] border-none px-[10px] py-[6px] font-admin-body hover:bg-[rgba(11,11,13,0.05)] [transition:background_var(--transition-admin-micro)] ${
          open ? "bg-[rgba(11,11,13,0.06)]" : "bg-transparent"
        }`}
      >
        <span aria-hidden className="h-[6px] w-[6px] shrink-0 rounded-full bg-admin-green" />
        <span className="max-w-[320px] overflow-hidden text-ellipsis whitespace-nowrap text-[12.5px] font-medium tracking-[-0.05px] text-admin-ink">
          {summary}
        </span>
        <Icon name="chevron-down" size={10} color={COLORS.inkDim} />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={copy.isSpanish ? "Pulso del negocio" : "Business pulse"}
          className="absolute left-0 top-[calc(100%_+_6px)] z-[200] min-w-[264px] rounded-[12px] border border-admin-border-soft bg-white p-[6px] font-admin-body shadow-[0_10px_40px_rgba(11,11,13,0.16)]"
        >
          <div className="border-b border-admin-border-soft px-[12px] pb-[8px] pt-[9px]">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.7px] text-admin-ink-muted">
              {copy.isSpanish ? "Pulso del negocio" : "Business pulse"}
            </div>
          </div>
          <div className="px-[6px] py-[4px]">
            {rows.map((r) => (
              <div key={r.label} className="flex items-baseline justify-between gap-[16px] rounded-[7px] px-[6px] py-[6px]">
                <span className="text-[12px] text-admin-ink-muted">{r.label}</span>
                <span className="text-[12.5px] font-semibold text-admin-ink">{r.value}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-[6px] border-t border-admin-border-soft px-[6px] pb-[4px] pt-[6px]">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                window.location.assign(tenantSlug ? `/${tenantSlug}/admin/financials` : "/admin/financials");
              }}
              className="flex-1 cursor-pointer rounded-[7px] border border-admin-border-soft bg-transparent px-[8px] py-[6px] text-[11.5px] font-semibold text-admin-ink hover:border-admin-border-strong [transition:border-color_var(--transition-admin-micro)]"
            >
              {copy.isSpanish ? "Ver finanzas" : "Open financials"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setPage("messages");
              }}
              className="flex-1 cursor-pointer rounded-[7px] border border-admin-border-soft bg-transparent px-[8px] py-[6px] text-[11.5px] font-semibold text-admin-ink hover:border-admin-border-strong [transition:border-color_var(--transition-admin-micro)]"
            >
              {copy.isSpanish ? "Ver mensajes" : "Open messages"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

