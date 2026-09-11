"use client";

/**
 * W48's interactive half: the assignment rows with `Replace…`, and the
 * replace sheet showing the impact before anything is confirmed.
 *
 * NOT WIRED (D-POS-38). The engine can add and delete a `booking_talent`
 * row (`addBookingTalentRow`, `deleteBookingTalentRow`) but has no reader
 * that lists who fits a job, no invitation state on an assignment and no
 * notification to the outgoing person, so `Replacement` is drawn disabled
 * with the reason and `Replace and invite` cannot be pressed. The impact
 * rows are the record's own facts (the date, the fee line, that client
 * money stands), which is what the board promises to show first.
 */

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { BTN_PRIMARY, BTN_ROW, BTN_SECONDARY, Eyebrow, KeyValue, ListRow, Pill } from "../_shared";
import { RecordSheet } from "../_sheet";

export type TeamRowView = {
  id: string;
  name: string;
  roleLine: string;
  feeLine: string;
  stateLabel: string;
};

export type TeamReplaceCopy = {
  replace: string;
  sheetTitle: string;
  sheetSubtitle: string;
  closeLabel: string;
  replacement: string;
  replacementUnavailable: string;
  impact: string;
  schedule: string;
  scheduleValue: string;
  fee: string;
  clientMoney: string;
  clientMoneyValue: string;
  outgoing: string;
  outgoingValue: string;
  client: string;
  clientValue: string;
  note: string;
  cancel: string;
  confirm: string;
};

const COLS = "grid-cols-[110px_1.3fr_1.5fr_170px_100px]";

export function TeamRows({ rows, copy }: { rows: TeamRowView[]; copy: TeamReplaceCopy }) {
  const [replacing, setReplacing] = useState<TeamRowView | null>(null);
  return (
    <>
      <ul className="m-0 list-none p-0" data-project-team>
        {rows.map((row) => (
          <li key={row.id}>
            <ListRow cols={COLS} className="border-t">
              <b>{row.name}</b>
              <span className="text-admin-ink-muted">{row.roleLine}</span>
              <span className="text-admin-ink-muted">{row.feeLine}</span>
              <span>
                <Pill tone="slate">{row.stateLabel}</Pill>
              </span>
              <span className="flex justify-end">
                <button type="button" onClick={() => setReplacing(row)} className={cn(BTN_SECONDARY, BTN_ROW)} data-team-replace={row.id}>
                  {copy.replace}
                </button>
              </span>
            </ListRow>
          </li>
        ))}
      </ul>
      <RecordSheet
        open={replacing !== null}
        name="replace"
        title={replacing ? copy.sheetTitle.replace("{name}", replacing.name) : copy.sheetTitle}
        subtitle={copy.sheetSubtitle}
        closeLabel={copy.closeLabel}
        onClose={() => setReplacing(null)}
        footerStart={
          <button type="button" onClick={() => setReplacing(null)} className={BTN_SECONDARY}>
            {copy.cancel}
          </button>
        }
        footerEnd={
          <button type="button" disabled title={copy.replacementUnavailable} className={BTN_PRIMARY}>
            {copy.confirm}
          </button>
        }
      >
        {replacing ? (
          <>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-admin-ink">{copy.replacement}</label>
              <button
                type="button"
                disabled
                title={copy.replacementUnavailable}
                className="flex h-9 w-full items-center gap-2 rounded-[9px] border border-admin-border bg-admin-surface-alt px-3 text-left text-[13px] text-admin-ink-dim disabled:cursor-not-allowed"
              >
                <span className="flex-1 truncate">{copy.replacementUnavailable}</span>
                <ChevronDown aria-hidden size={14} strokeWidth={1.75} />
              </button>
            </div>
            <Eyebrow>{copy.impact}</Eyebrow>
            <div className="rounded-[12px] border border-admin-border bg-admin-card px-4 py-3">
              <KeyValue label={copy.schedule} value={copy.scheduleValue} />
              <KeyValue label={copy.fee} value={replacing.feeLine} />
              <KeyValue label={copy.clientMoney} value={copy.clientMoneyValue} />
              <KeyValue label={replacing.name} value={copy.outgoingValue} />
              <KeyValue label={copy.client} value={copy.clientValue} />
            </div>
            <p className="m-0 rounded-[10px] bg-admin-surface-alt px-3 py-2.5 text-[12.5px] text-admin-ink-muted">{copy.note}</p>
          </>
        ) : null}
      </RecordSheet>
    </>
  );
}
