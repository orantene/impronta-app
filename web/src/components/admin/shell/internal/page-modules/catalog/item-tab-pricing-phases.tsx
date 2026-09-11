"use client";

/**
 * item-tab-pricing-phases — `Price phases` on W03's Pricing tab: the dated
 * prices E02 sells against (Early bird until 4 Sep, Standard until the door).
 *
 * WIRED (Package 2). Rows are `offering_price_phases` through
 * `loadOfferingPricePhasesAction`; `Add phase` writes one through
 * `setOfferingPricePhaseAction`; the engine refuses `overlap` (an end before
 * its start) and `invalid` as sentences. A phase never changes a line
 * already priced (the phase id is stamped on first price), which the note
 * says in the operator's words. There is no writer that edits or removes a
 * phase, so `Remove` is drawn disabled with that sentence (D-POS-76).
 */

import { useEffect, useState } from "react";

import { useT } from "@/i18n/use-t";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { Icon } from "../../primitives";
import { formatOfferingPrice, type TalentOffering } from "@/lib/talent/offerings-types";
import { loadOfferingPricePhasesAction, type OfferingPricePhaseRow } from "@/lib/server-actions/catalog-engine-reads";
import { setOfferingPricePhaseAction } from "@/lib/server-actions/scheduling-engine";
import { ActionButton, Outcome, StatePill } from "../appointments-classes-ui";
import { BUTTON_SMALL, CARD, Field, INPUT, ListHead, ListRow, Note, SectionHead } from "./catalog-ui";
import { PHASE_STATE_KEY, engineRefusalKey, phaseState } from "./catalog-model";

const COLS = "grid-cols-[1.4fr_1fr_1fr_110px_100px_90px]";

function localToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function PricePhases({ item, isDraft, saving }: { item: TalentOffering; isDraft: boolean; saving: boolean }) {
  const t = useT();
  const locale = useDashboardLocale();
  const [phases, setPhases] = useState<OfferingPricePhaseRow[] | null>(null);
  const [loadFailed, setLoadFailed] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ kind: "refused" | "done"; text: string } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (isDraft) return;
    let cancelled = false;
    setLoadFailed(null);
    void loadOfferingPricePhasesAction(item.id).then((res) => {
      if (cancelled) return;
      if (res.ok) setPhases(res.phases);
      else setLoadFailed(t(engineRefusalKey(res.reason)));
    });
    return () => {
      cancelled = true;
    };
  }, [item.id, isDraft, reload, t]);

  const nowIso = new Date().toISOString();
  const when = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : t("dashboard.catalog.phases.open");
  const money = (c: number) => formatOfferingPrice(c, item.currency, locale);
  const off = saving || busy;

  async function add() {
    const starts = localToIso(startsAt);
    const ends = endsAt ? localToIso(endsAt) : null;
    const cents = Math.round(Number(price) * 100);
    if (!starts || (endsAt && !ends) || !Number.isFinite(cents) || cents < 0) {
      setOutcome({ kind: "refused", text: t("dashboard.scheduling.engine.refusal.invalid") });
      return;
    }
    setBusy(true);
    setOutcome(null);
    try {
      const res = await setOfferingPricePhaseAction({ offeringId: item.id, label, startsAt: starts, endsAt: ends, priceCents: cents });
      if (!res.ok) {
        setOutcome({ kind: "refused", text: t(engineRefusalKey(res.reason)) });
        return;
      }
      setAdding(false);
      setLabel("");
      setStartsAt("");
      setEndsAt("");
      setPrice("");
      setOutcome({ kind: "done", text: t("dashboard.catalog.phases.saved") });
      setReload((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SectionHead title={t("dashboard.catalog.phases.title")} intro={t("dashboard.catalog.phases.intro")} />
      {isDraft ? (
        <Outcome kind="note" testId="catalog-phases-save-first">
          {t("dashboard.catalog.options.saveFirst")}
        </Outcome>
      ) : (
        <>
          {loadFailed ? (
            <Outcome kind="refused" testId="catalog-phases-load-failed">
              {loadFailed}
            </Outcome>
          ) : null}
          {outcome ? (
            <Outcome kind={outcome.kind} testId="catalog-phases-outcome">
              {outcome.text}
            </Outcome>
          ) : null}
          <div className={CARD} data-testid="catalog-price-phases">
            <ListHead cols={COLS}>
              <span>{t("dashboard.catalog.phases.col.phase")}</span>
              <span>{t("dashboard.catalog.phases.col.from")}</span>
              <span>{t("dashboard.catalog.phases.col.until")}</span>
              <span>{t("dashboard.catalog.phases.col.price")}</span>
              <span>{t("dashboard.catalog.phases.col.state")}</span>
              <span />
            </ListHead>
            {phases === null && !loadFailed ? (
              <div className="px-[18px] py-[12px] font-admin-body text-[12.5px] text-admin-ink-muted">{t("dashboard.catalog.loading")}</div>
            ) : null}
            {phases !== null && phases.length === 0 ? (
              <div className="px-[18px] py-[12px] font-admin-body text-[12.5px] text-admin-ink-muted">{t("dashboard.catalog.phases.none")}</div>
            ) : null}
            {(phases ?? []).map((p) => {
              const state = phaseState(p, nowIso);
              return (
                <ListRow key={p.id} cols={COLS} testId={`catalog-phase-${p.id}`}>
                  <span className="font-semibold">{p.label}</span>
                  <span className="text-admin-ink-muted">{when(p.startsAt)}</span>
                  <span className="text-admin-ink-muted">{when(p.endsAt)}</span>
                  <span className="font-semibold tabular-nums">{money(p.priceCents)}</span>
                  <span>
                    <StatePill tone={state === "live" ? "green" : state === "upcoming" ? "indigo" : "slate"} state={state}>
                      {t(PHASE_STATE_KEY[state])}
                    </StatePill>
                  </span>
                  <span className="flex justify-end">
                    <button type="button" disabled title={t("dashboard.catalog.phases.removeReason")} data-not-wired="true" className={BUTTON_SMALL}>
                      {t("dashboard.catalog.phases.remove")}
                    </button>
                  </span>
                </ListRow>
              );
            })}
            {adding ? (
              <form
                className="grid grid-cols-[1.4fr_1fr_1fr_110px_auto] items-end gap-[10px] border-t border-admin-border-soft px-[16px] py-[12px]"
                data-testid="catalog-phase-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void add();
                }}
              >
                <Field label={t("dashboard.catalog.phases.col.phase")} required>
                  <input value={label} maxLength={80} required disabled={off} onChange={(e) => setLabel(e.target.value)} className={INPUT} data-testid="catalog-phase-label" />
                </Field>
                <Field label={t("dashboard.catalog.phases.col.from")} required>
                  <input type="datetime-local" value={startsAt} required disabled={off} onChange={(e) => setStartsAt(e.target.value)} className={INPUT} data-testid="catalog-phase-starts" />
                </Field>
                <Field label={t("dashboard.catalog.phases.col.until")}>
                  <input type="datetime-local" value={endsAt} disabled={off} onChange={(e) => setEndsAt(e.target.value)} className={INPUT} data-testid="catalog-phase-ends" />
                </Field>
                <Field label={t("dashboard.catalog.phases.col.price")} required>
                  <input type="number" inputMode="decimal" min={0} step="0.01" value={price} required disabled={off} onChange={(e) => setPrice(e.target.value)} className={INPUT} data-testid="catalog-phase-price" />
                </Field>
                <div className="flex items-center gap-[8px] pb-[1px]">
                  <ActionButton tone="primary" onClick={() => void add()} disabled={off || !label.trim() || !startsAt || !price} testId="catalog-phase-save">
                    {t("dashboard.catalog.phases.save")}
                  </ActionButton>
                  <ActionButton onClick={() => setAdding(false)} disabled={off}>
                    {t("dashboard.catalog.phases.cancel")}
                  </ActionButton>
                </div>
              </form>
            ) : (
              <div className="border-t border-admin-border-soft px-[16px] py-[10px]">
                <button type="button" disabled={off} onClick={() => setAdding(true)} data-testid="catalog-phase-add" className={BUTTON_SMALL}>
                  <Icon name="plus" size={12} stroke={1.75} />
                  {t("dashboard.catalog.phases.add")}
                </button>
              </div>
            )}
          </div>
          <Note>{t("dashboard.catalog.phases.stampNote")}</Note>
        </>
      )}
    </>
  );
}
