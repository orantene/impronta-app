"use client";

/**
 * LookupScreen — E09 (find a ticket without a QR), E10 (what can change on
 * an order), E13 (name a ticket) and E15 (delivery).
 *
 * The list is tonight's door, grouped by ORDER (`groupByOrder`, pure): one
 * result per order on the left, its tickets on the right, and one primary
 * action, `Admit <ref> · <name>`, which is Events' `admitAtDoor` on the first
 * ticket that can still admit. `Change` opens E10 over the order: naming an
 * unnamed ticket writes through `posDoorNameTicket`, cancelling one is the
 * refunds desk's own `refundOrderAtDesk` with `cancel_ticket`; transfer and
 * exchange have no writer and are drawn disabled with their sentence.
 * `Delivery` (E15) draws what this workspace can say about a ticket's
 * delivery, which today is that the code was handed over here (D-POS-55).
 */

import { Search } from "lucide-react";
import { useCallback, useState, type ReactNode } from "react";

import { PosSheet } from "@/components/admin/pos";
import { POS_DANGER_ACTION, POS_EYEBROW, POS_INPUT, POS_OUTLINE_ACTION, POS_PRIMARY_ACTION, POS_SECONDARY_ACTION, POS_SURFACE } from "@/components/admin/pos/pos-classes";
import { interpolate } from "@/i18n/interpolate";
import { groupByOrder, groupMatches, type LookupGroup } from "@/lib/pos/door-model";
import { cn } from "@/lib/utils";
import type { DoorRow } from "@/app/(workspace)/[tenantSlug]/admin/_door-actions";
import { refundOrderAtDesk } from "@/app/(workspace)/[tenantSlug]/admin/orders/refund-actions";

import { posDoorNameTicket } from "./door-actions";
import { dateAt, type DoorScreenCopy, type OpenDoor, timeAt } from "./door-shared";
import { DoorNote, Pill, TicketRow, rowName, rowRef, ticketState } from "./door-ui";

export type LookupScreenProps = {
  door: OpenDoor;
  busy: boolean;
  setBusy: (b: boolean) => void;
  query: string;
  onQueryChange: (q: string) => void;
  onAdmitRow: (row: DoorRow) => Promise<void>;
  /** A ticket was named or refunded: re-read the door. */
  onChanged: () => void;
  zone: string;
  locale: string;
  copy: DoorScreenCopy;
};

type Sheet = { kind: "change"; row: DoorRow } | { kind: "delivery"; group: LookupGroup<DoorRow> } | null;

