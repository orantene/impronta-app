"use client";

/**
 * event-tab-tickets — EventDetail's Tickets & Offers tab: the four figures
 * over the table (one night's pools through `loadSessionPools`), the ticket
 * table (Ticket type · entitles to, Price, Active phase, Capacity pool, Sold
 * / pool, Allocation, Channel), `Add ticket type` (`addTier`), the row menu
 * that opens the inline editor (`updateTier`), the Ticket settings card and
 * the Venue commitment card. `SessionSeats` (Details & Schedule) is the
 * operator half of the oversell guard: `setSessionPoolUnits`, whose CP015
 * refusal is a sentence here.
 *
 * Price phases, packages, allocations, named-ticket rules, transfer, re-entry
 * and the venue commitment have no column and are disabled with their
 * sentence (D-POS-56).
 */

import { useCallback, useEffect, useState, useTransition } from "react";

import {
  addTier,
  loadSessionPools,
  setSessionPoolUnits,
  updateTier,
  type EventListRow,
  type EventTierRow,
  type SessionPoolRow,
} from "@/app/(workspace)/[tenantSlug]/admin/_events-actions";
import { interpolate } from "@/i18n/interpolate";
import { useT } from "@/i18n/use-t";

import { ActionButton, BUTTON_PRIMARY, FactRow, Outcome, StatePill, type PillTone } from "../appointments-classes-ui";
import { CARD, Field, INPUT, ListHead, ListRow, Note, RowMenuButton, TabStrip } from "../catalog/catalog-ui";
import { centsFromInput, nightFigures, tierPhase, type TierPhase } from "./events-model";

const COLS = "grid-cols-[minmax(0,1.8fr)_80px_minmax(0,1fr)_minmax(0,1fr)_90px_minmax(0,0.9fr)_90px_28px]";

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const PHASE_TONE: Record<TierPhase, PillTone> = { onSale: "green", scheduled: "indigo", hidden: "slate", ended: "slate" };

export function useSessionPools(sessionId: string | null) {
  const [rows, setRows] = useState<SessionPoolRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    if (!sessionId) {
      setRows(null);
      return;
    }
    void loadSessionPools(sessionId).then((res) => {
      if (res.ok) {
        setRows(res.rows);
        setError(null);
      } else setError(res.error);
    });
  }, [sessionId]);
  useEffect(load, [load]);
  return { rows, error, reload: load };
}

