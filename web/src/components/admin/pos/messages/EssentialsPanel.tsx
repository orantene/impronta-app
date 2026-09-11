"use client";

import { useState } from "react";

import {
  POS_INPUT,
  POS_NOTE,
  POS_SECONDARY_ACTION,
  POS_SEGMENT,
  POS_SEGMENT_ACTIVE,
  POS_SEGMENT_IDLE,
  POS_SEGMENT_TRACK,
} from "@/components/admin/pos/pos-classes";
import type { MessagingSheetName } from "@/lib/messaging/fixture";
import type { Essentials } from "@/lib/messaging/types";
import { cn } from "@/lib/utils";

import type { messagesCopy } from "./copy";

export function EssentialsPanel(props: {
  readonly copy: ReturnType<typeof messagesCopy>;
  readonly essentials: Essentials | null;
  readonly note: string;
  readonly onNote: (value: string) => void;
  readonly onSaveNote: () => void;
  readonly collapsed?: boolean;
  readonly onOpenSheet: (sheet: MessagingSheetName) => void;
}) {
  const [tab, setTab] = useState<"customer" | "linked" | "notes">("customer");
  const [historyOpen, setHistoryOpen] = useState(false);
  if (props.collapsed) {
    return (
      <aside className="flex w-14 shrink-0 flex-col items-center gap-2 border-l border-admin-border-soft bg-admin-card py-3">
        <button type="button" className={POS_SECONDARY_ACTION} onClick={() => props.onOpenSheet("capture")}>
          {props.copy.details}
        </button>
      </aside>
    );
  }
  const customer = props.essentials?.customer;
  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-l border-admin-border-soft bg-admin-card" data-pos-messages="essentials">
      <div className={cn(POS_SEGMENT_TRACK, "m-3")}>
        {(
          [
            ["customer", props.copy.customerTab],
            ["linked", props.copy.linkedTab],
            ["notes", props.copy.notesTab],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={cn(POS_SEGMENT, tab === id ? POS_SEGMENT_ACTIVE : POS_SEGMENT_IDLE)}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 text-[14px]">
        {tab === "customer" ? (
          <div className="space-y-3">
            <div className="flex justify-end">
              <button type="button" className={POS_SECONDARY_ACTION} onClick={() => props.onOpenSheet("match")}>
                {props.copy.matchExisting}
              </button>
            </div>
            <Field label={props.copy.customerTab} value={customer?.name || props.copy.nameNotGiven} action={props.copy.ask} onAction={() => props.onOpenSheet("capture")} />
            <Field
              label={props.copy.webChatOnly}
              value={customer?.phone || customer?.email || props.copy.webChatOnly}
              action={props.copy.ask}
              onAction={() => props.onOpenSheet("capture")}
            />
            <Field label={props.copy.request} value={customer?.request || props.copy.nameNotGiven} />
            <Field label={props.copy.source} value={customer?.source || props.copy.nameNotGiven} />
            <p className={POS_NOTE}>{props.copy.confirmSuggestions}</p>
          </div>
        ) : null}
        {tab === "linked" ? (
          <div className="space-y-2">
            {(props.essentials?.linked ?? []).length === 0 ? <p className="text-admin-ink-muted">{props.copy.nothingLinked}</p> : null}
            {(props.essentials?.linked ?? []).map((chip) => (
              <button
                key={`${chip.kind}-${chip.recordId}`}
                type="button"
                className="w-full rounded-[12px] bg-admin-surface-alt px-3 py-2 text-left"
                onClick={() => props.onOpenSheet("link")}
              >
                <p className="font-semibold">{chip.label}</p>
                <p className="text-[12px] text-admin-ink-muted">
                  {chip.kind}
                  {chip.paymentState ? ` · ${chip.paymentState}` : ""}
                </p>
              </button>
            ))}
            <button type="button" className={POS_SECONDARY_ACTION} onClick={() => props.onOpenSheet("link")}>
              {props.copy.createOrLink}
            </button>
          </div>
        ) : null}
        {tab === "notes" ? (
          <div className="space-y-3">
            <ul className="space-y-2">
              {(props.essentials?.notes ?? []).map((note) => (
                <li key={note.id} className="rounded-[12px] bg-admin-surface-alt px-3 py-2">
                  {note.body}
                </li>
              ))}
            </ul>
            <textarea className={POS_INPUT} value={props.note} onChange={(event) => props.onNote(event.target.value)} aria-label={props.copy.note} />
            <button type="button" className={POS_SECONDARY_ACTION} onClick={props.onSaveNote}>
              {props.copy.note}
            </button>
            <button type="button" className="text-[13px] font-semibold text-admin-brand" onClick={() => setHistoryOpen((value) => !value)}>
              {props.copy.history}
            </button>
            {historyOpen ? <p className={POS_NOTE}>{props.copy.searchHint}</p> : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function Field(props: { label: string; value: string; action?: string; onAction?: () => void }) {
  return (
    <div>
      <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-admin-ink-muted">{props.label}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="font-medium text-admin-ink">{props.value}</p>
        {props.action && props.onAction ? (
          <button type="button" className="text-[13px] font-semibold text-admin-brand" onClick={props.onAction}>
            {props.action}
          </button>
        ) : null}
      </div>
    </div>
  );
}
