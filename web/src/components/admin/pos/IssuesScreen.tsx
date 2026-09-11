"use client";

/**
 * IssuesScreen — M24, `POSIssues`: `Open N · Mine N · Done today N`, the
 * `All · Payments · Kitchen · Devices · Orders` filter, and one row per
 * issue with its severity dot, title, second line, owner, action, chevron.
 *
 * NOT WIRED. The counter has no issues table and no reader for one (the
 * design's Issues is the workspace's own inbox, `lib/pos/modes.ts`), so the
 * screen draws the board's frame over an empty list with one sentence, and
 * every filter is disabled with the same sentence (D-POS-28). The rail
 * count is not drawn because there is nothing to count.
 */

import { cn } from "@/lib/utils";
import { POS_SEGMENT, POS_SEGMENT_ACTIVE, POS_SEGMENT_IDLE, POS_SEGMENT_TRACK } from "./pos-classes";

export type IssuesCopy = {
  readonly title: string;
  readonly subtitle: string;
  readonly open: string;
  readonly mine: string;
  readonly doneToday: string;
  readonly all: string;
  readonly payments: string;
  readonly kitchen: string;
  readonly devices: string;
  readonly orders: string;
  readonly unavailable: string;
};

export function IssuesScreen({ copy }: { readonly copy: IssuesCopy }) {
  return (
    <div data-pos-issues className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-5">
      <div className="flex items-center gap-4">
        <div className={POS_SEGMENT_TRACK} role="group" aria-label={copy.title}>
          <span className={cn(POS_SEGMENT, "h-11 px-4 text-[15px]", POS_SEGMENT_ACTIVE)}>{copy.open} 0</span>
          {[copy.mine, copy.doneToday].map((label) => (
            <button key={label} type="button" disabled title={copy.unavailable} className={cn(POS_SEGMENT, "h-11 px-4 text-[15px]", POS_SEGMENT_IDLE)}>
              {label}
            </button>
          ))}
        </div>
        <div className={POS_SEGMENT_TRACK} role="group" aria-label={copy.all}>
          <span className={cn(POS_SEGMENT, "h-11 px-3.5", POS_SEGMENT_ACTIVE)}>{copy.all}</span>
          {[copy.payments, copy.kitchen, copy.devices, copy.orders].map((label) => (
            <button key={label} type="button" disabled title={copy.unavailable} className={cn(POS_SEGMENT, "h-11 px-3.5", POS_SEGMENT_IDLE)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <p role="status" data-pos-issues-empty className="m-0 mt-5 rounded-[16px] border-[1.5px] border-admin-border bg-admin-card px-5 py-6 text-center text-[15px] text-admin-ink-muted">
        {copy.unavailable}
      </p>
    </div>
  );
}
