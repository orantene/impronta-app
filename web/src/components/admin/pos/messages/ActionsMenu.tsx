"use client";

import { POS_NOTE, POS_SECONDARY_ACTION } from "@/components/admin/pos/pos-classes";
import type { MessagingSheetName } from "@/lib/messaging/fixture";

import type { messagesCopy } from "./copy";

export function ActionsMenu(props: {
  readonly copy: ReturnType<typeof messagesCopy>;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly onPick: (sheet: MessagingSheetName) => void;
}) {
  const items: Array<{ sheet: MessagingSheetName; label: string; hint: string; disabled?: string }> = [
    { sheet: "options", label: props.copy.sendOptions, hint: props.copy.previewCard },
    { sheet: "link", label: props.copy.createOrLink, hint: props.copy.nothingLinked },
    { sheet: "payment", label: props.copy.requestPayment, hint: props.copy.owedNow },
    { sheet: "note", label: props.copy.attachFile, hint: props.copy.disabled.attach, disabled: props.copy.disabled.attach },
    { sheet: "note", label: props.copy.note, hint: props.copy.composerNote },
    { sheet: "reminder", label: props.copy.scheduleReminder, hint: props.copy.reminderOne },
  ];
  return (
    <div className="relative">
      <button type="button" className={POS_SECONDARY_ACTION} aria-expanded={props.open} onClick={props.onToggle}>
        {props.copy.actions}
      </button>
      {props.open ? (
        <ul className="absolute bottom-14 left-0 z-20 w-[320px] rounded-[16px] border-[1.5px] border-admin-border bg-admin-card p-2 shadow-admin-rest">
          {items.map((item) => (
            <li key={`${item.sheet}-${item.label}`}>
              <button
                type="button"
                className="flex w-full flex-col items-start rounded-[12px] px-3 py-2 text-left hover:bg-admin-surface-alt disabled:opacity-40"
                disabled={Boolean(item.disabled)}
                title={item.disabled}
                onClick={() => props.onPick(item.sheet)}
              >
                <span className="text-[15px] font-semibold">{item.label}</span>
                <span className="text-[13px] text-admin-ink-muted">{item.hint}</span>
              </button>
            </li>
          ))}
          <li>
            <p className={POS_NOTE}>{props.copy.disabled.attach}</p>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
