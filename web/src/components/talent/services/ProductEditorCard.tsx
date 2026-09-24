"use client";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import type { TalentOffering } from "@/lib/talent/offerings-types";

const LABEL = "text-[11px] font-semibold uppercase tracking-[0.1em] text-admin-ink-dim";
const INPUT =
  "mt-1.5 w-full rounded-lg border border-admin-border-soft bg-white px-3 py-2.5 text-[15px] text-admin-ink outline-none focus:border-emerald-900/50";

type Fulfillment = {
  pickup?: { enabled?: boolean; address?: string };
  ship?: { enabled?: boolean; feeCents?: number; leadTime?: string; region?: string };
  appointment?: { enabled?: boolean };
};

export function ProductEditorCard({
  item,
  onChange,
}: {
  item: TalentOffering;
  onChange: (next: TalentOffering) => void;
}) {
  const copy = useDashboardText();
  const whenSoldOut = String(item.attributes?.whenSoldOut ?? "show");
  const fulfillment = (item.attributes?.fulfillment ?? {}) as Fulfillment;
  const variants = item.variants ?? [];

  const setAttr = (key: string, value: unknown) =>
    onChange({ ...item, attributes: { ...(item.attributes ?? {}), [key]: value } });
  const setFulfillment = (next: Fulfillment) => setAttr("fulfillment", next);

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-admin-ink-dim">{copy.t("Step 3 of 4 · price, stock and handover")}</p>
      <p className="rounded-xl bg-black/[0.03] px-4 py-3 text-[13.5px] text-admin-ink">
        {copy.t("A product")} · {item.title || copy.t("Untitled")}
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className={LABEL}>{copy.t("Price")}</span>
          <div className="relative">
            <input
              type="number"
              min={0}
              className={`${INPUT} pr-14`}
              value={item.amountCents != null ? item.amountCents / 100 : ""}
              onChange={(e) =>
                onChange({ ...item, amountCents: e.target.value ? Math.round(Number(e.target.value) * 100) : null })
              }
            />
            <span className="pointer-events-none absolute right-3 top-1/2 mt-[3px] -translate-y-1/2 text-[14px] text-admin-ink-dim">
              {item.currency}
            </span>
          </div>
        </label>
        <label className="block">
          <span className={LABEL}>{copy.t("How many do you have?")}</span>
          <input
            type="number"
            min={0}
            className={INPUT}
            placeholder={copy.t("Leave empty if you make each one to order")}
            value={item.inventoryQty ?? ""}
            onChange={(e) => onChange({ ...item, inventoryQty: e.target.value === "" ? null : Number(e.target.value) })}
          />
        </label>
        <label className="block">
          <span className={LABEL}>{copy.t("When it hits zero")}</span>
          <select className={INPUT} value={whenSoldOut} onChange={(e) => setAttr("whenSoldOut", e.target.value)}>
            <option value="show">{copy.t("Show 'Sold out', keep the page")}</option>
            <option value="hide">{copy.t("Hide it")}</option>
          </select>
        </label>
      </div>

      <div>
        <p className={LABEL}>{copy.t("Does the buyer choose a size or version?")}</p>
        <ul className="mt-2 space-y-2">
          {variants.map((v, i) => (
            <li key={v.id || i} className="flex flex-wrap items-center gap-2 rounded-xl border border-admin-border-soft px-3 py-2">
              <input
                className="min-w-0 flex-1 rounded-lg border border-admin-border-soft px-2 py-1.5 text-[14px]"
                value={v.label}
                onChange={(e) => {
                  const next = variants.map((row, idx) => (idx === i ? { ...row, label: e.target.value } : row));
                  onChange({ ...item, variants: next });
                }}
              />
              <label className="flex items-center gap-1 text-[13px]">
                <input
                  type="checkbox"
                  checked={v.amountCents == null}
                  onChange={(e) => {
                    const next = variants.map((row, idx) =>
                      idx === i ? { ...row, amountCents: e.target.checked ? null : item.amountCents } : row,
                    );
                    onChange({ ...item, variants: next });
                  }}
                />
                {copy.t("same price")}
              </label>
              {v.amountCents != null && (
                <input
                  type="number"
                  className="w-24 rounded-lg border border-admin-border-soft px-2 py-1.5 text-[14px]"
                  value={v.amountCents / 100}
                  onChange={(e) => {
                    const next = variants.map((row, idx) =>
                      idx === i ? { ...row, amountCents: Math.round(Number(e.target.value) * 100) } : row,
                    );
                    onChange({ ...item, variants: next });
                  }}
                />
              )}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="mt-2 text-[13px] font-semibold text-admin-brand"
          onClick={() =>
            onChange({
              ...item,
              variants: [...variants, { id: `tmp-${variants.length}`, label: "", amountCents: null }],
            })
          }
        >
          + {copy.t("Add a size or version")}
        </button>
        <p className="mt-2 text-[12.5px] text-admin-ink-dim">
          {copy.t("They pick one. To let them add things on top (a second set, a glue kit) use an extra instead.")}
        </p>
      </div>

      <div>
        <p className={LABEL}>{copy.t("How does it get to them?")}</p>
        <div className="mt-2 grid gap-2">
          <label className={`rounded-xl border px-4 py-3 text-[14px] ${fulfillment.pickup?.enabled ? "border-emerald-900/50 bg-emerald-900/[0.04]" : "border-admin-border-soft"}`}>
            <input
              type="checkbox"
              className="mr-2"
              checked={Boolean(fulfillment.pickup?.enabled)}
              onChange={(e) =>
                setFulfillment({
                  ...fulfillment,
                  pickup: { ...fulfillment.pickup, enabled: e.target.checked, address: fulfillment.pickup?.address ?? "" },
                })
              }
            />
            {copy.t("Pick up at the studio")}
            {fulfillment.pickup?.enabled && (
              <input
                className={`${INPUT} mt-2`}
                placeholder={copy.t("ready the same day")}
                value={fulfillment.pickup.address ?? ""}
                onChange={(e) =>
                  setFulfillment({ ...fulfillment, pickup: { ...fulfillment.pickup, enabled: true, address: e.target.value } })
                }
              />
            )}
          </label>
          <label className={`rounded-xl border px-4 py-3 text-[14px] ${fulfillment.ship?.enabled ? "border-emerald-900/50 bg-emerald-900/[0.04]" : "border-admin-border-soft"}`}>
            <input
              type="checkbox"
              className="mr-2"
              checked={Boolean(fulfillment.ship?.enabled)}
              onChange={(e) =>
                setFulfillment({
                  ...fulfillment,
                  ship: {
                    enabled: e.target.checked,
                    feeCents: fulfillment.ship?.feeCents ?? 12000,
                    leadTime: fulfillment.ship?.leadTime ?? "3–5 days",
                    region: "MX",
                  },
                })
              }
            />
            {copy.t("Ship it")}
            {fulfillment.ship?.enabled && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <input
                  type="number"
                  className={INPUT}
                  value={(fulfillment.ship.feeCents ?? 0) / 100}
                  onChange={(e) =>
                    setFulfillment({
                      ...fulfillment,
                      ship: { ...fulfillment.ship, enabled: true, feeCents: Math.round(Number(e.target.value) * 100) },
                    })
                  }
                />
                <input
                  className={INPUT}
                  value={fulfillment.ship.leadTime ?? ""}
                  onChange={(e) =>
                    setFulfillment({ ...fulfillment, ship: { ...fulfillment.ship, enabled: true, leadTime: e.target.value } })
                  }
                />
              </div>
            )}
            <p className="mt-1 text-[12.5px] text-admin-ink-dim">{copy.t("Mexico only · 120 MXN · 3–5 days")}</p>
          </label>
          <label className={`rounded-xl border px-4 py-3 text-[14px] ${fulfillment.appointment?.enabled ? "border-emerald-900/50 bg-emerald-900/[0.04]" : "border-admin-border-soft"}`}>
            <input
              type="checkbox"
              className="mr-2"
              checked={Boolean(fulfillment.appointment?.enabled)}
              onChange={(e) => setFulfillment({ ...fulfillment, appointment: { enabled: e.target.checked } })}
            />
            {copy.t("Hand over at their appointment")}
            <p className="mt-1 text-[12.5px] text-admin-ink-dim">{copy.t("Only for clients with a booking")}</p>
          </label>
        </div>
        <p className="mt-2 text-[12.5px] text-admin-ink-dim">
          {copy.t("Payment is taken in full when they buy. It shows in Money as collected the moment it sells and never touches your calendar.")}
        </p>
      </div>
    </div>
  );
}
