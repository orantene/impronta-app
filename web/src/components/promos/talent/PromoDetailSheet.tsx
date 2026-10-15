"use client";

import { promoErrorMessage } from "./error-message";
import { useEffect, useState } from "react";

import { useAdminShell } from "@/components/admin/shell/internal/state";
import { useOpenUpgradeModal } from "@/components/admin/shell/internal/state/upgrade-bridge";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { PromoResultsCard } from "@/components/promos/results";
import {
  duplicatePromo, endPromo, goLivePromo, loadPromoBookings, pausePromo, repeatPromo, resumePromo,
  type PromoBooking, type PromoListItem, type PromoResult, type PromosPageData,
} from "@/lib/promos/actions";
import type { PromoCopy } from "@/lib/promos/copy/talent";
import { promoTips } from "@/lib/promos/results/compute";
import { formatMoney, formatShortDate, progressOf } from "@/lib/promos/talent-view";
import { offerLabel, scheduleLine } from "./describe";
import { InfoTip, PANEL_MD, ProgressBar, PromoSwitch, StatusBadge, UI } from "./ui";

type Props = {
  item: PromoListItem | null;
  data: PromosPageData;
  copy: PromoCopy;
  onClose: () => void;
  onEdit: (item: PromoListItem) => void;
  onShare: (item: PromoListItem) => void;
  onChanged: () => void;
};

