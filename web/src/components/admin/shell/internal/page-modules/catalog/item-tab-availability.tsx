"use client";

/**
 * item-tab-availability — W05_ProductAvailability: the four mode cards
 * (Unlimited · Stock pool · Dated batches · Session pool), the batches
 * table, the four rules (low-stock warning, when sold out, lead time,
 * cancellation), then `Fulfillment & preparation` as its own tab, and the
 * right column (`POS behaviour`).
 *
 * WIRED: Unlimited and Stock pool, through the capacity RPC
 * (`setMenuItemStockAction`: a number is AVAILABLE NOW, the pool total
 * becomes that plus what open orders hold), and the cancellation window
 * (`cancellation_hours`). `When sold out` is the engine's own rule, shown
 * locked. NOT WIRED, each with its sentence: dated batches and session pools
 * on this row (D-POS-49), the low-stock threshold and lead time, and every
 * fulfillment field (no station, prep time or course column) (D-POS-46).
 */

import { useState } from "react";

import { useT } from "@/i18n/use-t";
import { Icon } from "../../primitives";
import { setMenuItemStockAction } from "@/lib/talent/menu-offerings-actions";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import { FactRow, Outcome } from "../appointments-classes-ui";
import type { TabProps } from "./CatalogItemEditor";
import { itemAvailability } from "./catalog-model";
import { BUTTON_SMALL, CARD, Eyebrow, Field, INPUT, ListHead, ModeCard, Note, SectionHead } from "./catalog-ui";

