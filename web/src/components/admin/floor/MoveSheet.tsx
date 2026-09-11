"use client";

/**
 * MoveSheet — T12 "Move / join / merge chooser" (`POSTableChange`) and T13
 * "Move the party" (`POSMoveParty`) in one sheet with two steps.
 *
 * The move is wired: `actions.moveVisit` carries the check and the kitchen
 * tickets with the party (the engine's own rule) and leaves the old table
 * needing a reset. Joining a second table to an ALREADY SEATED party and
 * merging two checks have no writer in the engine (a join is decided at
 * seating time, T05; there is no check-merge command), so those two cards
 * are drawn disabled over their one sentence.
 */

import { ArrowRight, Layers, ShoppingBag } from "lucide-react";
import { useState } from "react";

import { interpolate } from "@/i18n/interpolate";
import type { FloorTable } from "@/lib/visits/floor";
import { cn } from "@/lib/utils";
import { POS_INPUT, POS_LABEL, POS_OUTLINE_ACTION, POS_PRIMARY_ACTION, POS_SECONDARY_ACTION } from "../pos/pos-classes";
import { PosSheet } from "../pos/PosSheet";

import type { FloorBoardCopy } from "./floor-copy";
import { seatedEntryFor, tableCode } from "./floor-model";
import { FACT_ROW } from "./floor-tones";
import type { FloorBoardData } from "./floor-types";
import { moneyFor } from "./FloorViews";

export type MoveSheetProps = {
  readonly open: boolean;
  readonly data: FloorBoardData;
  readonly copy: FloorBoardCopy;
  readonly table: FloorTable;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onMove: (destination: FloorTable) => void;
};

type Step = "choose" | "move";

function whyNot(dest: FloorTable, partySize: number | null, copy: FloorBoardCopy): string | null {
  const m = copy.move;
  if (dest.blocked) return m.blocked;
  if (dest.state === "occupied") return m.occupied;
  if (dest.needsResetSinceIso) return m.needsReset;
  if (partySize != null && partySize < dest.partyMin) return m.tooLarge;
  if (partySize != null && partySize > dest.partyMax) return m.tooSmall;
  if (dest.state === "held") return m.held;
  return null;
}

