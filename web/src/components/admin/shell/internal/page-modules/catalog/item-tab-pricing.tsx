"use client";

/**
 * item-tab-pricing — W03_ProductPricing: `Base price` (Price · Sold by ·
 * Tax category · Cost), `Price lists`, `Deposit / prepayment`, and the right
 * column (the Counter tile, example totals, the before-publish line).
 *
 * WIRED: the price, how it is sold (`price_type`), how it is shown (exact,
 * from, quote), the currency, and for a service or package the direct
 * booking switch with its deposit (`booking_mode`, `reserve_mode`,
 * `deposit_pct`). NOT WIRED, each disabled with its sentence: the tax
 * category (`tax_categories` has no reader on this surface), the cost, and
 * per-location or timed price lists (no table) (D-POS-45, D-POS-47).
 */

import { useT } from "@/i18n/use-t";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { Icon } from "../../primitives";
import { DEFAULT_CURRENCY_OPTIONS } from "@/lib/billing/currencies";
import {
  formatOfferingPrice,
  type OfferingPriceDisplay,
  type OfferingReserveMode,
  type TalentOffering,
} from "@/lib/talent/offerings-types";
import type { ServicePricingType } from "@/lib/talent/services-menu-types";
import { StatePill } from "../appointments-classes-ui";
import type { TabProps } from "./CatalogItemEditor";
import { exampleTotals } from "./catalog-model";
import { BUTTON_SMALL, CARD, Eyebrow, Field, INPUT, SectionHead, TotalRow } from "./catalog-ui";

const UNITS: ReadonlyArray<{ value: ServicePricingType; key: string }> = [
  { value: "flat_package", key: "dashboard.catalog.pricing.unit.each" },
  { value: "hour", key: "dashboard.catalog.pricing.unit.hour" },
  { value: "half_day", key: "dashboard.catalog.pricing.unit.halfDay" },
  { value: "day", key: "dashboard.catalog.pricing.unit.day" },
  { value: "week", key: "dashboard.catalog.pricing.unit.week" },
  { value: "per_contact", key: "dashboard.catalog.pricing.unit.session" },
  { value: "per_person", key: "dashboard.catalog.pricing.unit.person" },
  { value: "event", key: "dashboard.catalog.pricing.unit.event" },
];

