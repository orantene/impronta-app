"use client";

import { POS_INPUT, POS_PRIMARY_ACTION, POS_SECONDARY_ACTION } from "@/components/admin/pos/pos-classes";
import { renderCard } from "@/lib/messaging/cards";
import type { InboxRow, ThreadMessage } from "@/lib/messaging/types";

import type { messagesCopy } from "./copy";
import { OperatorCard } from "./cards/OperatorCard";

export function ThreadPane(props: {
  readonly copy: ReturnType<typeof messagesCopy>;
  readonly row: InboxRow | null;
  readonly messages: readonly ThreadMessage[];
  readonly draft: string;
  readonly onDraft: (value: string) => void;
  readonly onSend: () => void;
  readonly onOptions: () => void;
  readonly onPay: () => void;
  readonly onLost: () => void;
  readonly onResolve: () => void;
  readonly onAssign: () => void;
}) {
  if (!props.row) {
    return <main className="flex flex-1 items-center justify-center text-[15px] text-admin-ink-muted">{props.copy.empty}</main>;
  }
  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-admin-border-soft px-4 py-3">
        <h2 className="text-[18px] font-semibold">{props.row.contactName}</h2>
        <span className="text-[13px] text-admin-ink-muted">{props.copy.conversation[props.row.conversationState]}</span>
        {props.row.opportunityState ? (
          <span className="text-[13px] text-admin-ink-muted">{props.copy.opportunity[props.row.opportunityState]}</span>
        ) : null}
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" className={POS_SECONDARY_ACTION} onClick={props.onAssign}>
            {props.copy.assign}
          </button>
          <button type="button" className={POS_SECONDARY_ACTION} onClick={props.onOptions}>
            {props.copy.sendOptions}
          </button>
          <button type="button" className={POS_SECONDARY_ACTION} onClick={props.onPay}>
            {props.copy.requestPayment}
          </button>
          <button type="button" className={POS_SECONDARY_ACTION} onClick={props.onLost}>
            {props.copy.closeLost}
          </button>
          <button type="button" className={POS_SECONDARY_ACTION} onClick={props.onResolve}>
            {props.row.conversationState === "resolved" ? props.copy.reopen : props.copy.resolve}
          </button>
        </div>
      </div>
      <ol className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {props.messages.map((message) => (
          <li key={message.id}>
            <OperatorCard message={message} model={renderCard(message.kind, message.payload, "operator")} />
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
        <input
          className={POS_INPUT}
          value={props.draft}
          onChange={(event) => props.onDraft(event.target.value)}
          aria-label={props.copy.reply}
        />
        <button type="submit" className={POS_PRIMARY_ACTION}>
          {props.copy.reply}
        </button>
      </form>
    </main>
  );
}