export function MoveSheet(props: MoveSheetProps) {
  const { data, copy, table, busy } = props;
  const [step, setStep] = useState<Step>("choose");
  const [choice, setChoice] = useState<string | null>(null);
  const code = tableCode(table);
  const entry = seatedEntryFor(table, data.book);
  const partySize = table.partySize ?? entry?.partySize ?? null;
  const party = [entry?.holderName ?? copy.panel.walkIn, partySize == null ? null : String(partySize)].filter(Boolean).join(" · ");
  const candidates = data.tables.filter((t) => t.spaceId !== table.spaceId && !t.joinedFromSpaceId);
  const chosen = candidates.find((t) => t.spaceId === choice) ?? null;
  const ticket = table.orderId ? data.tickets[table.orderId] : undefined;

  const chooser = (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {[
        { id: "move", icon: ArrowRight, title: copy.change.moveTitle, body: interpolate(copy.change.moveBody, { code }), cta: copy.change.moveCta, onSelect: () => setStep("move"), reason: null },
        { id: "join", icon: Layers, title: copy.change.joinTitle, body: copy.change.joinBody, cta: copy.change.joinCta, onSelect: undefined, reason: copy.change.joinReason },
        { id: "merge", icon: ShoppingBag, title: copy.change.mergeTitle, body: copy.change.mergeBody, cta: copy.change.mergeCta, onSelect: undefined, reason: copy.change.mergeReason },
      ].map((card) => {
        const Icon = card.icon;
        return (
          <li key={card.id} data-floor-change={card.id} className="flex items-center gap-4 rounded-[16px] border-[1.5px] border-admin-border bg-admin-card px-4 py-4">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-admin-surface-alt text-admin-ink">
              <Icon aria-hidden size={20} strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[17px] font-semibold text-admin-ink">{card.title}</span>
              <span className="block text-[14px] leading-[1.4] text-admin-ink-muted">{card.reason ?? card.body}</span>
            </span>
            <button type="button" className={POS_OUTLINE_ACTION} disabled={busy || !card.onSelect} title={card.reason ?? undefined} onClick={card.onSelect}>
              {card.cta}
            </button>
          </li>
        );
      })}
    </ul>
  );

  const mover = (
    <div className="flex flex-col gap-4">
      {candidates.length === 0 ? (
        <p className="m-0 text-[15px] text-admin-ink-muted">{copy.move.none}</p>
      ) : (
        <ul role="radiogroup" className="m-0 grid list-none grid-cols-3 gap-3 p-0">
          {candidates.map((dest) => {
            const reason = whyNot(dest, table.partySize, copy);
            const active = chosen?.spaceId === dest.spaceId;
            const seatsLine = interpolate(copy.move.seats, { min: dest.partyMin, max: dest.partyMax });
            return (
              <li key={dest.spaceId}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  data-floor-move-to={tableCode(dest)}
                  disabled={busy || Boolean(reason)}
                  onClick={() => setChoice(dest.spaceId)}
                  className={cn(
                    "flex min-h-[82px] w-full flex-col items-center justify-center gap-0.5 rounded-[14px] border-[1.5px] px-2 text-center transition-colors disabled:cursor-not-allowed",
                    active ? "border-admin-brand bg-admin-brand-soft" : reason ? "border-admin-border bg-admin-card text-admin-ink-dim" : "border-admin-border bg-admin-card hover:bg-admin-surface-alt",
                  )}
                >
                  <span className={cn("text-[17px] font-semibold", reason ? "text-admin-ink-dim" : "text-admin-ink")}>{tableCode(dest)}</span>
                  <span className={cn("text-[13px]", reason ? "text-admin-ink-dim" : "text-admin-ink-muted")}>{seatsLine}</span>
                  <span className={cn("text-[13px] font-semibold", reason ? "text-admin-ink-dim" : "text-admin-brand")}>{reason ?? copy.move.free}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="rounded-[14px] border-[1.5px] border-admin-border bg-admin-card px-4 py-1">
        <div className={FACT_ROW}>
          <span className="text-admin-ink-muted">{copy.move.goesWithThem}</span>
          <strong className="text-right text-admin-ink">
            {table.orderId ? interpolate(copy.move.goesValue, { amount: moneyFor(table, data), n: ticket ? 1 : 0 }) : copy.move.goesNothing}
          </strong>
        </div>
        <div className={FACT_ROW}>
          <span className="text-admin-ink-muted">{interpolate(copy.move.after, { code })}</span>
          <strong className="text-right text-admin-ink">{copy.move.afterValue}</strong>
        </div>
      </div>
      <div>
        <label htmlFor="floor-move-why" className={POS_LABEL}>
          {copy.move.why}
        </label>
        <input id="floor-move-why" className={POS_INPUT} disabled title={copy.move.whyReason} aria-describedby="floor-move-why-reason" />
        <p id="floor-move-why-reason" className="m-0 mt-1 text-[12.5px] text-admin-ink-muted">
          {copy.move.whyReason}
        </p>
      </div>
    </div>
  );

  return (
    <PosSheet
      open={props.open}
      name={step === "choose" ? "table-change" : "move-party"}
      crumb={step === "move" ? interpolate(copy.move.crumb, { code }) : undefined}
      title={step === "choose" ? interpolate(copy.change.title, { code, party }) : interpolate(copy.move.title, { party })}
      subtitle={step === "choose" ? copy.change.subtitle : copy.move.subtitle}
      closeLabel={copy.popover.close}
      onClose={props.onClose}
      footerStart={
        step === "choose" ? (
          <button type="button" className={POS_SECONDARY_ACTION} disabled={busy} onClick={props.onClose}>
            {copy.change.cancel}
          </button>
        ) : (
          <button type="button" className={POS_SECONDARY_ACTION} disabled={busy} onClick={() => setStep("choose")}>
            {copy.move.back}
          </button>
        )
      }
      footerEnd={
        step === "move" ? (
          <button type="button" data-floor-move-confirm className={POS_PRIMARY_ACTION} disabled={busy || !chosen} onClick={() => chosen && props.onMove(chosen)}>
            {interpolate(copy.move.confirm, { code: chosen ? tableCode(chosen) : "…" })}
          </button>
        ) : undefined
      }
    >
      {step === "choose" ? chooser : mover}
    </PosSheet>
  );
}
