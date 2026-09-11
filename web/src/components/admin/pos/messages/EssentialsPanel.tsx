"use client";

import { useState } from "react";

import { POS_INPUT, POS_SECONDARY_ACTION, POS_SEGMENT, POS_SEGMENT_ACTIVE, POS_SEGMENT_IDLE, POS_SEGMENT_TRACK } from "@/components/admin/pos/pos-classes";
import type { Essentials } from "@/lib/messaging/types";
import { cn } from "@/lib/utils";

import type { messagesCopy } from "./copy";

export function EssentialsPanel(props: {
  readonly copy: ReturnType<typeof messagesCopy>;
  readonly essentials: Essentials | null;
  readonly note: string;
  readonly onNote: (value: string) => void;
  readonly onSaveNote: () => void;
}) {
  const [tab, setTab] = useState<"customer" | "linked" | "notes">("customer");
  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-l border-admin-border-soft bg-admin-card">
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
          <dl className="space-y-2">
            <div>
              <dt className="text-admin-ink-muted">{props.copy.customerTab}</dt>
              <dd className="font-semibold">{props.essentials?.customer.name ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-admin-ink-muted">email</dt>
              <dd>{props.essentials?.customer.email ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-admin-ink-muted">phone</dt>
              <dd>{props.essentials?.customer.phone ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-admin-ink-muted">identity</dt>
              <dd>{props.essentials?.customer.identityLevel ?? "none"}</dd>
            </div>
          </dl>
        ) : null}
        {tab === "linked" ? (
          <ul className="space-y-2">
            {(props.essentials?.linked ?? []).map((chip) => (
              <li key={`${chip.kind}-${chip.recordId}`} className="rounded-[12px] bg-admin-surface-alt px-3 py-2">
                {chip.label}
              </li>
            ))}
          </ul>
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
            <textarea className={POS_INPUT} value={props.note} onChange={(event) => props.onNote(event.target.value)} />
            <button type="button" className={POS_SECONDARY_ACTION} onClick={props.onSaveNote}>
              {props.copy.note}
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
