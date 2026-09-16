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
 * Dependencies and manual amounts need rules the engine does not record;
 * the board's two cards under the table say so (Dependencies as one
 * sentence, `Manual amounts` disabled with its reason) (D-POS-53 keeps
 * them). The right column is the board's `Guest preview · Configure`, drawn
 * from the same rows: a required component locked, an optional one a box.
 */

import { useEffect, useState } from "react";

import { useT } from "@/i18n/use-t";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { Icon } from "../../primitives";
import type { OfferingsEditor } from "@/components/talent/services/use-offerings-editor";
import { formatOfferingPrice, type TalentOffering } from "@/lib/talent/offerings-types";
import { loadOfferingComponentsAction, type OfferingComponentRow } from "@/lib/server-actions/catalog-engine-reads";
import { setOfferingComponentsAction } from "@/lib/server-actions/scheduling-engine";
import { ActionButton, Outcome } from "../appointments-classes-ui";
import type { TabProps } from "./CatalogItemEditor";
import { engineRefusalKey, packageAllocation } from "./catalog-model";
import { AddPill, BlockPill, CARD, DragHandle, Eyebrow, INPUT, ListHead, ListRow, ModeCard, Note, SectionHead, SELECT, SelectShell } from "./catalog-ui";

const COLS = "grid-cols-[12px_1.6fr_110px_80px_1fr_110px_22px]";

/** The composition card tells the right column it saved, so the guest preview re-reads the same rows. */
const SAVED_EVENT = "catalog:package-saved";

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
      window.dispatchEvent(new CustomEvent(SAVED_EVENT, { detail: item.id }));
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
          <span />
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
              <DragHandle reason={t("dashboard.catalog.options.reorderReason")} />
              <SelectShell><select
                value={row.componentOfferingId}
                disabled={off}
                aria-label={t("dashboard.catalog.package.col.component")}
                onChange={(e) => update(i, { componentOfferingId: e.target.value })}
                className={SELECT}
              >
                <option value="">{t("dashboard.catalog.package.pick")}</option>
                {catalog.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title || t("dashboard.catalog.untitled")}
                  </option>
                ))}
              </select></SelectShell>
              <button
                type="button"
                disabled={off}
                onClick={() => update(i, { required: !row.required })}
                aria-pressed={row.required}
                className="flex w-full cursor-pointer items-center border-0 bg-transparent p-0 disabled:cursor-not-allowed"
              >
                <BlockPill tone={row.required ? "green" : "slate"}>
                  {row.required ? t("dashboard.catalog.package.required") : t("dashboard.catalog.package.optional")}
                </BlockPill>
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
                className="inline-flex h-[18px] w-[22px] cursor-pointer items-center justify-center rounded-[5px] border-0 bg-transparent text-admin-ink-muted hover:bg-admin-surface-alt disabled:cursor-not-allowed"
              >
                <Icon name="x" size={12} stroke={1.75} />
              </button>
            </ListRow>
          );
        })}
        <div className="flex items-center gap-[10px] border-t border-admin-border-soft px-[16px] py-[11px]">
          <AddPill
            disabled={off || catalog.length === 0}
            testId="catalog-package-add"
            onClick={() => {
              setRows((cur) => [...(cur ?? []), { componentOfferingId: "", qty: 1, required: true }]);
              setDirty(true);
              setOutcome(null);
            }}
          >
            {t("dashboard.catalog.package.add")}
          </AddPill>
          <span className="flex-1 font-admin-body text-[11.5px] leading-[1.2] text-admin-ink-dim">
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
      {/* The board's two cards under the table: Dependencies (not recorded) and Allocation method (proportional is the engine's rule). */}
      <div className="grid grid-cols-2 gap-[16px]">
        <div className={`${CARD} px-[16px] py-[14px]`} data-testid="catalog-package-dependencies" title={t("dashboard.catalog.package.dependenciesReason")}>
          <h3 className="m-0 font-admin-body text-[13.5px]! font-semibold leading-[1.2] text-admin-ink">{t("dashboard.catalog.package.dependencies")}</h3>
          <p className="m-0 mt-[10px] font-admin-body text-[12.5px] leading-[1.4] text-admin-ink-muted">{t("dashboard.catalog.package.dependenciesReason")}</p>
        </div>
        <div className={`${CARD} px-[16px] py-[14px]`} data-testid="catalog-package-allocation">
          <h3 className="m-0 font-admin-body text-[13.5px]! font-semibold leading-[1.2] text-admin-ink">{t("dashboard.catalog.package.allocationMethod")}</h3>
          <div role="radiogroup" aria-label={t("dashboard.catalog.package.allocationMethod")} className="mt-[12px] flex flex-col gap-[8px]">
            <ModeCard title={t("dashboard.catalog.package.proportional")} note={t("dashboard.catalog.package.proportionalNote")} active onSelect={() => undefined} />
            <ModeCard title={t("dashboard.catalog.package.manual")} note={t("dashboard.catalog.package.manualNote")} active={false} reason={t("dashboard.catalog.package.manualReason")} />
          </div>
          <p className="m-0 mt-[12px] font-admin-body text-[12px] leading-[1.35] text-admin-ink-muted">
            {shares.length > 0 && shares.every((c) => c != null)
              ? `${shares.map((c) => money(c)).join(" + ")} = ${money(item.amountCents)} ✓ · `
              : ""}
            {t("dashboard.catalog.package.allocationNote")}
          </p>
        </div>
      </div>
    </>
  );
}