/** D4: status + toggle, progress, results, bookings, Edit, Duplicate, Repeat, End now. */
export function PromoDetailSheet({ item, data, copy, onClose, onEdit, onShare, onChanged }: Props) {
  const { toast } = useAdminShell();
  const openUpgrade = useOpenUpgradeModal();
  const [bookings, setBookings] = useState<PromoBooking[] | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [busy, setBusy] = useState(false);
  const id = item?.id ?? null;

  useEffect(() => {
    setBookings(null);
    setConfirmEnd(false);
    if (!id) return;
    let alive = true;
    void loadPromoBookings(id).then((r) => {
      if (alive && r.ok) setBookings(r.bookings);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  if (!item) return <Sheet open={false} onOpenChange={() => undefined} />;

  const { promo, status } = item;
  const prog = progressOf(promo, item.used);
  const result = data.results.results[item.id] ?? null;
  const running = status === "live" || status === "paused" || status === "sold_out";
  const ended = status === "expired" || status === "archived";

  const run = async (fn: () => Promise<PromoResult>, okKey: Parameters<PromoCopy["t"]>[0], close = false) => {
    setBusy(true);
    try {
      const r = await fn();
      if (r.ok) {
        toast(copy.t(okKey));
        onChanged();
        if (close) onClose();
      } else if ("needsUpgrade" in r) {
        openUpgrade({ feature: copy.t("upgrade.feature"), why: copy.t("upgrade.why"), requiredPlan: "website" });
      } else {
        toast(promoErrorMessage(copy, r));
      }
    } finally {
      setBusy(false);
    }
  };

  const progressBody = (
    <>
      {prog.max !== null ? <ProgressBar pct={prog.pct} label={copy.t("card.used", { used: prog.used, max: prog.max })} /> : null}
      <span className={`text-[13px] ${UI.muted}`}>
        {prog.max !== null ? copy.t("card.used", { used: prog.used, max: prog.max }) : copy.t("card.used_open", { used: prog.used })}
      </span>
    </>
  );
  const progressCard = (
    <section className={`${UI.card} flex flex-col gap-2 p-4`} aria-label={copy.t("detail.progress")}>
      <span className={`text-[13px] font-semibold ${UI.ink}`}>{copy.t("detail.progress")}</span>
      {progressBody}
    </section>
  );

  return (
    <Sheet open onOpenChange={(o) => (o ? undefined : onClose())}>
      <SheetContent side="bottom" aria-describedby={undefined} className={`flex max-h-[94vh] max-w-full flex-col gap-0 overflow-x-hidden rounded-t-3xl ${PANEL_MD} bg-[var(--tc-canvas,#fafafa)] text-[var(--tc-ink,#1c1c1e)] p-0`}>
        <div className="px-4 pb-2 pt-4">
          <SheetTitle className={`pr-10 ${UI.title}`}>{item.name}</SheetTitle>
          <SheetDescription className="sr-only">{offerLabel(promo, copy)}</SheetDescription>
          <div className="mt-1 flex items-center gap-3">
            <StatusBadge status={status} copy={copy} />
            <span className={`text-[12px] ${UI.muted}`}>{offerLabel(promo, copy)} · {scheduleLine(promo, copy)}</span>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden px-4 pb-4">
          {running ? (
            <div className={`${UI.card} flex min-h-14 items-center justify-between gap-3 px-4`}>
              <span className={`text-[14px] font-semibold ${UI.ink}`}>{status === "paused" ? copy.t("detail.paused") : copy.t("detail.live")}</span>
              <PromoSwitch
                label={copy.t("detail.toggle")}
                checked={status !== "paused"}
                disabled={busy}
                onChange={(next) => void run(() => (next ? resumePromo(item.id) : pausePromo(item.id)), next ? "toast.resumed" : "toast.paused")}
              />
            </div>
          ) : null}

          {status === "draft" ? (
            <button type="button" className={UI.primary} disabled={busy} onClick={() => void run(() => goLivePromo(item.id), "toast.live", true)}>
              {copy.t("detail.go_live")}
            </button>
          ) : null}

          {result ? null : progressCard}

          {result ? (
            <PromoResultsCard
              name={item.is_trial ? copy.t("detail.trial_card") : item.name}
              hideTitle
              progress={progressBody}
              result={result}
              tips={promoTips({ result, maxUses: promo.max_uses, audience: promo.audience, ended })}
              currency={data.currency}
              lang={copy.locale}
            />
          ) : data.plan === "free" && item.used > 0 ? (
            <p className={`${UI.card} flex items-center justify-between p-4 pr-1 text-[13px] ${UI.muted}`}>
              {copy.t("detail.results_locked")}
              <InfoTip text={copy.t("paid.info")} label={copy.t("info.label")} />
            </p>
          ) : null}

          <section className={`${UI.card} flex flex-col gap-2 p-4`} aria-label={copy.t("detail.bookings")}>
            <span className={`text-[13px] font-semibold ${UI.ink}`}>{copy.t("detail.bookings")}</span>
            {bookings && bookings.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {bookings.map((b, i) => (
                  <li key={`${b.created_at}-${i}`} className={`text-[13px] ${UI.muted}`}>
                    {copy.t("detail.booking_row", {
                      date: formatShortDate(b.created_at.slice(0, 10), copy.locale),
                      amount: formatMoney(b.discount_cents, data.currency, copy.locale),
                    })}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={`text-[13px] ${UI.muted}`}>{copy.t("detail.bookings_empty")}</p>
            )}
          </section>

          {confirmEnd ? (
            <div role="alertdialog" className={`${UI.card} flex flex-col gap-3 p-4`}>
              <p className={`text-[14px] ${UI.ink}`}>{copy.t("detail.end_confirm")}</p>
              <div className="flex gap-2">
                <button type="button" className={UI.secondary} onClick={() => setConfirmEnd(false)}>{copy.t("action.cancel")}</button>
                <button type="button" className={`${UI.primary} flex-1`} disabled={busy} onClick={() => void run(() => endPromo(item.id), "toast.ended", true)}>
                  {copy.t("detail.end")}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 border-t border-[var(--tc-border,#e5e5ea)] bg-white px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]" data-promo-footer>
          {!ended ? <button type="button" className={`${UI.primary} w-full`} onClick={() => onShare(item)}>{copy.t("page.share")}</button> : null}
          <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-[repeat(2,minmax(0,1fr))]" data-promo-footer-grid>
            {!ended ? <button type="button" className={`${UI.secondary} w-full`} onClick={() => onEdit(item)}>{copy.t("detail.edit")}</button> : null}
            <button type="button" className={`${UI.secondary} w-full`} disabled={busy} onClick={() => void run(() => duplicatePromo(item.id), "toast.duplicated", true)}>
              {copy.t("detail.duplicate")}
            </button>
            {ended ? (
              <>
                <button type="button" className={`${UI.secondary} w-full`} disabled={busy} onClick={() => void run(() => repeatPromo(item.id, 1), "toast.duplicated", true)}>
                  {copy.t("detail.repeat_month")}
                </button>
                <button type="button" className={`${UI.secondary} w-full`} disabled={busy} onClick={() => void run(() => repeatPromo(item.id, 12), "toast.duplicated", true)}>
                  {copy.t("detail.repeat_year")}
                </button>
              </>
            ) : null}
          </div>
          {running || status === "scheduled" ? (
            <button type="button" className={`${UI.quiet} w-full`} onClick={() => setConfirmEnd(true)}>{copy.t("detail.end")}</button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