export function AvailabilityTab({ item, patch, editor, tenantId, isDraft, saving }: TabProps) {
  const t = useT();
  const avail = itemAvailability(item);
  const [raw, setRaw] = useState(item.inventoryQty == null ? "" : String(item.inventoryQty));
  const [held, setHeld] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [mode, setMode] = useState<"unlimited" | "stock">(avail.mode);

  async function commitStock(next: number | null) {
    setBusy(true);
    setRefusal(null);
    try {
      const res = await setMenuItemStockAction(tenantId, item.id, next);
      if (!res.ok) {
        setRefusal(res.error);
        return;
      }
      setHeld(res.held);
      setRaw(res.available == null ? "" : String(res.available));
      editor.syncStock(item.id, res.available);
    } finally {
      setBusy(false);
    }
  }

  const off = saving || busy || isDraft;
  const draftReason = isDraft ? t("dashboard.catalog.options.saveFirst") : null;

  return (
    <>
      <SectionHead title={t("dashboard.catalog.availability.title")} intro={t("dashboard.catalog.availability.intro")} />
      {refusal ? (
        <Outcome kind="refused" testId="catalog-stock-refusal">
          {refusal}
        </Outcome>
      ) : null}
      <div role="radiogroup" aria-label={t("dashboard.catalog.availability.title")} className="grid grid-cols-4 gap-[10px]">
        <ModeCard
          title={t("dashboard.catalog.availability.mode.unlimited")}
          note={t("dashboard.catalog.availability.mode.unlimitedNote")}
          active={mode === "unlimited"}
          reason={draftReason}
          testId="catalog-mode-unlimited"
          onSelect={() => {
            setMode("unlimited");
            if (item.inventoryQty != null) void commitStock(null);
          }}
        />
        <ModeCard
          title={t("dashboard.catalog.availability.mode.stock")}
          note={t("dashboard.catalog.availability.mode.stockNote")}
          active={mode === "stock"}
          reason={draftReason}
          testId="catalog-mode-stock"
          onSelect={() => setMode("stock")}
        />
        <ModeCard
          title={t("dashboard.catalog.availability.mode.batches")}
          note={t("dashboard.catalog.availability.mode.batchesNote")}
          active={false}
          reason={t("dashboard.catalog.availability.batchesReason")}
          testId="catalog-mode-batches"
        />
        <ModeCard
          title={t("dashboard.catalog.availability.mode.session")}
          note={t("dashboard.catalog.availability.mode.sessionNote")}
          active={false}
          reason={t("dashboard.catalog.availability.sessionReason")}
          testId="catalog-mode-session"
        />
      </div>

      {mode === "stock" ? (
        <div className="grid grid-cols-4 gap-[14px]">
          <Field
            label={t("dashboard.catalog.availability.availableNow")}
            hint={held != null && held > 0 ? t("dashboard.catalog.availability.held").replace("{n}", String(held)) : t("dashboard.catalog.availability.availableHint")}
          >
            <input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={raw}
              disabled={off}
              data-testid="catalog-field-stock"
              onChange={(e) => setRaw(e.target.value)}
              onBlur={() => {
                const trimmed = raw.trim();
                const next = trimmed === "" ? null : Math.max(0, Math.trunc(Number(trimmed)));
                if (trimmed !== "" && !Number.isFinite(next)) return;
                if (next !== item.inventoryQty) void commitStock(next);
              }}
              className={INPUT}
            />
          </Field>
        </div>
      ) : null}

      <div className={CARD} data-testid="catalog-batches" title={t("dashboard.catalog.availability.batchesReason")}>
        <ListHead cols="grid-cols-[1.2fr_80px_80px_1fr_1fr_30px]">
          <span>{t("dashboard.catalog.availability.batch.batch")}</span>
          <span>{t("dashboard.catalog.availability.batch.made")}</span>
          <span>{t("dashboard.catalog.availability.batch.left")}</span>
          <span>{t("dashboard.catalog.availability.batch.window")}</span>
          <span>{t("dashboard.catalog.availability.batch.release")}</span>
          <span />
        </ListHead>
        <p className="m-0 border-t border-admin-border-soft px-[18px] py-[10px] font-admin-body text-[12px] text-admin-ink-muted">
          {t("dashboard.catalog.availability.batchesReason")}
        </p>
        <div className="flex items-center gap-[8px] border-t border-admin-border-soft px-[16px] py-[10px]">
          <button type="button" disabled data-not-wired="true" title={t("dashboard.catalog.availability.batchesReason")} className={BUTTON_SMALL}>
            <Icon name="plus" size={12} stroke={1.75} />
            {t("dashboard.catalog.availability.addBatch")}
          </button>
          <button type="button" disabled data-not-wired="true" title={t("dashboard.catalog.availability.batchesReason")} className={BUTTON_SMALL}>
            {t("dashboard.catalog.availability.repeatWeekly")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-[14px]">
        <Field label={t("dashboard.catalog.availability.lowStock")} reason={t("dashboard.catalog.availability.lowStockReason")}>
          <input type="number" disabled className={INPUT} />
        </Field>
        <Field label={t("dashboard.catalog.availability.whenSoldOut")} hint={t("dashboard.catalog.availability.whenSoldOutHint")}>
          <select disabled className={INPUT} data-testid="catalog-field-sold-out">
            <option>{t("dashboard.catalog.availability.soldOutRule")}</option>
          </select>
        </Field>
        <Field label={t("dashboard.catalog.availability.leadTime")} reason={t("dashboard.catalog.availability.leadTimeReason")}>
          <input type="text" disabled className={INPUT} />
        </Field>
        <Field label={t("dashboard.catalog.availability.cancellation")} hint={t("dashboard.catalog.availability.cancellationHint")}>
          <input
            key={`cx-${item.id}-${item.cancellationHours ?? "x"}`}
            type="number"
            min={0}
            defaultValue={item.cancellationHours ?? ""}
            disabled={saving}
            data-testid="catalog-field-cancellation"
            onBlur={(e) => {
              const v = e.target.value.trim();
              const n = v === "" ? null : Math.round(Number(v));
              const next = n != null && Number.isFinite(n) && n >= 0 ? n : null;
              if (next !== item.cancellationHours) patch({ cancellationHours: next });
            }}
            className={INPUT}
          />
        </Field>
      </div>
    </>
  );
}

export function FulfillmentTab(_props: TabProps) {
  const t = useT();
  const reason = t("dashboard.catalog.fulfillment.reason");
  return (
    <>
      <SectionHead title={t("dashboard.catalog.fulfillment.title")} intro={t("dashboard.catalog.fulfillment.intro")} />
      <div className="grid grid-cols-4 gap-[14px]" data-testid="catalog-fulfillment">
        <Field label={t("dashboard.catalog.fulfillment.fulfillment")} reason={reason} hint={t("dashboard.catalog.fulfillment.fulfillmentHint")}>
          <select disabled className={INPUT}>
            <option>{t("dashboard.catalog.fulfillment.handoffNow")}</option>
          </select>
        </Field>
        <Field label={t("dashboard.catalog.fulfillment.station")} reason={reason}>
          <select disabled className={INPUT}>
            <option>{t("dashboard.catalog.dash")}</option>
          </select>
        </Field>
        <Field label={t("dashboard.catalog.fulfillment.prepTime")} reason={reason}>
          <input type="text" disabled className={INPUT} />
        </Field>
        <Field label={t("dashboard.catalog.fulfillment.course")} reason={reason}>
          <select disabled className={INPUT}>
            <option>{t("dashboard.catalog.dash")}</option>
          </select>
        </Field>
      </div>
    </>
  );
}

export function AvailabilitySide({ item }: { item: TalentOffering }) {
  const t = useT();
  const avail = itemAvailability(item);
  const tile =
    avail.mode === "unlimited"
      ? t("dashboard.catalog.availability.unlimited")
      : avail.soldOut
        ? t("dashboard.catalog.availability.soldOut")
        : avail.left == null
          ? t("dashboard.catalog.availability.stockPool")
          : t("dashboard.catalog.availability.stockLeft").replace("{n}", String(avail.left));
  return (
    <>
      <Eyebrow>{t("dashboard.catalog.side.posBehaviour")}</Eyebrow>
      <div className={`${CARD} px-[16px] py-[8px]`} data-testid="catalog-side-pos">
        <FactRow label={t("dashboard.catalog.side.counterTile")}>{tile}</FactRow>
        <FactRow label={t("dashboard.catalog.side.soldOutOnCharge")}>{t("dashboard.catalog.side.soldOutOnChargeValue")}</FactRow>
        <FactRow label={t("dashboard.catalog.availability.cancellation")}>
          {item.cancellationHours == null
            ? t("dashboard.catalog.side.cancelFlexible")
            : t("dashboard.catalog.side.cancelHours").replace("{n}", String(item.cancellationHours))}
        </FactRow>
        <FactRow label={t("dashboard.catalog.side.kitchen")} muted>
          {t("dashboard.catalog.dash")}
        </FactRow>
      </div>
      <Note>{t("dashboard.catalog.side.poolNote")}</Note>
    </>
  );
}
