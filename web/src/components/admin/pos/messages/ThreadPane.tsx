"use client";

import { useState } from "react";

import {
  POS_INPUT,
  POS_PILL,
  POS_PILL_INDIGO,
  POS_PILL_SLATE,
  POS_PRIMARY_ACTION,
  POS_SECONDARY_ACTION,
  POS_SEGMENT,
  POS_SEGMENT_ACTIVE,
  POS_SEGMENT_IDLE,
  POS_SEGMENT_TRACK,
} from "@/components/admin/pos/pos-classes";
import { renderCard } from "@/lib/messaging/cards";
import type { MessagingSheetName } from "@/lib/messaging/fixture";
import type { InboxRow, ThreadMessage } from "@/lib/messaging/types";
import { cn } from "@/lib/utils";

import { ActionsMenu } from "./ActionsMenu";
import { OperatorCard } from "./cards/OperatorCard";
import type { messagesCopy } from "./copy";
import { isVisitorName } from "./format";

export function ThreadPane(props: {
  readonly copy: ReturnType<typeof messagesCopy>;
  readonly row: InboxRow | null;
  readonly messages: readonly ThreadMessage[];
  readonly draft: string;
  readonly onDraft: (value: string) => void;
  readonly onSend: () => void;
  readonly onNote: () => void;
  readonly focused: boolean;
  readonly onToggleFocus: () => void;
  readonly onOpenSheet: (sheet: MessagingSheetName) => void;
  readonly onAssign: () => void;
  readonly onResolve: () => void;
}) {
  const [composer, setComposer] = useState<"customer" | "note">("customer");
  const [actionsOpen, setActionsOpen] = useState(false);

  if (!props.row) {
    return <main className="flex flex-1 items-center justify-center text-[15px] text-admin-ink-muted">{props.copy.empty}</main>;
  }
  const name = isVisitorName(props.row.contactName) ? props.copy.visitor : props.row.contactName;
  return (
    <main className="flex min-w-0 flex-1 flex-col" data-pos-messages="thread">
      <div className="flex flex-wrap items-center gap-2 border-b border-admin-border-soft px-4 py-3">
        <button type="button" className={POS_SECONDARY_ACTION} onClick={props.onToggleFocus}>
          {props.focused ? props.copy.inbox : props.copy.details}
        </button>
        <h2 className="text-[18px] font-semibold">{name}</h2>
        <span className={cn(POS_PILL, POS_PILL_SLATE)}>{props.copy.conversation[props.row.conversationState]}</span>
        {props.row.opportunityState ? (
          <span className={cn(POS_PILL, POS_PILL_INDIGO)}>{props.copy.opportunity[props.row.opportunityState]}</span>
        ) : null}
        {props.row.recordChips.map((chip) => (
          <span key={`${chip.kind}-${chip.recordId}`} className="text-[13px] text-admin-ink-muted">
            {chip.label}
          </span>
        ))}
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" className={POS_SECONDARY_ACTION} onClick={props.onAssign}>
            {props.row.ownerLabel ?? props.copy.assign}
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
      <div className="border-t border-admin-border-soft p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className={POS_SEGMENT_TRACK}>
            <button
              type="button"
              className={cn(POS_SEGMENT, composer === "customer" ? POS_SEGMENT_ACTIVE : POS_SEGMENT_IDLE)}
              onClick={() => setComposer("customer")}
            >
              {props.copy.composerCustomer}
            </button>
            <button
              type="button"
              className={cn(POS_SEGMENT, composer === "note" ? POS_SEGMENT_ACTIVE : POS_SEGMENT_IDLE)}
              onClick={() => setComposer("note")}
            >
              {props.copy.composerNote}
            </button>
          </div>
          <p className="text-[12px] text-admin-ink-muted">
            {composer === "customer" ? props.copy.customerReceives : props.copy.note}
          </p>
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (composer === "note") props.onNote();
            else props.onSend();
          }}
        >
          <ActionsMenu
            copy={props.copy}
            open={actionsOpen}
            onToggle={() => setActionsOpen((value) => !value)}
            onPick={(sheet) => {
              setActionsOpen(false);
              props.onOpenSheet(sheet);
            }}
          />
          <input
            className={POS_INPUT}
            value={props.draft}
            onChange={(event) => props.onDraft(event.target.value)}
            placeholder={composer === "note" ? props.copy.notePlaceholder : props.copy.replyPlaceholder}
            aria-label={composer === "note" ? props.copy.note : props.copy.reply}
          />
          <button type="submit" className={POS_PRIMARY_ACTION}>
            {composer === "note" ? props.copy.note : props.copy.reply}
          </button>
        </form>
      </div>
    </main>
  );
}
