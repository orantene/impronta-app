"use client";

import { POS_PILL, POS_PILL_CORAL, POS_PILL_GREEN, POS_PILL_INDIGO, POS_PILL_SLATE } from "@/components/admin/pos/pos-classes";
import type { InboxRow } from "@/lib/messaging/types";
import { cn } from "@/lib/utils";

import type { messagesCopy } from "./copy";

export function InboxList(props: {
  readonly rows: readonly InboxRow[];
  readonly activeId: string | null;
  readonly emptyLabel: string;
  readonly copy: ReturnType<typeof messagesCopy>;
  readonly onOpen: (id: string) => void;
}) {
  if (props.rows.length === 0) {
    return <p className="px-4 py-6 text-[15px] text-admin-ink-muted">{props.emptyLabel}</p>;
  }
  return (
    <ul className="min-h-0 flex-1 overflow-y-auto">
      {props.rows.map((row) => (
        <li key={row.id}>
          <button
            type="button"
            className={cn(
              "flex w-full flex-col gap-1 border-b border-admin-border-soft px-4 py-3 text-left",
              props.activeId === row.id ? "bg-admin-brand-soft" : "bg-admin-card",
            )}
            onClick={() => props.onOpen(row.id)}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="font-semibold text-admin-ink">{row.contactName}</span>
              {row.unread ? <span className={cn(POS_PILL, POS_PILL_CORAL)}>•</span> : null}
            </span>
            <span className="flex flex-wrap gap-1">
              <span className={cn(POS_PILL, POS_PILL_SLATE)}>{props.copy.conversation[row.conversationState]}</span>
              {row.opportunityState ? (
                <span className={cn(POS_PILL, POS_PILL_INDIGO)}>{props.copy.opportunity[row.opportunityState]}</span>
              ) : null}
              {row.recordChips.map((chip) => (
                <span key={`${chip.kind}-${chip.recordId}`} className={cn(POS_PILL, POS_PILL_GREEN)}>
                  {chip.label}
                </span>
              ))}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
