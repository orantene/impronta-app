"use client";

/**
 * item-tab-package — the PackageEditor board's `Composition` card, drawn on
 * a Package item's Details tab (P01 to P03 sell what this card defines).
 *
 * A PACKAGE IS AN OFFERING WITH `offering_components` ROWS (Package 2,
 * closing D-POS-53's composition half). The rows are read through
 * `loadOfferingComponentsAction` and written whole through
 * `setOfferingComponentsAction`; the engine refuses `cycle` (a package in
 * itself) and `overlap` (one component twice) as sentences. The picker is
 * the workspace's own catalog, already loaded by the editor hook. The
 * `Value alloc.` column is the proportional share the refund path uses
 * (`packageRefundShare`: qty x list price over the sum), so what the
 * operator reads here is what a refund would split.
 *
 * Dependencies, manual amounts and the guest preview need rules the engine
 * does not record; they are drawn as one sentence (D-POS-53 keeps them).
 */

import { useEffect, useState } from "react";

import { useT } from "@/i18n/use-t";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { Icon } from "../../primitives";
import { formatOfferingPrice, type TalentOffering } from "@/lib/talent/offerings-types";
import { loadOfferingComponentsAction, type OfferingComponentRow } from "@/lib/server-actions/catalog-engine-reads";
import { setOfferingComponentsAction } from "@/lib/server-actions/scheduling-engine";
import { ActionButton, Outcome, StatePill } from "../appointments-classes-ui";
import type { TabProps } from "./CatalogItemEditor";
import { engineRefusalKey, packageAllocation } from "./catalog-model";
import { BUTTON_SMALL, CARD, INPUT, ListHead, ListRow, Note, SectionHead } from "./catalog-ui";

const COLS = "grid-cols-[1.6fr_110px_80px_1fr_110px_28px]";

const KIND_KEY: Record<TalentOffering["kind"], string> = {
  product: "dashboard.catalog.type.product",
  service: "dashboard.catalog.type.service",
  package: "dashboard.catalog.type.package",
};