export function TicketsTab({ event, sessionId, locale, onChanged }: { event: EventListRow; sessionId: string | null; locale: string; onChanged: () => void }) {
  const t = useT();
  const pools = useSessionPools(sessionId);
  const figures = pools.rows ? nightFigures(pools.rows) : null;
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const noNight = t("dashboard.events.tickets.noNightReason");
  const phaseLabel: Record<TierPhase, string> = {
    onSale: t("dashboard.events.tickets.phaseOnSale"),
    scheduled: t("dashboard.events.tickets.phaseScheduled"),
    hidden: t("dashboard.events.tickets.phaseHidden"),
    ended: t("dashboard.events.tickets.phaseEnded"),
  };
  const first = event.tiers[0] ?? null;
  const dash = (reason: string) => (
    <span title={reason} className="text-admin-ink-dim">
      —
    </span>
  );

  const stat = (label: string, value: string | null, note: string, testId: string) => (
    <div className={`${CARD} flex flex-col gap-[4px] px-[16px] py-[14px]`} data-testid={testId}>
      <div className="font-admin-body text-[11px] font-bold uppercase tracking-[0.08em] text-admin-ink-muted">{label}</div>
      <div className="font-admin-body text-[22px] font-semibold tabular-nums leading-none text-admin-ink">{value ?? "—"}</div>
      <div className="font-admin-body text-[11.5px] text-admin-ink-muted">{note}</div>
    </div>
  );

  return (
    <div className="flex flex-col gap-[14px]" data-testid="events-panel-tickets">
      <TabStrip
        label={t("dashboard.events.tickets.subtabs")}
        tabs={[
          { id: "types", label: t("dashboard.events.tickets.ticketTypes"), href: "#", active: true },
          { id: "phases", label: t("dashboard.events.tickets.pricePhases"), href: "#", active: false },
          { id: "packages", label: t("dashboard.events.tickets.packages"), href: "#", active: false },
          { id: "allocations", label: t("dashboard.events.tickets.allocations"), href: "#", active: false },
        ]}
      />
      <p className="m-0 -mt-[8px] font-admin-body text-[11.5px] text-admin-ink-dim">{t("dashboard.events.tickets.subtabsReason")}</p>
      <div className="grid grid-cols-4 gap-[12px] max-[720px]:grid-cols-3 max-[720px]:gap-[8px]">
        {stat(t("dashboard.events.tickets.capacity"), figures?.capacity === null || figures === null ? null : String(figures.capacity), sessionId ? (figures ? interpolate(t("dashboard.events.tickets.capacityNote"), { pooled: figures.pooled, tiers: figures.tiers }) : t("dashboard.events.loading")) : noNight, "events-stat-capacity")}
        {stat(t("dashboard.events.tickets.sold"), figures?.sold === null || figures === null ? null : String(figures.sold), sessionId ? t("dashboard.events.tickets.soldNote") : noNight, "events-stat-sold")}
        {stat(t("dashboard.events.tickets.remaining"), figures?.remaining === null || figures === null ? null : String(figures.remaining), sessionId ? t("dashboard.events.tickets.remainingNote") : noNight, "events-stat-remaining")}
        {stat(t("dashboard.events.tickets.holds"), null, t("dashboard.events.tickets.holdsReason"), "events-stat-holds")}
      </div>
      {pools.error ? <Outcome kind="refused">{pools.error}</Outcome> : null}
      <div className={CARD}>
        <ListHead cols={COLS}>
          <span>{t("dashboard.events.tickets.colType")}</span>
          <span>{t("dashboard.events.tickets.colPrice")}</span>
          <span>{t("dashboard.events.tickets.colPhase")}</span>
          <span>{t("dashboard.events.tickets.colPool")}</span>
          <span>{t("dashboard.events.tickets.colSold")}</span>
          <span>{t("dashboard.events.tickets.colAllocation")}</span>
          <span>{t("dashboard.events.tickets.colChannel")}</span>
          <span />
        </ListHead>
        {event.tiers.length === 0 ? (
          <p className="m-0 border-t border-admin-border-soft px-[18px] py-[20px] font-admin-body text-admin-13 text-admin-ink-muted">{t("dashboard.events.tickets.empty")}</p>
        ) : null}
        {event.tiers.map((tier) => {
          const pool = pools.rows?.find((p) => p.poolKey === tier.poolKey) ?? null;
          const phase = tierPhase(tier);
          return (
            <div key={tier.id}>
              <ListRow cols={COLS} testId={`events-tier-${tier.id}`}>
                <span className="min-w-0">
                  <span className="block truncate font-admin-body text-[13px] font-semibold text-admin-ink">{tier.label}</span>
                  <span className="block truncate font-admin-body text-[11.5px] text-admin-ink-muted">
                    {tier.admitsPerUnit > 1 ? interpolate(t("dashboard.events.tickets.admits"), { count: tier.admitsPerUnit }) : t("dashboard.events.tickets.entry")}
                    {tier.seatingMode === "space_group" ? ` · ${t("dashboard.events.tickets.tableGroup")}` : ""}
                  </span>
                </span>
                <span className="font-mono text-[12px] font-semibold tabular-nums text-admin-ink">{money(tier.amountCents)}</span>
                <span>
                  <StatePill tone={PHASE_TONE[phase]} state={phase}>
                    {phaseLabel[phase]}
                  </StatePill>
                </span>
                <span className="truncate font-mono text-[11.5px] text-admin-ink-muted">{tier.poolKey}</span>
                <span className="font-mono text-[12px] tabular-nums text-admin-ink">
                  {!sessionId ? dash(noNight) : pool === null ? "…" : pool.poolId === null ? dash(t("dashboard.events.tickets.noPoolReason")) : `${pool.committedPeak ?? "—"} / ${(pool.unitsTotal ?? 0) + (pool.overbookUnits ?? 0)}`}
                </span>
                <span>{dash(t("dashboard.events.tickets.allocationReason"))}</span>
                <span>
                  <StatePill tone={tier.isHidden ? "slate" : "green"}>{tier.isHidden ? t("dashboard.events.tickets.channelLink") : t("dashboard.events.tickets.channelPublic")}</StatePill>
                </span>
                <RowMenuButton label={t("dashboard.events.tickets.edit")} onClick={() => setEditing(editing === tier.id ? null : tier.id)} testId={`events-tier-menu-${tier.id}`} />
              </ListRow>
              {editing === tier.id ? (
                <div className="border-t border-admin-border-soft px-[18px] py-[12px]">
                  <TierEditor
                    tier={tier}
                    onSaved={() => {
                      setEditing(null);
                      onChanged();
                    }}
                    onCancel={() => setEditing(null)}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
        {adding && event.status !== "cancelled" ? (
          <div className="border-t border-admin-border-soft px-[18px] py-[12px]">
            <TierForm
              eventId={event.id}
              onAdded={() => {
                setAdding(false);
                onChanged();
              }}
              onCancel={() => setAdding(false)}
            />
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-[8px] border-t border-admin-border-soft px-[18px] py-[12px]">
          <ActionButton onClick={() => setAdding(true)} disabled={adding || event.status === "cancelled"} testId="events-add-tier">
            {t("dashboard.events.tickets.addType")}
          </ActionButton>
          <ActionButton reason={t("dashboard.events.tickets.phasesReason")}>{t("dashboard.events.tickets.addPhase")}</ActionButton>
          <ActionButton reason={t("dashboard.events.tickets.packagesReason")}>{t("dashboard.events.tickets.addPackage")}</ActionButton>
        </div>
      </div>
      <Note>{t("dashboard.events.tickets.poolNote")}</Note>
      <div className="grid grid-cols-2 gap-[12px]">
        <div className={`${CARD} px-[16px] py-[8px]`} data-testid="events-ticket-settings">
          <div className="py-[6px] font-admin-body text-[13px] font-semibold text-admin-ink">
            {first ? interpolate(t("dashboard.events.tickets.settingsTitle"), { tier: first.label }) : t("dashboard.events.tickets.settingsNone")}
          </div>
          <FactRow label={t("dashboard.events.tickets.perOrder")}>{first?.maxPerOrder ? `1–${first.maxPerOrder}` : t("dashboard.events.tickets.noLimit")}</FactRow>
          <FactRow label={t("dashboard.events.tickets.salesWindow")}>
            {first?.salesFrom || first?.salesUntil
              ? `${first.salesFrom ? new Date(first.salesFrom).toLocaleDateString(locale) : "…"} → ${first.salesUntil ? new Date(first.salesUntil).toLocaleDateString(locale) : "…"}`
              : t("dashboard.events.tickets.windowOpen")}
          </FactRow>
          <FactRow label={t("dashboard.events.tickets.namedTicket")} muted>
            {t("dashboard.events.tickets.notRecorded")}
          </FactRow>
          <FactRow label={t("dashboard.events.tickets.transfer")} muted>
            {t("dashboard.events.tickets.notRecorded")}
          </FactRow>
          <FactRow label={t("dashboard.events.tickets.refundPolicy")}>
            {event.refundCutoffHours === null ? t("dashboard.events.overview.refundsDefault") : interpolate(t("dashboard.events.overview.refundsUntil"), { hours: event.refundCutoffHours })}
          </FactRow>
          <FactRow label={t("dashboard.events.tickets.reentry")} muted>
            {t("dashboard.events.tickets.reentryValue")}
          </FactRow>
        </div>
        <div className={`${CARD} flex flex-col gap-[8px] px-[16px] py-[14px]`} data-testid="events-venue-commitment">
          <div className="font-admin-body text-[13px] font-semibold text-admin-ink">{t("dashboard.events.tickets.venueCommitment")}</div>
          <p className="m-0 font-admin-body text-[12.5px] leading-[1.45] text-admin-ink-muted">{t("dashboard.events.tickets.venueCommitmentReason")}</p>
          <div className="flex gap-[8px]">
            <ActionButton reason={t("dashboard.events.tickets.venueCommitmentReason")}>{t("dashboard.events.tickets.changeVenue")}</ActionButton>
            <ActionButton reason={t("dashboard.events.tickets.blockSeatsReason")}>{t("dashboard.events.tickets.blockSeats")}</ActionButton>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Add a paid tier. The only caller of `addTier`. */
function TierForm({ eventId, onAdded, onCancel }: { eventId: string; onAdded: () => void; onCancel: () => void }) {
  const t = useT();
  const [label, setLabel] = useState("");
  const [price, setPrice] = useState("");
  const [admits, setAdmits] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-[8px]"
      data-testid="events-tier-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const amountCents = centsFromInput(price);
        if (amountCents === null) {
          setError(t("dashboard.events.tickets.priceInvalid"));
          return;
        }
        start(async () => {
          const res = await addTier({ eventId, label, amountCents, admitsPerUnit: Math.max(1, Math.round(Number(admits) || 1)) });
          if (!res.ok) {
            setError(res.error);
            return;
          }
          onAdded();
        });
      }}
    >
      <div className="grid grid-cols-[minmax(0,2fr)_120px_120px_auto_auto] items-end gap-[8px]">
        <Field label={t("dashboard.events.tickets.tierName")}>
          <input aria-label="Tier name" value={label} onChange={(e) => setLabel(e.target.value)} disabled={busy} maxLength={80} placeholder={t("dashboard.events.tickets.tierNamePlaceholder")} className={INPUT} />
        </Field>
        <Field label={t("dashboard.events.tickets.colPrice")}>
          <input aria-label="Price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} disabled={busy} placeholder="0.00" className={`${INPUT} font-mono`} />
        </Field>
        <Field label={t("dashboard.events.tickets.admitsPerTicket")}>
          <input aria-label="Admits per ticket" inputMode="numeric" value={admits} onChange={(e) => setAdmits(e.target.value)} disabled={busy} className={`${INPUT} font-mono`} />
        </Field>
        <button type="submit" disabled={busy || label.trim().length === 0 || price.trim().length === 0} className={`${BUTTON_PRIMARY} disabled:cursor-not-allowed disabled:opacity-50`} data-testid="events-tier-add">
          {busy ? t("dashboard.events.tickets.adding") : t("dashboard.events.tickets.add")}
        </button>
        <ActionButton onClick={onCancel}>{t("dashboard.events.tickets.cancel")}</ActionButton>
      </div>
      <p className="m-0 font-admin-body text-[11.5px] text-admin-ink-muted">{t("dashboard.events.tickets.tierHint")}</p>
      {error ? <Outcome kind="refused">{error}</Outcome> : null}
    </form>
  );
}

/**
 * Inline tier editor. Edits label / price / admits / max / hidden and NEVER
 * the pool key, so a rename cannot detach a night's seats. The only caller
 * of `updateTier`.
 */
function TierEditor({ tier, onSaved, onCancel }: { tier: EventTierRow; onSaved: () => void; onCancel: () => void }) {
  const t = useT();
  const [label, setLabel] = useState(tier.label);
  const [price, setPrice] = useState((tier.amountCents / 100).toFixed(2));
  const [admits, setAdmits] = useState(String(tier.admitsPerUnit));
  const [max, setMax] = useState(tier.maxPerOrder === null ? "" : String(tier.maxPerOrder));
  const [hidden, setHidden] = useState(tier.isHidden);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-[8px]"
      data-testid="events-tier-editor"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const amountCents = centsFromInput(price);
        if (amountCents === null) {
          setError(t("dashboard.events.tickets.priceInvalid"));
          return;
        }
        start(async () => {
          const res = await updateTier({
            tierId: tier.id,
            label,
            amountCents,
            admitsPerUnit: Math.max(1, Math.round(Number(admits) || 1)),
            maxPerOrder: max.trim() === "" ? null : Math.max(1, Math.round(Number(max))),
            isHidden: hidden,
          });
          if (!res.ok) {
            setError(res.error);
            return;
          }
          onSaved();
        });
      }}
    >
      <div className="grid grid-cols-[minmax(0,2fr)_110px_110px_110px_auto] items-end gap-[8px]">
        <Field label={t("dashboard.events.tickets.tierName")}>
          <input aria-label="Tier name" value={label} onChange={(e) => setLabel(e.target.value)} disabled={busy} maxLength={80} className={INPUT} />
        </Field>
        <Field label={t("dashboard.events.tickets.colPrice")}>
          <input aria-label="Price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} disabled={busy} className={`${INPUT} font-mono`} />
        </Field>
        <Field label={t("dashboard.events.tickets.admitsPerTicket")}>
          <input aria-label="Admits per ticket" inputMode="numeric" value={admits} onChange={(e) => setAdmits(e.target.value)} disabled={busy} className={`${INPUT} font-mono`} />
        </Field>
        <Field label={t("dashboard.events.tickets.perOrder")}>
          <input aria-label="Max per order" inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value)} disabled={busy} className={`${INPUT} font-mono`} />
        </Field>
        <label className="flex h-[36px] items-center gap-[6px] font-admin-body text-[12px] text-admin-ink-muted">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} disabled={busy} /> {t("dashboard.events.tickets.hiddenByLink")}
        </label>
      </div>
      <p className="m-0 font-admin-body text-[11.5px] text-admin-ink-muted">{t("dashboard.events.tickets.renameHint")}</p>
      <div className="flex gap-[8px]">
        <button type="submit" disabled={busy} className={`${BUTTON_PRIMARY} disabled:cursor-not-allowed disabled:opacity-50`} data-testid="events-tier-save">
          {busy ? t("dashboard.events.tickets.saving") : t("dashboard.events.tickets.save")}
        </button>
        <ActionButton onClick={onCancel} disabled={busy}>
          {t("dashboard.events.tickets.cancel")}
        </ActionButton>
      </div>
      {error ? <Outcome kind="refused">{error}</Outcome> : null}
    </form>
  );
}

/**
 * Seats per tier for ONE night (Details & Schedule). `upsert_capacity_pool`
 * refuses a shrink below what is sold (CP015) and this is where that refusal
 * becomes a sentence. "Sold" is Capacity's committed PEAK, never a sum.
 */
export function SessionSeats({ sessionId, onSaved }: { sessionId: string; onSaved: () => void }) {
  const t = useT();
  const pools = useSessionPools(sessionId);
  const [draft, setDraft] = useState<Record<string, { units: string; overbook: string }>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, start] = useTransition();
  const rows = pools.rows;

  if (pools.error) return <Outcome kind="refused">{pools.error}</Outcome>;
  if (rows === null) return <p className="m-0 font-admin-body text-[12px] text-admin-ink-muted">{t("dashboard.events.loading")}</p>;
  if (rows.length === 0) return <p className="m-0 font-admin-body text-[12px] text-admin-ink-muted">{t("dashboard.events.tickets.empty")}</p>;

  return (
    <ul className="m-0 mt-[6px] flex list-none flex-col gap-[6px] p-0">
      {rows.map((r) => {
        const d = draft[r.poolKey] ?? { units: r.unitsTotal === null ? "" : String(r.unitsTotal), overbook: r.overbookUnits === null ? "" : String(r.overbookUnits) };
        return (
          <li key={r.poolKey} className="flex flex-wrap items-center gap-[8px] font-admin-body text-[12.5px]">
            <span className="min-w-[140px] text-admin-ink">{r.tierLabel}</span>
            {r.poolId === null ? (
              <span className="text-admin-ink-muted">{t("dashboard.events.schedule.noPool")}</span>
            ) : (
              <>
                <label className="flex items-center gap-[4px] text-admin-ink-muted">
                  {t("dashboard.events.schedule.seats")}
                  <input aria-label={`Seats for ${r.tierLabel}`} inputMode="numeric" value={d.units} disabled={busy} onChange={(e) => setDraft((prev) => ({ ...prev, [r.poolKey]: { ...d, units: e.target.value } }))} className={`${INPUT} w-[80px] font-mono`} />
                </label>
                <label className="flex items-center gap-[4px] text-admin-ink-muted">
                  {t("dashboard.events.schedule.overbook")}
                  <input aria-label={`Overbook for ${r.tierLabel}`} inputMode="numeric" value={d.overbook} disabled={busy} onChange={(e) => setDraft((prev) => ({ ...prev, [r.poolKey]: { ...d, overbook: e.target.value } }))} className={`${INPUT} w-[70px] font-mono`} />
                </label>
                <span className="text-admin-ink-muted">
                  {r.committedPeak === null ? t("dashboard.events.schedule.soldUnknown") : interpolate(t("dashboard.events.schedule.sold"), { count: r.committedPeak })}
                  {r.isActive === false ? ` · ${t("dashboard.events.schedule.suspended")}` : ""}
                </span>
                <ActionButton
                  disabled={busy}
                  onClick={() => {
                    const units = Math.round(Number(d.units));
                    const overbook = d.overbook.trim() === "" ? null : Math.round(Number(d.overbook));
                    setErrors((prev) => ({ ...prev, [r.poolKey]: "" }));
                    start(async () => {
                      const res = await setSessionPoolUnits({ sessionId, poolKey: r.poolKey, unitsTotal: Number.isFinite(units) ? units : -1, overbookUnits: overbook });
                      if (!res.ok) {
                        setErrors((prev) => ({ ...prev, [r.poolKey]: res.error }));
                        return;
                      }
                      pools.reload();
                      onSaved();
                    });
                  }}
                >
                  {t("dashboard.events.tickets.save")}
                </ActionButton>
                {errors[r.poolKey] ? <span className="basis-full text-admin-red">{errors[r.poolKey]}</span> : null}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
