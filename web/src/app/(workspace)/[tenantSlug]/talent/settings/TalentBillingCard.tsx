"use client";

/**
 * TalentBillingCard (TUL-834) · Talent > Settings > Billing. Current plan, next
 * charge, card on file and the invoice list, plus a "Manage billing" button
 * that opens the Stripe Billing Portal. Loading / error / loaded are all
 * visible. Read-only: every change happens in the portal.
 */

import { formatDashboardMoneyCents } from "@/lib/money/dashboard-money-format";
import { useEffect, useState, useTransition } from "react";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { PastDueBanner } from "@/components/billing/PastDueBanner";
import { billingDateLabel } from "@/lib/billing/pending-cancellation";
import { talentBillingPlanLabel, talentPastDueView } from "@/lib/billing/talent-billing-display";
import {
  loadTalentBillingSummary,
  type TalentBillingSummary,
} from "@/lib/server-actions/talent-billing-summary";
import { openTalentSubscriptionPortal } from "./stripe-talent-actions";

const INVOICE_STATUS: Record<string, string> = {
  paid: "Paid",
  open: "Unpaid",
  void: "Void",
  uncollectible: "Uncollectible",
};

export function TalentBillingCard({ tenantSlug }: { tenantSlug: string }) {
  const copy = useDashboardText();
  const [data, setData] = useState<TalentBillingSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [portalError, setPortalError] = useState<string | null>(null);
  const loc = copy.isSpanish ? "es" : "en-US";

  useEffect(() => {
    let live = true;
    loadTalentBillingSummary()
      .then((r) => {
        if (!live) return;
        if (r.ok) setData(r.summary);
        else setFailed(true);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  function openPortal() {
    if (pending) return;
    setPortalError(null);
    startTransition(async () => {
      const r = await openTalentSubscriptionPortal(tenantSlug);
      if (r.ok) window.location.href = r.redirectUrl;
      else setPortalError(r.error);
    });
  }

  if (failed) return <p className="text-xs text-red-600">{copy.t("Couldn't load billing. Try again.")}</p>;
  if (!data) return <p className="text-xs text-neutral-500">{copy.t("Loading billing…")}</p>;

  const sub = data.subscription;
  // TUL-835: the plan name in the dashboard's own words ("Oficina Web" in ES).
  const planName = talentBillingPlanLabel(data.planKey) ?? data.planLabel;
  const pastDue = talentPastDueView(sub);
  const day = (iso: string) =>
    new Date(iso).toLocaleDateString(loc, { year: "numeric", month: "short", day: "numeric" });
  const money = (cents: number, currency: string) => formatDashboardMoneyCents(cents, currency, loc);

  return (
    <div className="flex flex-col gap-4 text-sm">
      {pastDue && (
        <PastDueBanner
          scope="talent"
          tenantSlug={tenantSlug}
          status={pastDue.status}
          pastDueSince={pastDue.pastDueSince}
          locale={copy.isSpanish ? "es" : "en"}
        />
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
        <dt className="text-neutral-500">{copy.t("Current plan")}</dt>
        <dd>{copy.t(planName)}</dd>
        {sub?.nextChargeAt && (
          <>
            <dt className="text-neutral-500">{copy.t(billingDateLabel(sub.cancelAtPeriodEnd))}</dt>
            <dd>{day(sub.nextChargeAt)}</dd>
          </>
        )}
        <dt className="text-neutral-500">{copy.t("Card")}</dt>
        <dd>
          {data.card
            ? `${data.card.brand.toUpperCase()} ${copy.t("ending in")} ${data.card.last4}`
            : copy.t(sub ? "No card on file" : "No paid plan")}
        </dd>
      </dl>

      {sub && (
        <div className="flex flex-col items-start gap-1">
          <button
            type="button"
            onClick={openPortal}
            disabled={pending}
            className="h-9 rounded-lg border border-neutral-300 bg-white px-3 text-xs font-semibold disabled:opacity-60"
          >
            {pending ? copy.t("Opening…") : copy.t("Manage billing")}
          </button>
          {portalError && <span className="text-xs text-red-600">{portalError}</span>}
        </div>
      )}

      <div>
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-neutral-400">{copy.t("Invoices")}</div>
        {data.invoices.length === 0 ? (
          <p className="text-xs text-neutral-500">{copy.t("No invoices yet.")}</p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="text-neutral-500">
              <tr>
                <th className="py-1 font-medium">{copy.t("Date")}</th>
                <th className="py-1 font-medium">{copy.t("Amount")}</th>
                <th className="py-1 font-medium">{copy.t("Status")}</th>
                <th className="py-1 font-medium">{copy.t("PDF")}</th>
              </tr>
            </thead>
            <tbody>
              {data.invoices.map((inv) => {
                const link = inv.pdfUrl ?? inv.hostedUrl;
                return (
                  <tr key={inv.id} className="border-t border-neutral-100">
                    <td className="py-1.5">{day(inv.date)}</td>
                    <td className="py-1.5">{money(inv.amountCents, inv.currency)}</td>
                    <td className="py-1.5">{copy.t(INVOICE_STATUS[inv.status ?? ""] ?? inv.status ?? "")}</td>
                    <td className="py-1.5">
                      {link ? (
                        <a href={link} target="_blank" rel="noopener noreferrer" className="underline">
                          {copy.t(inv.pdfUrl ? "PDF" : "View")}
                        </a>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
