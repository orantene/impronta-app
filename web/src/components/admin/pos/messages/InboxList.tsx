"use client";

import { POS_PILL, POS_PILL_CORAL, POS_PILL_GREEN, POS_PILL_INDIGO, POS_PILL_SLATE, POS_SECONDARY_ACTION } from "@/components/admin/pos/pos-classes";
import type { InboxRow } from "@/lib/messaging/types";
import { cn } from "@/lib/utils";

import type { messagesCopy } from "./copy";
import { clockLabel, initials, isVisitorName } from "./format";

export function InboxList(props: {
  readonly rows: readonly InboxRow[];
  readonly activeId: string | null;
  readonly emptyLabel: string;
  readonly emptyBody?: string;
  readonly emptyAction?: string;
  readonly onEmptyAction?: () => void;
  readonly copy: ReturnType<typeof messagesCopy>;
  readonly onOpen: (id: string) => void;
  readonly onNextAction?: (row: InboxRow) => void;
}) {
  if (props.rows.length === 0) {
    return (
      <div className="px-4 py-8" data-pos-messages-empty="">
        <p className="text-[17px] font-semibold text-admin-ink">{props.emptyLabel}</p>
        {props.emptyBody ? <p className="mt-2 text-[15px] text-admin-ink-muted">{props.emptyBody}</p> : null}
        {props.emptyAction && props.onEmptyAction ? (
          <button type="button" className={cn(POS_SECONDARY_ACTION, "mt-4")} onClick={props.onEmptyAction}>
            {props.emptyAction}
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <ul className="min-h-0 flex-1 overflow-y-auto">
      {props.rows.map((row) => {
        const name = isVisitorName(row.contactName) ? props.copy.visitor : row.contactName;
        return (
          <li key={row.id}>
            <div
              className={cn(
                "flex w-full gap-3 border-b border-admin-border-soft px-4 py-3 text-left",
                props.activeId === row.id ? "bg-admin-brand-soft" : "bg-admin-card",
              )}
            >
            <button type="button" className="flex min-w-0 flex-1 gap-3 text-left" onClick={() => props.onOpen(row.id)}>
              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-admin-surface-alt text-[12px] font-bold">
                {initials(name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold text-admin-ink">
                    {name}
                    <span className="ml-1 font-normal text-admin-ink-muted">· {row.channel.replace("_", " ")}</span>
                  </span>
                  <span className="shrink-0 text-[12px] text-admin-ink-muted">{clockLabel(row.lastCustomerMessageAt ?? row.updatedAt)}</span>
                </span>
                <span className="mt-0.5 block truncate text-[14px] font-medium text-admin-ink">{row.subject}</span>
                <span className="mt-0.5 block truncate text-[13px] text-admin-ink-muted">{row.lastMessagePreview}</span>
                <span className="mt-2 flex flex-wrap items-center gap-1">
                  {row.unreadCount > 0 ? (
                    <span className={cn(POS_PILL, POS_PILL_CORAL)}>{row.unreadCount}</span>
                  ) : null}
                  <span className={cn(POS_PILL, POS_PILL_SLATE)}>{props.copy.conversation[row.conversationState]}</span>
                  {row.opportunityState ? (
                    <span className={cn(POS_PILL, POS_PILL_INDIGO)}>{props.copy.opportunity[row.opportunityState]}</span>
                  ) : null}
                  {row.recordChips.map((chip) => (
                    <span key={`${chip.kind}-${chip.recordId}`} className={cn(POS_PILL, POS_PILL_GREEN)}>
                      {chip.label}
                    </span>
                  ))}
                  <span className="ml-auto text-[12px] text-admin-ink-muted">{row.ownerLabel ?? props.copy.unassigned}</span>
                </span>
              </span>
            </button>
            {row.nextAction ? (
              <button
                type="button"
                className={cn(POS_SECONDARY_ACTION, "h-9 self-end px-3 text-[13px]")}
                onClick={() => props.onNextAction?.(row)}
              >
                {props.copy.next[row.nextAction]}
              </button>
            ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