/** The PackageEditor board's right column: what the guest configures, drawn from the saved rows. */
export function PackageSide({ item, editor, price }: { item: TalentOffering; editor: OfferingsEditor; price: string }) {
  const t = useT();
  const locale = useDashboardLocale();
  const [rows, setRows] = useState<OfferingComponentRow[]>([]);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      void loadOfferingComponentsAction(item.id).then((res) => {
        if (!cancelled && res.ok) setRows(res.components);
      });
    load();
    const onSaved = (e: Event) => {
      if ((e as CustomEvent<string>).detail === item.id) load();
    };
    window.addEventListener(SAVED_EVENT, onSaved);
    return () => {
      cancelled = true;
      window.removeEventListener(SAVED_EVENT, onSaved);
    };
  }, [item.id]);
  const byId = new Map<string, TalentOffering>(editor.items.map((o) => [o.id, o]));
  const money = (c: number | null) => (c == null ? t("dashboard.catalog.dash") : formatOfferingPrice(c, item.currency, locale));
  return (
    <>
      <Eyebrow>{t("dashboard.catalog.package.guestPreview")}</Eyebrow>
      <div className={`${CARD} flex flex-col gap-[8px] px-[16px] py-[16px] leading-[1.2]`} data-testid="catalog-side-package">
        <div className="mb-[4px] font-admin-body text-[15px] font-semibold text-admin-ink">{item.title || t("dashboard.catalog.untitled")}</div>
        {rows.length === 0 ? <p className="m-0 font-admin-body text-[12px] text-admin-ink-muted">{t("dashboard.catalog.package.none")}</p> : null}
        {rows.map((r, i) => {
          const c = byId.get(r.componentOfferingId) ?? null;
          return (
            <div key={`${r.componentOfferingId}-${i}`} className="flex items-center gap-[10px] rounded-[10px] border border-admin-border px-[12px] py-[9px]">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-admin-body text-[13px] font-semibold text-admin-ink">
                  {c?.title || t("dashboard.catalog.untitled")}
                  {r.qty > 1 ? ` × ${r.qty}` : ""}
                </span>
                <span className="mt-[2px] block truncate font-admin-body text-[11.5px] text-admin-ink-muted">
                  {c ? `${t(KIND_KEY[c.kind])} · ${money(c.amountCents)}` : t("dashboard.catalog.dash")}
                </span>
              </span>
              {r.required ? (
                <span className="text-admin-ink-dim" title={t("dashboard.catalog.package.required")} aria-label={t("dashboard.catalog.package.required")}>
                  <Icon name="lock" size={13} stroke={1.75} />
                </span>
              ) : (
                <span aria-label={t("dashboard.catalog.package.optional")} className="inline-flex h-[16px] w-[16px] items-center justify-center rounded-[4px] border-[1.5px] border-admin-border-strong bg-admin-card" />
              )}
            </div>
          );
        })}
        <div className="mt-[4px] flex items-center justify-between border-t border-admin-border-soft pt-[10px] font-admin-body text-[13px]">
          <span className="text-admin-ink-muted">{t("dashboard.catalog.package.total")}</span>
          <span className="font-bold tabular-nums text-admin-ink">{price}</span>
        </div>
        <p className="m-0 font-admin-body text-[11.5px] leading-[1.3] text-admin-ink-dim">{t("dashboard.catalog.package.holdsNote")}</p>
      </div>
      <Note>{t("dashboard.catalog.package.dependenciesReason")}</Note>
    </>
  );
}