export function LookupScreen(props: LookupScreenProps) {
  const { door, copy, zone, locale, query } = props;
  const lk = copy.door.lookup;
  const [picked, setPicked] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const timeOf = (iso: string) => timeAt(iso, zone, locale);

  const groups = groupByOrder(door.rows).filter((g) => groupMatches(g, query));
  const group = groups.find((g) => g.key === picked) ?? groups[0] ?? null;
  const next = group?.rows.find((r) => ticketState(r, lk, timeOf).admittable) ?? null;
  const dateLabel = dateAt(door.session.startsAt, zone, locale);

  return (
    <div data-door-lookup className="relative flex min-h-0 flex-1">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-5">
        <label className="flex h-[60px] items-center gap-3 rounded-[14px] border-[1.5px] border-admin-brand bg-admin-card px-4">
          <Search aria-hidden size={20} strokeWidth={1.75} className="text-admin-ink-muted" />
          <span className="sr-only">{lk.eyebrow}</span>
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => {
              props.onQueryChange(e.target.value);
              setPicked(null);
            }}
            placeholder={lk.placeholder}
            className="min-w-0 flex-1 bg-transparent text-[18px] text-admin-ink outline-none placeholder:text-admin-ink-dim"
            data-door-lookup-query
          />
          <span className="text-[12.5px] text-admin-ink-muted">{lk.hint}</span>
        </label>
        <div data-door-list className="flex flex-col gap-2.5">
          {groups.length === 0 && <p className="m-0 text-[15px] text-admin-ink-muted">{door.rows.length === 0 ? lk.empty : lk.noMatch}</p>}
          {groups.map((g) => {
            const active = g.key === group?.key;
            const first = g.rows[0]!;
            const done = g.admitted === g.rows.length;
            return (
              <button
                key={g.key}
                type="button"
                aria-pressed={active}
                data-door-group={g.key}
                onClick={() => setPicked(g.key)}
                className={cn(POS_SURFACE, "flex items-center gap-3 px-4 py-3.5 text-left", active ? "border-admin-brand bg-admin-brand-soft" : "hover:bg-admin-surface-alt")}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold text-admin-ink">{g.holderName ?? rowName(first, lk)}</span>
                  <span className="block truncate text-[14px] text-admin-ink-muted">
                    {interpolate(lk.orderLine, { code: g.ref, count: g.rows.length, admitted: g.admitted })}
                    {g.rows[0]?.seatedAt ? ` ${timeOf(g.rows[0].seatedAt)}` : ""}
                  </span>
                </span>
                <Pill tone={done ? "slate" : "green"}>{done ? lk.admitted : lk.tonight}</Pill>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex w-[420px] shrink-0 flex-col gap-2.5 overflow-y-auto border-l border-admin-border bg-admin-surface px-[18px] py-5">
        {group ? (
          <>
            <div className={POS_EYEBROW}>{interpolate(lk.ticketsOf, { code: group.ref, count: group.rows.length })}</div>
            {group.rows.map((row) => (
              <div key={row.id} className={cn(POS_SURFACE, "border-[1px] px-4 [&>div]:border-t-0")}>
                <TicketRow
                  row={row}
                  copy={lk}
                  timeOf={timeOf}
                  compact
                  action={
                    <span className="flex flex-col gap-1">
                      <button type="button" onClick={() => setSheet({ kind: "change", row })} className="text-[13px] font-semibold text-admin-brand hover:underline" data-door-change={row.id}>
                        {lk.change}
                      </button>
                      <button type="button" onClick={() => setSheet({ kind: "delivery", group })} className="text-[13px] font-semibold text-admin-ink-muted hover:underline">
                        {lk.delivery}
                      </button>
                    </span>
                  }
                />
              </div>
            ))}
            <div className="flex-1" />
            {next ? (
              <button
                type="button"
                disabled={props.busy}
                data-door-admit-next={next.id}
                onClick={() => void props.onAdmitRow(next)}
                className={cn(POS_PRIMARY_ACTION, "h-[56px] w-full")}
              >
                {next.partySize - next.admittedCount > 1
                  ? interpolate(lk.admitMany, { count: next.partySize - next.admittedCount })
                  : interpolate(lk.admitTicket, { code: rowRef(next), name: rowName(next, lk) })}
              </button>
            ) : (
              <p className="m-0 text-center text-[14px] text-admin-ink-muted">{lk.admitted}</p>
            )}
            <button type="button" disabled title={lk.resendAllReason} data-not-wired="true" className={cn(POS_SECONDARY_ACTION, "w-full")}>
              {lk.resendAll}
            </button>
            <p className="m-0 text-[12.5px] text-admin-ink-dim">{lk.resendAllReason}</p>
          </>
        ) : (
          <DoorNote>{lk.lookupNote}</DoorNote>
        )}
      </div>

      {sheet?.kind === "change" && (
        <ChangeSheet
          row={sheet.row}
          dateLabel={dateLabel}
          busy={props.busy}
          setBusy={props.setBusy}
          copy={copy}
          onClose={() => setSheet(null)}
          onChanged={props.onChanged}
        />
      )}
      {sheet?.kind === "delivery" && (
        <PosSheet
          open
          name="door-delivery"
          title={interpolate(copy.door.deliveryPanel.title, { code: sheet.group.ref })}
          subtitle={interpolate(copy.door.deliveryPanel.subtitle, { name: sheet.group.holderName ?? lk.unnamed, count: sheet.group.rows.length, date: dateLabel })}
          closeLabel={copy.chrome.closeLabel}
          onClose={() => setSheet(null)}
          footerStart={
            <button type="button" onClick={() => setSheet(null)} className={POS_SECONDARY_ACTION}>
              {copy.door.deliveryPanel.back}
            </button>
          }
        >
          <DeliveryRows group={sheet.group} copy={copy.door.deliveryPanel} />
        </PosSheet>
      )}
    </div>
  );
}

// ── E15 ─────────────────────────────────────────────────────────────────

function DeliveryRows({ group, copy }: { group: LookupGroup<DoorRow>; copy: DoorScreenCopy["door"]["deliveryPanel"] }) {
  const email = group.rows.find((r) => r.holderEmail)?.holderEmail ?? null;
  const rows = [
    { title: email ? interpolate(copy.email, { email }) : copy.emailNone, status: copy.emailStatus, tone: "slate" as const, action: copy.resend, reason: copy.resendReason },
    { title: copy.sms, status: copy.smsStatus, tone: "slate" as const, action: null, reason: null },
    { title: copy.printed, status: copy.printedStatus, tone: "slate" as const, action: null, reason: null },
    { title: copy.wallet, status: copy.walletStatus, tone: "slate" as const, action: null, reason: null },
  ];
  return (
    <div className="flex flex-col gap-3" data-door-delivery-panel>
      <div className={cn(POS_SURFACE, "border-[1px]")}>
        {rows.map((r) => (
          <div key={r.title} className="flex items-center gap-3 border-t border-admin-border-soft px-4 py-3.5 first:border-t-0">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[16px] font-semibold text-admin-ink">{r.title}</span>
              <span className="block text-[13.5px] text-admin-ink-muted">{r.status}</span>
            </span>
            {r.action ? (
              <button type="button" disabled title={r.reason ?? undefined} data-not-wired="true" className={cn(POS_SECONDARY_ACTION, "h-11")}>
                {r.action}
              </button>
            ) : (
              <Pill tone={r.tone}>{copy.notAvailable}</Pill>
            )}
          </div>
        ))}
      </div>
      <DoorNote tone="indigo">{copy.footnote}</DoorNote>
    </div>
  );
}

// ── E10 + E13 ───────────────────────────────────────────────────────────

function ChangeSheet({
  row,
  dateLabel,
  busy,
  setBusy,
  copy,
  onClose,
  onChanged,
}: {
  row: DoorRow;
  dateLabel: string;
  busy: boolean;
  setBusy: (b: boolean) => void;
  copy: DoorScreenCopy;
  onClose: () => void;
  onChanged: () => void;
}) {
  const ch = copy.door.change;
  const lk = copy.door.lookup;
  const ref = rowRef(row);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [note, setNote] = useState<{ tone: "done" | "refused"; text: string } | null>(null);
  const cancellable = row.status === "valid" && row.admittedCount === 0 && row.orderId !== null && row.orderLineId !== null;
  const nameable = row.status === "valid" && !row.holderName;

  const saveName = useCallback(async () => {
    if (!name.trim()) return;
    setBusy(true);
    setNote(null);
    try {
      const result = await posDoorNameTicket({ admissionId: row.id, holderName: name.trim() });
      if (result.ok) {
        setNote({ tone: "done", text: ch.nameDone });
        setNaming(false);
        onChanged();
      } else {
        const reason = "reason" in result ? result.reason : null;
        setNote({ tone: "refused", text: reason === "already_named" ? ch.nameAlready : reason === "not_valid" ? ch.nameNotValid : copy.door.loadFailed });
      }
    } finally {
      setBusy(false);
    }
  }, [ch.nameAlready, ch.nameDone, ch.nameNotValid, copy.door.loadFailed, name, onChanged, row.id, setBusy]);

  const cancelTicket = useCallback(async () => {
    if (!row.orderId || !row.orderLineId) return;
    setBusy(true);
    setNote(null);
    try {
      const result = await refundOrderAtDesk({ orderId: row.orderId, lineIds: [row.orderLineId], effect: "cancel_ticket" });
      setConfirmCancel(false);
      setNote({ tone: result.ok ? "done" : "refused", text: result.ok ? ch.cancelDone : copy.door.refundOutcome[result.outcome] });
      if (result.ok) onChanged();
    } finally {
      setBusy(false);
    }
  }, [ch.cancelDone, copy.door.refundOutcome, onChanged, row.orderId, row.orderLineId, setBusy]);

  const card = (title: string, note: string, action: ReactNode, reason?: string) => (
    <div className={cn(POS_SURFACE, "flex flex-col gap-3 border-[1px] p-4")}>
      <div className="text-[17px] font-semibold text-admin-ink">{title}</div>
      <p className="m-0 flex-1 text-[14px] leading-[1.45] text-admin-ink-muted">{note}</p>
      {action}
      {reason && <p className="m-0 text-[12px] leading-[1.4] text-admin-ink-dim">{reason}</p>}
    </div>
  );

  return (
    <PosSheet
      open
      name="door-change"
      title={interpolate(ch.title, { code: ref })}
      subtitle={interpolate(ch.subtitle, { name: rowName(row, lk), date: dateLabel })}
      closeLabel={copy.chrome.closeLabel}
      onClose={onClose}
      footerStart={
        <button type="button" onClick={onClose} className={POS_SECONDARY_ACTION}>
          {ch.back}
        </button>
      }
    >
      <div className="flex flex-col gap-3" data-door-change-panel>
        {note && (
          <p role={note.tone === "refused" ? "alert" : "status"} data-door-change-outcome={note.tone} className={cn("m-0 rounded-[12px] px-3.5 py-3 text-[14px] font-medium", note.tone === "done" ? "bg-admin-success-soft text-admin-success" : "bg-admin-critical-soft text-admin-red")}>
            {note.text}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
        {card(
          ch.transfer,
          ch.transferNote,
          <button type="button" disabled title={ch.transferReason} data-not-wired="true" className={cn(POS_OUTLINE_ACTION, "w-full")}>
            {ch.transferAction}
          </button>,
          ch.transferReason,
        )}
        {card(
          ch.exchange,
          ch.exchangeNote,
          <button type="button" disabled title={ch.exchangeReason} data-not-wired="true" className={cn(POS_OUTLINE_ACTION, "w-full")}>
            {ch.exchangeAction}
          </button>,
          ch.exchangeReason,
        )}
        {card(
          ch.cancel,
          ch.cancelNote,
          confirmCancel ? (
            <button type="button" disabled={busy} onClick={() => void cancelTicket()} className={cn(POS_DANGER_ACTION, "w-full")} data-door-cancel-confirm>
              {interpolate(ch.cancelConfirm, { code: ref })}
            </button>
          ) : (
            <button type="button" disabled={!cancellable || busy} onClick={() => setConfirmCancel(true)} className={cn(POS_DANGER_ACTION, "w-full")} data-door-cancel>
              {ch.cancelAction}
            </button>
          ),
        )}
        {card(
          ch.name,
          row.holderName ? interpolate(ch.nameNoteNamed, { code: ref, name: row.holderName }) : interpolate(ch.nameNote, { code: ref }),
          naming ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void saveName();
              }}
            >
              <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder={ch.namePlaceholder} className={cn(POS_INPUT, "h-12")} data-door-name-input />
              <button type="submit" disabled={busy || !name.trim()} className={POS_PRIMARY_ACTION.replace("h-14", "h-12")} data-door-name-save>
                {ch.nameSave}
              </button>
            </form>
          ) : (
            <button type="button" disabled={!nameable || busy} onClick={() => setNaming(true)} className={cn(POS_OUTLINE_ACTION, "w-full")} data-door-name>
              {ch.nameAction}
            </button>
          ),
        )}
        </div>
        <DoorNote tone="indigo">{ch.footnote}</DoorNote>
      </div>
    </PosSheet>
  );
}
