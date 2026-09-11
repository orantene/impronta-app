"use client";

/**
 * GateScreen — G01 to G08. One hero that is either "Ready to scan" or the
 * last verdict, full-bleed in the verdict's tone; the scanner types into the
 * one field under it. `Look up by name` opens the 560px lookup column on the
 * left (G08's left half); picking a valid ticket there opens `Admit by hand`
 * on the right, whose one button is Events' `admitAtDoor`.
 *
 * The second button under a verdict is decided by `gateSecondaryAction`
 * (pure): `Look up the order` is wired to the lookup, the other three have
 * no writer in the engine (no meal benefit, no manager override, no date
 * exchange) and are drawn disabled with their sentence (D-POS-54).
 */

import { ScanLine, Search, X } from "lucide-react";
import { useRef, useState } from "react";

import { POS_EYEBROW, POS_PRIMARY_ACTION, POS_SECONDARY_ACTION, POS_SURFACE } from "@/components/admin/pos/pos-classes";
import { interpolate } from "@/i18n/interpolate";
import { cn } from "@/lib/utils";
import { gateSecondaryAction, groupByOrder, groupMatches, type DoorVerdict } from "@/lib/pos/door-model";
import type { DoorRow } from "@/app/(workspace)/[tenantSlug]/admin/_door-actions";

import type { DoorCopy } from "./door-copy";
import { timeAt, type OpenDoor } from "./door-shared";
import { DisabledField, DoorNote, FactCard, FactRow, Pill, TicketRow, rowName, rowRef, ticketState } from "./door-ui";

export type GateScreenProps = {
  door: OpenDoor;
  busy: boolean;
  verdict: DoorVerdict | null;
  /** Who the verdict is about, when the tap knew (manual admit); a scan does not. */
  verdictWho: string | null;
  onScan: (code: string) => Promise<void>;
  onAdmitRow: (row: DoorRow) => Promise<void>;
  onNext: () => void;
  onLookUpOrder: () => void;
  onSwitchToBox: () => void;
  cashierName: string;
  zone: string;
  locale: string;
  copy: DoorCopy;
};

const HERO_TONE: Record<DoorVerdict["tone"] | "ready", { bg: string; ink: string; badge: string }> = {
  ready: { bg: "bg-admin-surface", ink: "text-admin-brand", badge: "bg-admin-brand-soft" },
  in: { bg: "bg-admin-success-soft", ink: "text-admin-success", badge: "bg-admin-card" },
  refused: { bg: "bg-admin-critical-soft", ink: "text-admin-red", badge: "bg-admin-card" },
  warn: { bg: "bg-admin-coral-soft", ink: "text-admin-coral-deep", badge: "bg-admin-card" },
};

