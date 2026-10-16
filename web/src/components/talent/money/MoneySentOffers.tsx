"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { formatDashboardMoneyCents } from "@/lib/money/dashboard-money-format";
import { messagingTalentLoadPendingOffers } from "@/lib/server-actions/messaging-talent";
import type { PendingOffer } from "@/lib/talent/sent-offers";

/**
 * TUL-957: offers she sent that the client has not paid yet. No order exists
 * until payment, so these never reach the ledger panes; without this list a
 * sent offer was invisible on Money. Hidden when there are none.
 */
export function MoneySentOffers() {
  const copy = useDashboardText();
  const t = copy.t;
  const [offers, setOffers] = useState<PendingOffer[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void messagingTalentLoadPendingOffers().then((res) => {
      if (!cancelled) setOffers(res.ok ? res.offers : []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!offers || offers.length === 0) return null;
  return (
    <section data-money-sent-offers className="mb-4 rounded-[12px] border border-admin-border-soft bg-white">
      <header className="flex items-baseline gap-2 px-4 pt-3.5">
        <h2 className="font-admin-body text-[13.5px] font-semibold text-admin-ink">{t("Offers awaiting payment")}</h2>
        <span className="flex-1" />
        <span className="text-[12px] text-admin-ink-muted">{offers.length}</span>
      </header>
      <ul className="mt-2">
        {offers.map((o) => (
          <li key={o.offerId} className="border-t border-admin-border-soft">
            <Link
              href={`/talent/inbox?inquiry=${encodeURIComponent(o.inquiryId)}`}
              className="flex items-center gap-3 px-4 py-3"
              data-sent-offer={o.offerId}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-admin-body text-[13.5px] font-semibold text-admin-ink">
                  {o.clientName || o.label || t("Offer")}
                </span>
                <span className="block truncate font-admin-body text-[12.5px] text-admin-ink-muted">
                  {o.clientName && o.label ? `${o.label} · ` : ""}
                  {t("Sent, awaiting payment")}
                </span>
              </span>
              <span className="whitespace-nowrap font-admin-body text-[14px] font-semibold text-admin-amber-deep">
                {formatDashboardMoneyCents(o.herCents, o.currency, copy.locale)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