function centsToInput(c: number | null): string {
  return c === null ? "" : (c / 100).toString();
}
function inputToCents(raw: string): number | null {
  const tr = raw.trim();
  if (!tr) return null;
  const n = Number(tr);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function PricingTab({ item, patch, saving }: TabProps) {
  const t = useT();
  const locale = useDashboardLocale();
  const quote = item.priceDisplay === "quote";
  const priceText = item.amountCents == null ? t("dashboard.catalog.dash") : formatOfferingPrice(item.amountCents, item.currency, locale);
  const bookable = item.kind !== "product";

  return (
    <>
      <SectionHead title={t("dashboard.catalog.pricing.baseTitle")} intro={t("dashboard.catalog.pricing.baseIntro")} />
      <div className="grid grid-cols-4 gap-[14px]">
        <Field label={t("dashboard.catalog.pricing.price")} required={!quote}>
          <input
            key={`amt-${item.id}-${item.amountCents ?? "x"}`}
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            defaultValue={centsToInput(item.amountCents)}
            disabled={saving || quote}
            data-testid="catalog-field-price"
            onBlur={(e) => {
              const cents = inputToCents(e.target.value);
              if (cents !== item.amountCents) patch({ amountCents: cents });
            }}
            className={`${INPUT} font-semibold`}
          />
        </Field>
        <Field label={t("dashboard.catalog.pricing.soldBy")} hint={t("dashboard.catalog.pricing.soldByHint")}>
          <select
            value={item.priceType}
            disabled={saving}
            data-testid="catalog-field-unit"
            onChange={(e) => patch({ priceType: e.target.value as ServicePricingType })}
            className={INPUT}
          >
            {UNITS.map((u) => (
              <option key={u.value} value={u.value}>
                {t(u.key)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("dashboard.catalog.pricing.taxCategory")} reason={t("dashboard.catalog.pricing.taxReason")}>
          <select disabled className={INPUT} data-testid="catalog-field-tax">
            <option>{t("dashboard.catalog.pricing.taxUnset")}</option>
          </select>
        </Field>
        <Field label={t("dashboard.catalog.pricing.cost")} reason={t("dashboard.catalog.pricing.costReason")}>
          <input type="number" disabled className={INPUT} data-testid="catalog-field-cost" />
        </Field>
        <Field label={t("dashboard.catalog.pricing.shownAs")} hint={t("dashboard.catalog.pricing.shownAsHint")}>
          <select
            value={item.priceDisplay}
            disabled={saving}
            data-testid="catalog-field-display"
            onChange={(e) => {
              const mode = e.target.value as OfferingPriceDisplay;
              if (mode === "quote") patch({ priceDisplay: "quote", amountCents: null, bookingMode: "request" });
              else if (mode === "from") patch({ priceDisplay: "from", bookingMode: "request" });
              else patch({ priceDisplay: "exact" });
            }}
            className={INPUT}
          >
            <option value="exact">{t("dashboard.catalog.pricing.display.exact")}</option>
            <option value="from">{t("dashboard.catalog.pricing.display.from")}</option>
            <option value="quote">{t("dashboard.catalog.pricing.display.quote")}</option>
          </select>
        </Field>
        <Field label={t("dashboard.catalog.pricing.currency")}>
          <select
            value={(DEFAULT_CURRENCY_OPTIONS as readonly string[]).includes(item.currency) ? item.currency : DEFAULT_CURRENCY_OPTIONS[0]}
            disabled={saving}
            onChange={(e) => patch({ currency: e.target.value })}
            className={INPUT}
          >
            {DEFAULT_CURRENCY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <SectionHead title={t("dashboard.catalog.pricing.listsTitle")} intro={t("dashboard.catalog.pricing.listsIntro")} />
      <div className={CARD} data-testid="catalog-price-lists" title={t("dashboard.catalog.pricing.listsReason")}>
        <div className="flex items-center gap-[12px] px-[16px] py-[11px] font-admin-body text-[12.5px]">
          <span className="flex-1 font-semibold text-admin-ink">{t("dashboard.catalog.pricing.defaultList")}</span>
          <span className="w-[200px] text-admin-ink-muted">{t("dashboard.catalog.pricing.always")}</span>
          <span className="w-[60px] font-semibold tabular-nums text-admin-ink">{priceText}</span>
          <span className="inline-flex h-[16px] w-[16px] items-center justify-center rounded-[4px] border-[1.5px] border-admin-brand bg-admin-brand text-white">
            <Icon name="check" size={11} stroke={2.5} />
          </span>
        </div>
        <div className="border-t border-admin-border-soft px-[16px] py-[10px]">
          <button type="button" disabled title={t("dashboard.catalog.pricing.listsReason")} data-not-wired="true" className={BUTTON_SMALL}>
            <Icon name="plus" size={12} stroke={1.75} />
            {t("dashboard.catalog.pricing.addRule")}
          </button>
          <span className="ml-[10px] font-admin-body text-[11.5px] text-admin-ink-dim">{t("dashboard.catalog.pricing.listsReason")}</span>
        </div>
      </div>

      <SectionHead
        title={t("dashboard.catalog.pricing.depositTitle")}
        intro={bookable ? t("dashboard.catalog.pricing.depositIntro") : t("dashboard.catalog.pricing.depositProducts")}
      />
      {bookable ? <DepositFields item={item} patch={patch} saving={saving} /> : null}
    </>
  );
}

function DepositFields({ item, patch, saving }: Pick<TabProps, "item" | "patch" | "saving">) {
  const t = useT();
  const instantAllowed = item.priceDisplay === "exact" && item.amountCents != null;
  return (
    <div className="grid grid-cols-3 gap-[14px]" data-testid="catalog-deposit">
      <Field
        label={t("dashboard.catalog.pricing.howBooked")}
        hint={instantAllowed ? t("dashboard.catalog.pricing.howBookedHint") : t("dashboard.catalog.pricing.instantNeedsPrice")}
      >
        <select
          value={item.bookingMode}
          disabled={saving}
          data-testid="catalog-field-booking-mode"
          onChange={(e) => patch({ bookingMode: e.target.value === "instant" ? "instant" : "request" })}
          className={INPUT}
        >
          <option value="request">{t("dashboard.catalog.pricing.booking.request")}</option>
          <option value="instant" disabled={!instantAllowed}>
            {t("dashboard.catalog.pricing.booking.instant")}
          </option>
        </select>
      </Field>
      <Field label={t("dashboard.catalog.pricing.collectUpFront")} hint={item.bookingMode === "instant" ? null : t("dashboard.catalog.pricing.collectHint")}>
        <select
          value={item.reserveMode}
          disabled={saving || item.bookingMode !== "instant"}
          data-testid="catalog-field-reserve-mode"
          onChange={(e) => {
            const v = e.target.value as OfferingReserveMode;
            patch({ reserveMode: v, depositPct: v === "deposit" ? (item.depositPct ?? 30) : null });
          }}
          className={INPUT}
        >
          <option value="full">{t("dashboard.catalog.pricing.reserve.full")}</option>
          <option value="deposit">{t("dashboard.catalog.pricing.reserve.deposit")}</option>
          <option value="free">{t("dashboard.catalog.pricing.reserve.free")}</option>
        </select>
      </Field>
      {item.bookingMode === "instant" && item.reserveMode === "deposit" ? (
        <Field label={t("dashboard.catalog.pricing.depositPct")}>
          <input
            key={`dep-${item.id}-${item.depositPct ?? "x"}`}
            type="number"
            min={1}
            max={99}
            defaultValue={item.depositPct ?? 30}
            disabled={saving}
            onBlur={(e) => {
              const n = Math.round(Number(e.target.value));
              if (Number.isFinite(n) && n > 0 && n < 100 && n !== item.depositPct) patch({ depositPct: n });
            }}
            className={INPUT}
          />
        </Field>
      ) : item.bookingMode === "instant" && item.reserveMode === "free" ? (
        <Field label={t("dashboard.catalog.pricing.holdDays")} hint={t("dashboard.catalog.pricing.holdDaysHint")}>
          <input
            key={`fre-${item.id}-${item.freeReserveExpiresDays ?? "x"}`}
            type="number"
            min={1}
            defaultValue={item.freeReserveExpiresDays ?? ""}
            disabled={saving}
            onBlur={(e) => {
              const raw = e.target.value.trim();
              const n = raw === "" ? null : Math.round(Number(raw));
              const v = n != null && Number.isFinite(n) && n > 0 ? n : null;
              if (v !== item.freeReserveExpiresDays) patch({ freeReserveExpiresDays: v });
            }}
            className={INPUT}
          />
        </Field>
      ) : null}
    </div>
  );
}

export function PricingSide({ item, price, blockers }: { item: TalentOffering; price: string; blockers: string[] }) {
  const t = useT();
  const locale = useDashboardLocale();
  const totals = exampleTotals(item);
  const money = (c: number | null) => (c == null ? t("dashboard.catalog.dash") : formatOfferingPrice(c, item.currency, locale));
  const hasOptions = (item.variants?.length ?? 0) + (item.addOns?.length ?? 0) > 0;
  return (
    <>
      <Eyebrow>{t("dashboard.catalog.side.onCounterTile")}</Eyebrow>
      <div className="flex h-[84px] flex-col justify-between rounded-[14px] border-[1.5px] border-admin-border bg-admin-card p-[12px]" data-testid="catalog-side-tile">
        <div className="font-admin-body text-admin-13 font-semibold text-admin-ink">{item.title || t("dashboard.catalog.untitled")}</div>
        <div className="flex items-center gap-[6px]">
          <span className="font-admin-body text-admin-13 font-bold tabular-nums text-admin-ink">{price}</span>
          {hasOptions ? <StatePill tone="slate">{t("dashboard.catalog.side.optionsPill")}</StatePill> : null}
        </div>
      </div>
      <Eyebrow>{t("dashboard.catalog.side.exampleTotals")}</Eyebrow>
      <div className={`${CARD} px-[16px] py-[12px]`}>
        <TotalRow label={t("dashboard.catalog.side.base")} value={money(totals.baseCents)} />
        <TotalRow
          label={totals.extraLabel ?? t("dashboard.catalog.side.noExtras")}
          value={totals.extraCents == null ? t("dashboard.catalog.dash") : `+${money(totals.extraCents)}`}
          muted={totals.extraCents == null}
        />
        <TotalRow label={t("dashboard.catalog.side.timesTwo")} value={money(totals.timesTwoCents)} />
        <TotalRow label={t("dashboard.catalog.side.tax")} value={t("dashboard.catalog.side.taxUnset")} muted />
      </div>
      <Eyebrow>{t("dashboard.catalog.side.beforePublish")}</Eyebrow>
      {blockers.length === 0 ? (
        <div className="flex items-center gap-[6px] font-admin-body text-[12.5px] text-admin-green" data-testid="catalog-before-publish" data-state="ready">
          <Icon name="check" size={14} stroke={2} />
          {t("dashboard.catalog.side.readyToPublish")}
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-[4px] p-0" data-testid="catalog-before-publish" data-state="blocked">
          {blockers.map((b) => (
            <li key={b} className="flex items-start gap-[6px] font-admin-body text-[12.5px] text-admin-coral-deep">
              <Icon name="alert" size={14} stroke={1.75} />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
