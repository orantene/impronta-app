"use client";

import { POS_CHIP, POS_CHIP_ACTIVE, POS_CHIP_IDLE, POS_INPUT, POS_PRIMARY_ACTION } from "@/components/admin/pos/pos-classes";
import { renderCard } from "@/lib/messaging/cards";
import type { InboxFilter, InboxRow, ThreadMessage } from "@/lib/messaging/types";
import { INBOX_FILTERS } from "@/lib/messaging/types";
import { cn } from "@/lib/utils";

import { OperatorCard } from "../cards/OperatorCard";
import type { messagesCopy } from "../copy";

export function PhoneMessages(props: {
  readonly copy: ReturnType<typeof messagesCopy>;
  readonly rows: readonly InboxRow[];
  readonly active: InboxRow | null;
  readonly messages: readonly ThreadMessage[];
  readonly draft: string;
  readonly onDraft: (value: string) => void;
  readonly onOpen: (id: string) => void;
  readonly onSend: () => void;
  readonly filter: InboxFilter;
  readonly onFilter: (filter: InboxFilter) => void;
}) {
  if (!props.active) {
    return (
      <div className="flex h-full flex-col bg-admin-surface text-admin-ink" data-pos-messages="phone">
        <div className="flex flex-wrap gap-1 p-3">
          {INBOX_FILTERS.map((id) => (
            <button
              key={id}
              type="button"
              className={cn(POS_CHIP, props.filter === id ? POS_CHIP_ACTIVE : POS_CHIP_IDLE)}
              onClick={() => props.onFilter(id)}
            >
              {props.copy.filter[id]}
            </button>
          ))}
        </div>
        <ul className="flex-1 overflow-y-auto">
          {props.rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between border-b border-admin-border-soft px-4 py-4 text-left"
                onClick={() => props.onOpen(row.id)}
              >
                <span className="font-semibold">{row.contactName}</span>
                <span className="text-[13px] text-admin-ink-muted">{props.copy.conversation[row.conversationState]}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col bg-admin-surface text-admin-ink" data-pos-messages="phone-thread">
      <header className="border-b border-admin-border-soft px-4 py-3">
        <p className="font-semibold">{props.active.contactName}</p>
        <p className="text-[13px] text-admin-ink-muted">{props.copy.conversation[props.active.conversationState]}</p>
      </header>
      <ol className="flex-1 space-y-3 overflow-y-auto p-3">
        {props.messages.map((message) => (
          <li key={message.id}>
            <OperatorCard message={message} model={renderCard(message.kind, message.payload, "customer")} />
          </li>
        ))}
      </ol>
      <form
        className="flex gap-2 border-t border-admin-border-soft p-3"
        onSubmit={(event) => {
          event.preventDefault();
          props.onSend();
        }}
      >
        <input className={POS_INPUT} value={props.draft} onChange={(event) => props.onDraft(event.target.value)} />
        <button type="submit" className={POS_PRIMARY_ACTION}>
          {props.copy.reply}
        </button>
      </form>
    </div>
  );
}
