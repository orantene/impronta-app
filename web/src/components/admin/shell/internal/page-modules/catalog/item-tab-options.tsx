"use client";

/**
 * item-tab-options — W04_ProductOptions: `Option groups`, one card per
 * group with its rows (name · price · station code · availability) and
 * `Add option`, then `Add group` / `Copy groups from`, `Notes for
 * preparation` / `Allergy field`, and the right column (`Cashier sees`).
 *
 * TWO GROUPS EXIST IN THE ENGINE and both are wired here through the same
 * child-row writer the talent editor uses (`setWorkspaceMenuItemOptions`,
 * replace-all): OPTIONS (`talent_offering_variants`: the buyer picks exactly
 * one; a row without a price is the base price) and EXTRAS
 * (`talent_offering_addons`: any number stack, each priced). Free-form groups
 * (`catalog_modifier_groups`) have a table and no reader or writer yet, so
 * `Add group`, `Copy groups from`, the station code, per-option availability
 * and the two preparation fields are drawn disabled with their sentence
 * (D-POS-48).
 */

import { useState } from "react";

import { useT } from "@/i18n/use-t";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { Icon } from "../../primitives";
import { setWorkspaceMenuItemOptions } from "@/lib/talent/menu-offerings-actions";
import { formatOfferingPrice, type OfferingAddOn, type OfferingVariant, type TalentOffering } from "@/lib/talent/offerings-types";
import { ActionButton, Outcome, StatePill } from "../appointments-classes-ui";
import type { TabProps } from "./CatalogItemEditor";
import { BUTTON_SMALL, CARD, Eyebrow, Field, INPUT, Note, SectionHead } from "./catalog-ui";

const ROW = "grid grid-cols-[1.4fr_90px_1fr_110px_24px] items-center gap-[10px] px-[16px] py-[8px] font-admin-body text-[12.5px]";

export function OptionsTab({ item, editor, tenantId, isDraft, saving }: TabProps) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  if (isDraft) {
    return (
      <>
        <SectionHead title={t("dashboard.catalog.options.title")} intro={t("dashboard.catalog.options.intro")} />
        <Outcome kind="note" testId="catalog-options-save-first">
          {t("dashboard.catalog.options.saveFirst")}
        </Outcome>
      </>
    );
  }

  const variants = item.variants ?? [];
  const addOns = item.addOns ?? [];

  async function commit(nextVariants: OfferingVariant[], nextAddOns: OfferingAddOn[]) {
    setBusy(true);
    setRefusal(null);
    try {
      const res = await setWorkspaceMenuItemOptions(tenantId, item.id, {
        variants: nextVariants.map((v) => ({ label: v.label, amountCents: v.amountCents })),
        addOns: nextAddOns.map((a) => ({ label: a.label, amountCents: a.amountCents })),
      });
      if (!res.ok) {
        setRefusal(res.error);
        return;
      }
      editor.syncOptions(item.id, res.variants, res.addOns);
    } finally {
      setBusy(false);
    }
  }

  const off = saving || busy;
  return (
    <>
      <SectionHead title={t("dashboard.catalog.options.title")} intro={t("dashboard.catalog.options.intro")} />
      {refusal ? (
        <Outcome kind="refused" testId="catalog-options-refusal">
          {refusal}
        </Outcome>
      ) : null}
      <GroupCard
        item={item}
        name={t("dashboard.catalog.options.groupOptions")}
        rule={t("dashboard.catalog.options.pickOne")}
        required
        rows={variants}
        priceOf={(v) => (v.amountCents == null ? t("dashboard.catalog.options.basePrice") : null)}
        requirePrice={false}
        disabled={off}
        onAdd={(label, cents) => commit([...variants, { id: "", label, amountCents: cents }], addOns)}
        onRemove={(idx) => commit(variants.filter((_, i) => i !== idx), addOns)}
        testId="catalog-options-variants"
      />
      <GroupCard
        item={item}
        name={t("dashboard.catalog.options.groupExtras")}
        rule={t("dashboard.catalog.options.zeroToN").replace("{n}", String(Math.max(addOns.length, 1)))}
        required={false}
        rows={addOns}
        priceOf={() => null}
        requirePrice
        disabled={off}
        onAdd={(label, cents) => (cents == null ? undefined : commit(variants, [...addOns, { id: "", label, amountCents: cents }]))}
        onRemove={(idx) => commit(variants, addOns.filter((_, i) => i !== idx))}
        testId="catalog-options-addons"
      />
      <div className="flex items-center gap-[8px]">
        <button type="button" disabled title={t("dashboard.catalog.options.groupsReason")} data-not-wired="true" className={BUTTON_SMALL} data-testid="catalog-options-add-group">
          <Icon name="plus" size={12} stroke={1.75} />
          {t("dashboard.catalog.options.addGroup")}
        </button>
        <ActionButton reason={t("dashboard.catalog.options.groupsReason")} className="h-[30px]! px-[12px]! text-[12px]!">
          {t("dashboard.catalog.options.copyGroups")}
        </ActionButton>
        <span className="font-admin-body text-[11.5px] text-admin-ink-dim">{t("dashboard.catalog.options.groupsReason")}</span>
      </div>
      <div className="grid grid-cols-2 gap-[14px]">
        <Field label={t("dashboard.catalog.options.prepNotes")} reason={t("dashboard.catalog.options.prepReason")}>
          <input type="text" disabled className={INPUT} />
        </Field>
        <Field label={t("dashboard.catalog.options.allergy")} reason={t("dashboard.catalog.options.prepReason")}>
          <input type="text" disabled className={INPUT} />
        </Field>
      </div>
    </>
  );
}

