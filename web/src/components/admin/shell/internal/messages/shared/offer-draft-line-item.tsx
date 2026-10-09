"use client";

import { OFFER_LINE_ROW_CLASS, OFFER_LINE_LABEL_CLASS, OFFER_LINE_CONTROL_CLASS } from "@/components/admin/offer/offer-money-split";
import { interpolate } from "@/i18n/interpolate";
import { LineServicePicker } from "./line-service-picker";
import { planServicePick } from "@/lib/inquiry/offer-service-pick";
import type { ServicePricingType } from "@/lib/talent/services-menu-types";
import type { OfferDraftSnapshot } from "@/app/(workspace)/[tenantSlug]/admin/_pipeline-actions";

type OfferLine = OfferDraftSnapshot["lineItems"][number];

/** One editable offer line (6-column table row, stacked in a narrow panel). */
export function OfferDraftLineItem({
  li, lines, currencyCode, rosterOptions, coordTalentIds, labelTouched,
  t, toast, updateLine, onRemove, onLabelTouched, onSwitchCurrency,
}: {
  li: OfferLine;
  lines: ReadonlyArray<OfferLine>;
  currencyCode: string;
  rosterOptions: ReadonlyArray<{ id: string; name: string }>;
  coordTalentIds: ReadonlySet<string>;
  labelTouched: boolean;
  t: (key: string) => string;
  toast: (message: string) => void;
  updateLine: (id: string, patch: Partial<OfferLine>) => void;
  onRemove: (id: string) => void;
  onLabelTouched: (id: string) => void;
  onSwitchCurrency: (code: string) => void;
}) {
  return (
    <div data-offer-line-row className={OFFER_LINE_ROW_CLASS}>
      <div className="col-span-full flex min-w-0 flex-col gap-0.5 @[640px]:col-span-1">
        <span aria-hidden className={OFFER_LINE_LABEL_CLASS}>{t("dashboard.adminTabs.lineup.colTalent")}</span>
        <div className="flex min-w-0 items-center gap-1">
        <select
          aria-label={t("dashboard.adminTabs.lineup.colTalent")}
          className={OFFER_LINE_CONTROL_CLASS}
          value={li.talentProfileId ?? ""}
          onChange={(e) => {
            const id = e.target.value || null;
            const match = rosterOptions.find((p) => p.id === id);
            // Changing the talent invalidates any prior service prefill
            // (the service belonged to the previous talent) — clear the stamp.
            updateLine(li.id, { talentProfileId: id, talentDisplayName: match?.name ?? null, label: labelTouched ? li.label : (match?.name ?? li.label), sourceServiceId: null });
          }}
        >
          <option value="">{t("dashboard.adminTabs.lineup.chooseTalent")}</option>
          {rosterOptions.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {/* Item #11 final: live coord badge. Renders "+coord"
            inline when the selected talent is a coordinator on
            this inquiry. Engine commission snapshot pays both
            lanes (talent payout + workspace fee share per
            coordinator_pct, plan §7.4). */}
        {li.talentProfileId && coordTalentIds.has(li.talentProfileId) && (
          <span
            title={t("dashboard.adminTabs.lineup.coordBadgeTitle")}
            className="shrink-0 whitespace-nowrap rounded-full px-1.5 py-px text-[9.5px] font-bold uppercase tracking-[0.4px] text-[#2B3FA3] bg-[rgba(43,63,163,0.10)]"
          >
            {t("dashboard.adminTabs.lineup.coordBadge")}
          </span>
        )}
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
      <span aria-hidden className={OFFER_LINE_LABEL_CLASS}>{t("dashboard.adminTabs.lineup.colUnit")}</span>
      <select
        aria-label={t("dashboard.adminTabs.lineup.colUnit")}
        className={OFFER_LINE_CONTROL_CLASS}
        value={li.pricingUnit}
        onChange={(e) => updateLine(li.id, { pricingUnit: e.target.value as ServicePricingType })}
      >
        <option value="hour">{t("dashboard.adminTabs.lineup.unitHour")}</option>
        <option value="day">{t("dashboard.adminTabs.lineup.unitDay")}</option>
        <option value="week">{t("dashboard.adminTabs.lineup.unitWeek")}</option>
        <option value="half_day">{t("dashboard.adminTabs.lineup.unitHalfDay")}</option>
        <option value="event">{t("dashboard.adminTabs.lineup.unitEvent")}</option>
        <option value="per_person">{t("dashboard.adminTabs.lineup.unitPerson")}</option>
        <option value="per_contact">{t("dashboard.adminTabs.lineup.unitSession")}</option>
        <option value="flat_package">{t("dashboard.adminTabs.lineup.unitFlat")}</option>
        <option value="custom">{t("dashboard.adminTabs.lineup.unitCustom")}</option>
      </select>
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
      <span aria-hidden className={OFFER_LINE_LABEL_CLASS}>{t("dashboard.adminTabs.lineup.colQty")}</span>
      <input type="number" min={0} step="0.5" value={li.units}
        aria-label={t("dashboard.adminTabs.lineup.colQty")}
        onChange={(e) => updateLine(li.id, { units: parseFloat(e.target.value) || 0 })}
        className={OFFER_LINE_CONTROL_CLASS}
        placeholder={t("dashboard.adminTabs.lineup.unitsPlaceholder")}
      />
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
      <span aria-hidden className={OFFER_LINE_LABEL_CLASS}>{t("dashboard.adminTabs.lineup.colClientRate")}</span>
      <input type="number" min={0} step="100" value={li.unitPrice}
        aria-label={t("dashboard.adminTabs.lineup.colClientRate")}
        onChange={(e) => updateLine(li.id, { unitPrice: parseFloat(e.target.value) || 0 })}
        className={OFFER_LINE_CONTROL_CLASS}
        placeholder={t("dashboard.adminTabs.lineup.ratePlaceholder")}
      />
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
      <span aria-hidden className={OFFER_LINE_LABEL_CLASS}>{t("dashboard.adminTabs.lineup.colTalentGets")}</span>
      <input type="number" min={0} step="100" value={li.talentCost}
        aria-label={t("dashboard.adminTabs.lineup.colTalentGets")}
        onChange={(e) => updateLine(li.id, { talentCost: parseFloat(e.target.value) || 0 })}
        className={OFFER_LINE_CONTROL_CLASS}
        placeholder={t("dashboard.adminTabs.lineup.talentCostPlaceholder")}
      />
      </div>
      <button type="button" onClick={() => onRemove(li.id)}
        aria-label={t("dashboard.adminTabs.lineup.remove")}
        title={t("dashboard.adminTabs.lineup.remove")}
        className="col-span-full justify-self-end text-[14px] leading-none text-admin-coral @[640px]:col-span-1 @[640px]:justify-self-center"
      >×</button>
      {/* S14/S15 — prefill this line from the talent's services (W2-1). */}
      {li.talentProfileId ? (
        <div className="col-span-full">
          <LineServicePicker
            talentProfileId={li.talentProfileId} currency={currencyCode}
            onPick={(svc) => {
              // TUL-274: an amount never crosses currencies silently.
              const plan = planServicePick({ offerCurrency: currencyCode, lines, lineId: li.id, labelTouched, service: svc });
              const next = plan.switchCurrency;
              if (plan.blocked) { toast(interpolate(t("dashboard.adminTabs.lineup.svcCurrencyBlocked"), plan.blocked)); return; }
              if (next) onSwitchCurrency(next);
              updateLine(li.id, { ...plan.patch, pricingUnit: svc.pricingType });
            }}
          />
        </div>
      ) : null}
      {/* W2-2 — editable line label + "what's included" note: a
          travel-inclusive rate reads honestly (baked in, no expense line). */}
      <div className="col-span-full flex flex-wrap gap-1.5">
        <input
          type="text"
          aria-label={t("dashboard.adminTabs.lineup.lineLabelPlaceholder")}
          value={li.label ?? ""}
          onChange={(e) => {
            onLabelTouched(li.id);
            updateLine(li.id, { label: e.target.value });
          }}
          placeholder={t("dashboard.adminTabs.lineup.lineLabelPlaceholder")}
          className="min-w-[12rem] flex-[1.4] rounded border border-admin-border bg-white px-1.5 py-1 text-[11px] text-admin-ink"
        />
        <input
          type="text"
          aria-label={t("dashboard.adminTabs.lineup.lineNotePlaceholder")}
          value={li.notes ?? ""}
          onChange={(e) => updateLine(li.id, { notes: e.target.value || null })}
          placeholder={t("dashboard.adminTabs.lineup.lineNotePlaceholder")}
          className="min-w-[12rem] flex-1 rounded border border-admin-border bg-white px-1.5 py-1 text-[11px] text-admin-ink-muted"
        />
      </div>
    </div>
  );
}