export function PackageComposition({ item, editor, isDraft, saving }: TabProps) {
  const t = useT();
  const locale = useDashboardLocale();
  const [rows, setRows] = useState<OfferingComponentRow[] | null>(null);
  const [loadFailed, setLoadFailed] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ kind: "refused" | "done"; text: string } | null>(null);

  useEffect(() => {
    if (isDraft) return;
    let cancelled = false;
    setLoadFailed(null);
    void loadOfferingComponentsAction(item.id).then((res) => {
      if (cancelled) return;
      if (res.ok) setRows(res.components);
      else setLoadFailed(t(engineRefusalKey(res.reason)));
    });
    return () => {
      cancelled = true;
    };
  }, [item.id, isDraft, t]);

  const catalog = editor.items.filter((o) => o.id !== item.id);
  const byId = new Map<string, TalentOffering>(catalog.map((o) => [o.id, o]));

  if (isDraft) {
    return (
      <>
        <SectionHead title={t("dashboard.catalog.package.title")} intro={t("dashboard.catalog.package.intro")} />
        <Outcome kind="note" testId="catalog-package-save-first">
          {t("dashboard.catalog.options.saveFirst")}
        </Outcome>
      </>
    );
  }

  const current = rows ?? [];
  const shares = packageAllocation(
    item.amountCents,
    current.map((r) => ({ qty: r.qty, unitCents: byId.get(r.componentOfferingId)?.amountCents ?? null })),
  );
  const money = (c: number | null) => (c == null ? t("dashboard.catalog.dash") : formatOfferingPrice(c, item.currency, locale));
  const off = saving || busy || rows === null;

  function update(i: number, patch: Partial<OfferingComponentRow>) {
    setRows((cur) => (cur ? cur.map((r, j) => (j === i ? { ...r, ...patch } : r)) : cur));
    setDirty(true);
    setOutcome(null);
  }

  async function save() {
    if (!rows) return;
    setBusy(true);
    setOutcome(null);
    try {
      const res = await setOfferingComponentsAction({ offeringId: item.id, components: rows });
      if (!res.ok) {
        setOutcome({ kind: "refused", text: t(engineRefusalKey(res.reason)) });
        return;
      }
      setDirty(false);
      setOutcome({ kind: "done", text: t("dashboard.catalog.package.saved") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SectionHead title={t("dashboard.catalog.package.title")} intro={t("dashboard.catalog.package.intro")} />
      {loadFailed ? (
        <Outcome kind="refused" testId="catalog-package-load-failed">
          {loadFailed}
        </Outcome>
      ) : null}
      {outcome ? (
        <Outcome kind={outcome.kind} testId="catalog-package-outcome">
          {outcome.text}
        </Outcome>
      ) : null}
      <div className={CARD} data-testid="catalog-package-composition">
        <ListHead cols={COLS}>
          <span>{t("dashboard.catalog.package.col.component")}</span>
          <span>{t("dashboard.catalog.package.col.included")}</span>
          <span>{t("dashboard.catalog.package.col.qty")}</span>
          <span>{t("dashboard.catalog.package.col.listPrice")}</span>
          <span>{t("dashboard.catalog.package.col.alloc")}</span>
          <span />
        </ListHead>
        {rows === null && !loadFailed ? (
          <div className="px-[18px] py-[12px] font-admin-body text-[12.5px] text-admin-ink-muted">{t("dashboard.catalog.loading")}</div>
        ) : null}
        {rows !== null && rows.length === 0 ? (
          <div className="px-[18px] py-[12px] font-admin-body text-[12.5px] text-admin-ink-muted">{t("dashboard.catalog.package.none")}</div>
        ) : null}
        {current.map((row, i) => {
          const component = byId.get(row.componentOfferingId) ?? null;
          return (
            <ListRow key={`${row.componentOfferingId}-${i}`} cols={COLS} testId={`catalog-package-row-${i}`}>
              <select
                value={row.componentOfferingId}
                disabled={off}
                aria-label={t("dashboard.catalog.package.col.component")}
                onChange={(e) => update(i, { componentOfferingId: e.target.value })}
                className={INPUT}
              >
                <option value="">{t("dashboard.catalog.package.pick")}</option>
                {catalog.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title || t("dashboard.catalog.untitled")}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={off}
                onClick={() => update(i, { required: !row.required })}
                aria-pressed={row.required}
                className="inline-flex cursor-pointer items-center border-0 bg-transparent p-0 disabled:cursor-not-allowed"
              >
                <StatePill tone={row.required ? "indigo" : "slate"}>
                  {row.required ? t("dashboard.catalog.package.required") : t("dashboard.catalog.package.optional")}
                </StatePill>
              </button>
              <input
                type="number"
                min={1}
                value={row.qty}
                disabled={off}
                aria-label={t("dashboard.catalog.package.col.qty")}
                onChange={(e) => {
                  const n = Math.round(Number(e.target.value));
                  update(i, { qty: Number.isFinite(n) && n >= 1 ? n : 1 });
                }}
                className={INPUT}
              />
              <span className="text-admin-ink-muted">
                {component ? `${t(KIND_KEY[component.kind])} · ${money(component.amountCents)}` : t("dashboard.catalog.dash")}
              </span>
              <span className="font-semibold tabular-nums">{money(shares[i] ?? null)}</span>
              <button
                type="button"
                disabled={off}
                aria-label={t("dashboard.catalog.package.remove")}
                title={t("dashboard.catalog.package.remove")}
                onClick={() => {
                  setRows((cur) => (cur ? cur.filter((_, j) => j !== i) : cur));
                  setDirty(true);
                  setOutcome(null);
                }}
                className="inline-flex h-[24px] w-[24px] cursor-pointer items-center justify-center rounded-[6px] border-0 bg-transparent text-admin-ink-muted hover:bg-admin-surface-alt disabled:cursor-not-allowed"
              >
                <Icon name="x" size={12} stroke={1.75} />
              </button>
            </ListRow>
          );
        })}
        <div className="flex items-center gap-[10px] border-t border-admin-border-soft px-[16px] py-[10px]">
          <button
            type="button"
            disabled={off || catalog.length === 0}
            data-testid="catalog-package-add"
            onClick={() => {
              setRows((cur) => [...(cur ?? []), { componentOfferingId: "", qty: 1, required: true }]);
              setDirty(true);
              setOutcome(null);
            }}
            className={BUTTON_SMALL}
          >
            <Icon name="plus" size={12} stroke={1.75} />
            {t("dashboard.catalog.package.add")}
          </button>
          <span className="flex-1 font-admin-body text-[11.5px] text-admin-ink-dim">
            {catalog.length === 0 ? t("dashboard.catalog.package.emptyCatalog") : t("dashboard.catalog.package.addHint")}
          </span>
          <ActionButton
            tone="primary"
            onClick={() => void save()}
            disabled={off || !dirty || current.some((r) => !r.componentOfferingId)}
            testId="catalog-package-save"
          >
            {t("dashboard.catalog.package.save")}
          </ActionButton>
        </div>
      </div>
      <Note>{t("dashboard.catalog.package.allocationNote")}</Note>
      <Note tone="warn">{t("dashboard.catalog.package.dependenciesReason")}</Note>
    </>
  );
}
