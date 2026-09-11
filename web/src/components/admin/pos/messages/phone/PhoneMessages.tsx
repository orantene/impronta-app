"use client";

import {
  POS_CHIP,
  POS_CHIP_ACTIVE,
  POS_CHIP_IDLE,
  POS_INPUT,
  POS_NOTE,
  POS_NOTE_INFO,
  POS_PRIMARY_ACTION,
  POS_SECONDARY_ACTION,
} from "@/components/admin/pos/pos-classes";
import { renderCard } from "@/lib/messaging/cards";
import type { MessagingSheetName } from "@/lib/messaging/fixture";
import type { InboxFilter, InboxRow, ThreadMessage } from "@/lib/messaging/types";
import { INBOX_FILTERS } from "@/lib/messaging/types";
import { cn } from "@/lib/utils";

import { OperatorCard } from "../cards/OperatorCard";
import type { messagesCopy } from "../copy";
import { clockLabel, isVisitorName } from "../format";
import { InboxList } from "../InboxList";

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
  readonly onOpenSheet: (sheet: MessagingSheetName) => void;
  readonly search: string;
  readonly onSearch: (value: string) => void;
  readonly toast: boolean;
  readonly onToast: () => void;
}) {
  if (!props.active) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-admin-surface text-admin-ink" data-pos-messages="phone">
        {props.toast ? (
          <div className={cn(POS_NOTE_INFO, "m-3")}>
            <p>{props.copy.toastIncoming}</p>
            <button type="button" className={POS_SECONDARY_ACTION} onClick={props.onToast}>
              {props.copy.open}
            </button>
          </div>
        ) : null}
        <input
          className={cn(POS_INPUT, "m-3 w-auto")}
          value={props.search}
          onChange={(event) => props.onSearch(event.target.value)}
          placeholder={props.copy.search}
          aria-label={props.copy.search}
        />
        <div className="flex flex-nowrap gap-1 overflow-x-auto px-3 pb-2">
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
        <InboxList
          rows={props.rows}
          activeId={null}
          emptyLabel={props.copy.empty}
          copy={props.copy}
          onOpen={props.onOpen}
        />
        <p className={cn(POS_NOTE, "m-3")}>{props.copy.disabled.today}</p>
      </div>
    );
  }
  const name = isVisitorName(props.active.contactName) ? props.copy.visitor : props.active.contactName;
  return (
    <div className="flex h-full min-h-0 flex-col bg-admin-surface text-admin-ink" data-pos-messages="phone-thread">
      <header className="border-b border-admin-border-soft px-4 py-3">
        <p className="font-semibold">{name}</p>
        <p className="text-[13px] text-admin-ink-muted">{props.copy.conversation[props.active.conversationState]}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {props.active.recordChips.map((chip) => (
            <button key={chip.recordId} type="button" className={POS_SECONDARY_ACTION} onClick={() => props.onOpenSheet("link")}>
              {props.copy.record[chip.kind]}
            </button>
          ))}
        </div>
      </header>
      {props.active.nextAction === "reply" ? <p className={cn(POS_NOTE_INFO, "mx-3 mt-2")}>{props.copy.nudgeReply}</p> : null}
      <ol className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {props.messages.map((message) => (
          <li key={message.id}>
            <OperatorCard message={message} model={renderCard(message.kind, message.payload, "operator")} />
          </li>
        ))}
      </ol>
      <div className="space-y-2 border-t border-admin-border-soft p-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" className={POS_SECONDARY_ACTION} onClick={() => props.onOpenSheet("actions")}>
            {props.copy.actions}
          </button>
          <button type="button" className={POS_SECONDARY_ACTION} onClick={() => props.onOpenSheet("payment")}>
            {props.copy.collectLink}
          </button>
          <button type="button" className={POS_SECONDARY_ACTION} disabled title={props.copy.disabled.tapToPay}>
            {props.copy.collectTap}
          </button>
          <button type="button" className={POS_SECONDARY_ACTION} onClick={() => props.onOpenSheet("payment")}>
            {props.copy.collectCash}
          </button>
          <button type="button" className={POS_SECONDARY_ACTION} onClick={() => props.onOpenSheet("payment")}>
            {props.copy.collectPickup}
          </button>
        </div>
        <form
          className="flex gap-2"
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
            placeholder={props.copy.replyPlaceholder}
          />
          <button type="submit" className={POS_PRIMARY_ACTION}>
            {props.copy.reply}
          </button>
        </form>
        <p className="text-[12px] text-admin-ink-muted">{clockLabel(props.active.lastCustomerMessageAt)}</p>
      </div>
    </div>
  );
}
