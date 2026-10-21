"use client";

import { useEffect, useState, useTransition } from "react";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { answerMyOfferLineAction, loadOfferLineConfirmationViewAction } from "@/lib/server-actions/offer-line-confirmation";
import type { OfferLineConfirmationView } from "@/lib/coordinator/offer-line-confirmation-view";

/**
 * TUL-1608: per-line talent readiness on a sent offer. Coordinators see each
 * line's state; a talent sees (and answers) only their own line. Readiness
 * only: it never touches the client's approval, the total or any money.
 * Token classes only (inline styles are frozen under components/admin/shell).
 */
export function OfferLineConfirmations({ inquiryId, offerId }: { inquiryId: string; offerId: string }) {
  const t = useT();
  const [view, setView] = useState<OfferLineConfirmationView | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadOfferLineConfirmationViewAction({ inquiryId, offerId }).then((r) => {
      if (cancelled) return;
      if (r.ok) {
        setView(r.view);
        setFailed(false);
      } else {
        setView(null);
        setFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [inquiryId, offerId, reloadKey]);

  if (failed || !view || view.summary.total === 0) return null;

  const answer = (lineId: string, status: "confirmed" | "declined") =>
    startTransition(async () => {
      const r = await answerMyOfferLineAction({ lineId, status });
      if (r.ok) setReloadKey((k) => k + 1);
    });

  const stateLabel = (s: "confirmed" | "declined" | "pending") =>
    t(`dashboard.adminTabs.offer.lineConfirm.state.${s}`);
  const stateTone = (s: "confirmed" | "declined" | "pending") =>
    s === "confirmed" ? "text-admin-ink" : "text-admin-ink-muted";

  return (
    <div className="flex flex-col gap-2" data-offer-line-confirmations>
      <div className="text-admin-11 font-semibold text-admin-ink-muted">
        {interpolate(t("dashboard.adminTabs.offer.lineConfirm.summary"), {
          confirmed: String(view.summary.confirmed),
          total: String(view.summary.total),
        })}
      </div>
      <div className="overflow-hidden rounded-lg border border-admin-border">
        {view.rows.map((row, i) => (
          <div
            key={row.lineId}
            className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 ${i === 0 ? "" : "border-t border-admin-border"}`}
          >
            <div className="min-w-0">
              <div className="text-admin-13 font-semibold text-admin-ink">{row.label}</div>
              <div className={`text-admin-11 ${stateTone(row.state)}`}>{stateLabel(row.state)}</div>
            </div>
            {row.mine && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pending || row.state === "confirmed"}
                  aria-pressed={row.state === "confirmed"}
                  onClick={() => answer(row.lineId, "confirmed")}
                  className={`min-h-11 min-w-11 rounded-full border border-admin-border px-4 text-admin-12 font-semibold text-admin-ink ${row.state === "confirmed" ? "bg-admin-surface-alt" : "bg-transparent"} ${pending ? "opacity-50" : ""}`}
                >
                  {t("dashboard.adminTabs.offer.lineConfirm.confirm")}
                </button>
                <button
                  type="button"
                  disabled={pending || row.state === "declined"}
                  aria-pressed={row.state === "declined"}
                  onClick={() => answer(row.lineId, "declined")}
                  className={`min-h-11 min-w-11 rounded-full border border-admin-border px-4 text-admin-12 font-semibold text-admin-ink-muted ${row.state === "declined" ? "bg-admin-surface-alt" : "bg-transparent"} ${pending ? "opacity-50" : ""}`}
                >
                  {t("dashboard.adminTabs.offer.lineConfirm.decline")}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