function GroupCard({
  item,
  name,
  rule,
  required,
  rows,
  priceOf,
  requirePrice,
  disabled,
  onAdd,
  onRemove,
  testId,
}: {
  item: TalentOffering;
  name: string;
  rule: string;
  required: boolean;
  rows: ReadonlyArray<{ id: string; label: string; amountCents: number | null }>;
  priceOf: (row: { amountCents: number | null }) => string | null;
  requirePrice: boolean;
  disabled: boolean;
  onAdd: (label: string, cents: number | null) => void;
  onRemove: (index: number) => void;
  testId: string;
}) {
  const t = useT();
  const locale = useDashboardLocale();
  const [label, setLabel] = useState("");
  const [price, setPrice] = useState("");
  const cents = price.trim() === "" ? null : Math.round(Number(price) * 100);
  const validCents = cents != null && Number.isFinite(cents) && cents >= 0 ? cents : null;
  const canAdd = label.trim().length > 0 && (!requirePrice || validCents != null) && !disabled;

  return (
    <div className={CARD} data-testid={testId}>
      <div className="flex items-center gap-[12px] px-[16px] py-[12px]">
        <span className="flex-1 font-admin-body text-admin-13 font-semibold text-admin-ink">{name}</span>
        <StatePill tone={required ? "coral" : "slate"}>{required ? t("dashboard.catalog.options.required") : t("dashboard.catalog.options.optional")}</StatePill>
        <span className="font-admin-body text-[12px] text-admin-ink-muted">{rule}</span>
        <span className="font-admin-body text-[12px] text-admin-ink-muted">{t("dashboard.catalog.options.pricePerItem")}</span>
      </div>
      {rows.length === 0 ? (
        <p className="m-0 border-t border-admin-border-soft px-[16px] py-[10px] font-admin-body text-[12px] text-admin-ink-muted">{t("dashboard.catalog.options.none")}</p>
      ) : null}
      {rows.map((r, idx) => (
        <div key={r.id || `${r.label}-${idx}`} className={`${ROW} border-t border-admin-border-soft`} data-testid={`${testId}-row`}>
          <span className="truncate text-admin-ink">{r.label}</span>
          <span className="tabular-nums text-admin-ink">
            {priceOf(r) ?? `+${formatOfferingPrice(r.amountCents ?? 0, item.currency, locale)}`}
          </span>
          <span className="text-admin-ink-dim" title={t("dashboard.catalog.options.stationReason")}>
            {t("dashboard.catalog.dash")}
          </span>
          <span className="text-admin-ink-dim" title={t("dashboard.catalog.options.availabilityReason")}>
            {t("dashboard.catalog.dash")}
          </span>
          <button
            type="button"
            aria-label={t("dashboard.catalog.options.remove")}
            disabled={disabled}
            onClick={() => onRemove(idx)}
            className="inline-flex h-[24px] w-[24px] cursor-pointer items-center justify-center rounded-[6px] text-admin-ink-dim hover:bg-admin-surface-alt hover:text-admin-red disabled:cursor-not-allowed"
          >
            <Icon name="x" size={12} stroke={1.75} />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-[8px] border-t border-admin-border-soft px-[16px] py-[8px]">
        <input
          type="text"
          value={label}
          disabled={disabled}
          placeholder={t("dashboard.catalog.options.labelPlaceholder")}
          aria-label={t("dashboard.catalog.options.labelPlaceholder")}
          onChange={(e) => setLabel(e.target.value)}
          className={`${INPUT} h-[28px] max-w-[220px]`}
        />
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={price}
          disabled={disabled}
          placeholder={requirePrice ? t("dashboard.catalog.options.pricePlaceholder") : t("dashboard.catalog.options.priceOptional")}
          aria-label={t("dashboard.catalog.options.pricePlaceholder")}
          onChange={(e) => setPrice(e.target.value)}
          className={`${INPUT} h-[28px] max-w-[120px]`}
        />
        <button
          type="button"
          disabled={!canAdd}
          data-testid={`${testId}-add`}
          onClick={() => {
            onAdd(label.trim(), validCents);
            setLabel("");
            setPrice("");
          }}
          className={`${BUTTON_SMALL} h-[28px]`}
        >
          <Icon name="plus" size={12} stroke={1.75} />
          {t("dashboard.catalog.options.addOption")}
        </button>
      </div>
    </div>
  );
}

export function OptionsSide({ item }: { item: TalentOffering }) {
  const t = useT();
  const variants = item.variants ?? [];
  const addOns = item.addOns ?? [];
  return (
    <>
      <Eyebrow>{t("dashboard.catalog.side.cashierSees")}</Eyebrow>
      <div className={`${CARD} flex flex-col gap-[8px] px-[14px] py-[12px]`} data-testid="catalog-side-cashier">
        <div className="flex items-center gap-[6px] font-admin-body text-[12px] font-semibold text-admin-ink">
          {t("dashboard.catalog.options.groupOptions")}
          <StatePill tone="coral">{t("dashboard.catalog.side.chooseOne")}</StatePill>
        </div>
        {variants.length === 0 ? (
          <p className="m-0 font-admin-body text-[11.5px] text-admin-ink-muted">{t("dashboard.catalog.side.noOptionsYet")}</p>
        ) : (
          <div className="grid grid-cols-4 gap-[4px]">
            {variants.slice(0, 8).map((v, i) => (
              <span
                key={v.id || i}
                className={`inline-flex h-[34px] items-center justify-center truncate rounded-[8px] border px-[4px] font-admin-body text-[11px] font-semibold ${
                  i === 0 ? "border-admin-brand bg-admin-brand-soft text-admin-ink" : "border-admin-border bg-admin-card text-admin-ink"
                }`}
              >
                {v.label}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-[6px] font-admin-body text-[12px] font-semibold text-admin-ink">
          {t("dashboard.catalog.options.groupExtras")}
          <StatePill tone="slate">{t("dashboard.catalog.side.upTo").replace("{n}", String(addOns.length))}</StatePill>
        </div>
        <p className="m-0 font-admin-body text-[11.5px] text-admin-ink-muted">
          {addOns.length === 0 ? t("dashboard.catalog.side.noExtrasYet") : addOns.map((a) => a.label).join(" · ")}
        </p>
      </div>
      <Note>{t("dashboard.catalog.side.perItemNote")}</Note>
    </>
  );
}