export function GateScreen(props: GateScreenProps) {
  const { door, copy, zone, locale, verdict } = props;
  const gate = copy.gate;
  const [lookupOpen, setLookupOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [manualRow, setManualRow] = useState<DoorRow | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const timeOf = (iso: string) => timeAt(iso, zone, locale);

  const submitScan = async () => {
    const value = scanRef.current?.value ?? "";
    await props.onScan(value);
    if (scanRef.current) {
      scanRef.current.value = "";
      scanRef.current.focus();
    }
  };

  const tone = verdict ? HERO_TONE[verdict.tone] : HERO_TONE.ready;
  const secondary = verdict ? gateSecondaryAction(verdict.key) : null;
  const secondaryLabel =
    secondary?.action === "redeemMeal"
      ? gate.redeemMeal
      : secondary?.action === "letInAnyway"
        ? gate.letInAnyway
        : secondary?.action === "exchangeDate"
          ? gate.exchangeDate
          : gate.lookUpOrder;
  const secondaryReason =
    secondary?.action === "redeemMeal"
      ? gate.redeemMealReason
      : secondary?.action === "letInAnyway"
        ? gate.letInAnywayReason
        : secondary?.action === "exchangeDate"
          ? gate.exchangeDateReason
          : null;

  const scanForm = (
    <form
      className="mt-2 flex w-full max-w-[560px] items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submitScan();
      }}
    >
      <label htmlFor="door-scan" className="sr-only">
        {gate.scanLabel}
      </label>
      <input
        id="door-scan"
        ref={scanRef}
        autoFocus
        autoComplete="off"
        disabled={props.busy}
        placeholder={gate.scanPlaceholder}
        className="h-12 min-w-0 flex-1 rounded-[12px] border-[1.5px] border-admin-border bg-admin-card px-4 font-mono text-[15px] text-admin-ink placeholder:text-admin-ink-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-brand disabled:opacity-60"
      />
      <button type="submit" disabled={props.busy} className={cn(POS_SECONDARY_ACTION, "h-12")}>
        {gate.admit}
      </button>
    </form>
  );

  const hero = (
    <div
      data-door-hero
      className={cn("flex flex-1 flex-col items-center justify-center gap-[18px] px-[30px] py-6 text-center", tone.bg)}
    >
      <span className={cn("inline-flex h-[150px] w-[150px] items-center justify-center rounded-[44px]", tone.badge)}>
        {verdict ? (
          <span aria-hidden className={cn("text-[72px] font-bold leading-none", tone.ink)}>
            {verdict.tone === "in" ? "✓" : verdict.tone === "refused" ? "✕" : "!"}
          </span>
        ) : (
          <ScanLine aria-hidden size={72} strokeWidth={1.8} className={tone.ink} />
        )}
      </span>
      <div
        role="status"
        aria-live="assertive"
        data-door-verdict={verdict?.key ?? "ready"}
        className="flex flex-col items-center gap-[18px]"
      >
        <div className={cn("text-[44px] font-extrabold leading-none tracking-[-0.02em]", tone.ink)}>
          {verdict ? gate.headline[verdict.key] : gate.ready}
        </div>
        <div className="max-w-[640px] text-[18px] leading-[1.4] text-admin-ink-muted">
          {verdict
            ? [props.verdictWho, interpolate(gate.detail[verdict.key], verdict.vars)].filter(Boolean).join(" · ")
            : gate.readyHint}
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2.5">
        {verdict ? (
          <>
            <button type="button" onClick={props.onNext} className={cn(POS_PRIMARY_ACTION, "w-[220px]")} data-door-next>
              {gate.next}
            </button>
            {secondary && (
              <button
                type="button"
                disabled={!secondary.wired}
                title={secondaryReason ?? undefined}
                data-not-wired={secondary.wired ? undefined : "true"}
                onClick={secondary.wired ? props.onLookUpOrder : undefined}
                className={cn(POS_SECONDARY_ACTION, secondary.action === "letInAnyway" && "border-admin-red/40 text-admin-red")}
              >
                {secondaryLabel}
              </button>
            )}
          </>
        ) : (
          <>
            <button type="button" onClick={() => setLookupOpen((v) => !v)} className={POS_SECONDARY_ACTION} data-door-lookup-toggle aria-pressed={lookupOpen}>
              <Search aria-hidden size={18} strokeWidth={1.75} />
              {gate.lookupByName}
            </button>
            <button type="button" onClick={props.onSwitchToBox} className={POS_SECONDARY_ACTION}>
              {gate.switchToBox}
            </button>
          </>
        )}
      </div>
      {secondaryReason && <p className="m-0 max-w-[560px] text-[13px] text-admin-ink-muted">{secondaryReason}</p>}
      {scanForm}
    </div>
  );

  const groups = groupByOrder(door.rows).filter((g) => groupMatches(g, query));
  const pickedGroup = groups.find((g) => g.key === picked) ?? (query.trim() ? groups[0] : undefined);

  const lookupColumn = (
    <aside data-door-lookup-column className="flex w-[560px] max-w-[52%] shrink-0 flex-col gap-3.5 overflow-y-auto border-r border-admin-border px-5 py-[18px]">
      <div className={POS_EYEBROW}>{copy.lookup.eyebrow}</div>
      <label className="flex h-[60px] items-center gap-2.5 rounded-[14px] border-[1.5px] border-admin-border bg-admin-card px-4 text-[16px] focus-within:border-admin-brand">
        <Search aria-hidden size={20} strokeWidth={1.75} className="text-admin-ink-muted" />
        <span className="sr-only">{copy.lookup.eyebrow}</span>
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPicked(null);
          }}
          placeholder={copy.lookup.placeholder}
          className="min-w-0 flex-1 bg-transparent text-[16px] text-admin-ink outline-none placeholder:text-admin-ink-dim"
        />
        <span className="text-[12.5px] text-admin-ink-muted">{copy.lookup.hint}</span>
      </label>
      <div data-door-list className="flex flex-col gap-2.5">
        {groups.length === 0 && (
          <p className="m-0 text-[14px] text-admin-ink-muted">{door.rows.length === 0 ? copy.lookup.empty : copy.lookup.noMatch}</p>
        )}
        {groups.map((g) => {
          const open = pickedGroup?.key === g.key;
          const first = g.rows[0]!;
          return (
            <div key={g.key} className={cn(POS_SURFACE, "border-[1px]", open && "border-admin-brand")}>
              <button type="button" onClick={() => setPicked(open ? null : g.key)} className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left" data-door-group={g.key}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold text-admin-ink">
                    {g.holderName ?? rowName(first, copy.lookup)} · {g.ref}
                  </span>
                  <span className="block truncate text-[13.5px] text-admin-ink-muted">
                    {interpolate(copy.lookup.orderLine, { code: g.ref, count: g.rows.length, admitted: g.admitted })}
                  </span>
                </span>
                <Pill tone={g.admitted === g.rows.length ? "slate" : "green"}>{g.admitted === g.rows.length ? copy.lookup.admitted : copy.lookup.tonight}</Pill>
              </button>
              {open && (
                <div className="px-4 pb-1">
                  {g.rows.map((row) => {
                    const state = ticketState(row, copy.lookup, timeOf);
                    return (
                      <TicketRow
                        key={row.id}
                        row={row}
                        copy={copy.lookup}
                        timeOf={timeOf}
                        action={
                          state.admittable ? (
                            <button
                              type="button"
                              disabled={props.busy}
                              onClick={() => setManualRow(row)}
                              className={cn(POS_SECONDARY_ACTION, "h-10 px-3.5 text-[14px]")}
                              data-door-manual={row.id}
                            >
                              {row.partySize - row.admittedCount > 1
                                ? interpolate(copy.lookup.admitMany, { count: row.partySize - row.admittedCount })
                                : gate.admit}
                            </button>
                          ) : null
                        }
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <DoorNote>{copy.lookup.lookupNote}</DoorNote>
      <p className="m-0 text-[12.5px] text-admin-ink-dim">{gate.noScanOut}</p>
    </aside>
  );

  const manualPanel = manualRow ? (
    <div data-door-manual-panel className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-admin-border px-[22px] pb-4 pt-[18px]">
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-[20px] font-bold tracking-[-0.01em] text-admin-ink">
            {interpolate(copy.manual.title, { name: rowName(manualRow, copy.lookup) })}
          </h2>
          <p className="m-0 mt-[3px] text-[14px] text-admin-ink-muted">{interpolate(copy.manual.subtitle, { code: rowRef(manualRow) })}</p>
        </div>
        <button type="button" aria-label={copy.manual.close} onClick={() => setManualRow(null)} className="inline-flex h-11 w-11 items-center justify-center rounded-[12px] bg-admin-surface-alt text-admin-ink">
          <X aria-hidden size={18} strokeWidth={1.75} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-[22px] py-[18px]">
        <FactCard>
          <FactRow label={copy.manual.right}>{manualRow.tierLabel ?? copy.lookup.ticket}{manualRow.partySize > 1 ? ` · ${interpolate(copy.lookup.party, { size: manualRow.partySize })}` : ""}</FactRow>
          <FactRow label={copy.manual.entrance}>{copy.manual.entranceValue}</FactRow>
          <FactRow label={copy.manual.counts}>
            {interpolate(copy.manual.countsValue, {
              count: manualRow.partySize - manualRow.admittedCount,
              after: door.counts.arrived + (manualRow.partySize - manualRow.admittedCount),
              expected: door.counts.expected,
            })}
          </FactRow>
          <FactRow label={copy.manual.after}>{copy.manual.afterValue}</FactRow>
        </FactCard>
        <DisabledField label={copy.manual.reason} value="" reason={copy.manual.reasonReason} chevron />
        <DisabledField label={copy.manual.authorizedBy} value={props.cashierName} reason={copy.manual.authorizedByReason} />
      </div>
      <div className="flex items-center gap-2.5 border-t border-admin-border bg-admin-card px-[22px] py-3.5">
        <span className="max-w-[160px] text-[14px] leading-[1.3] text-admin-ink-muted">
          {interpolate(copy.manual.footerNote, { cashier: props.cashierName })}
        </span>
        <span className="flex-1" />
        <button type="button" onClick={() => setManualRow(null)} className={POS_SECONDARY_ACTION}>
          {copy.manual.cancel}
        </button>
        <button
          type="button"
          disabled={props.busy}
          data-door-manual-admit
          onClick={() => {
            const row = manualRow;
            setManualRow(null);
            void props.onAdmitRow(row);
          }}
          className={cn(POS_PRIMARY_ACTION, "h-[60px]")}
        >
          {interpolate(copy.manual.admit, { name: rowName(manualRow, copy.lookup) })}
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div data-door-gate className="flex min-h-0 flex-1">
      {lookupOpen && lookupColumn}
      {manualPanel ?? hero}
    </div>
  );
}
