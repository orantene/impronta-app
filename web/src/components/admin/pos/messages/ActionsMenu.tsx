"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { POS_NOTE, POS_SECONDARY_ACTION } from "@/components/admin/pos/pos-classes";
import { actionsMenuPlacement, type ActionsMenuPlacement } from "@/lib/messaging/actions-menu-placement";
import type { MessagingSheetName } from "@/lib/messaging/fixture";

import { messagingActionItems } from "./action-items";
import type { messagesCopy } from "./copy";

export function ActionsMenu(props: {
  readonly copy: ReturnType<typeof messagesCopy>;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly onPick: (sheet: MessagingSheetName) => void;
}) {
  const items = messagingActionItems(props.copy);
  const trigger = useRef<HTMLButtonElement>(null);
  // Measured when the menu opens (D-144): the side with more room, and a
  // height bound to that room so the list scrolls instead of leaving the
  // screen. Null until measured, and the menu is not drawn until then, so
  // the first paint never lands on the wrong side.
  const [placement, setPlacement] = useState<ActionsMenuPlacement | null>(null);
  const { open } = props;
  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    setPlacement(actionsMenuPlacement({ triggerTop: rect.top, triggerBottom: rect.bottom, viewportHeight: window.innerHeight }));
  }, [open]);
  return (
    <div className="relative">
      <button ref={trigger} type="button" className={POS_SECONDARY_ACTION} aria-expanded={props.open} onClick={props.onToggle}>
        {props.copy.actions}
      </button>
      {props.open && placement ? (
        <ul
          data-pos-actions-menu={placement.side}
          style={{ maxHeight: placement.maxHeight }}
          className={`absolute left-0 z-20 w-[320px] overflow-y-auto rounded-[16px] border-[1.5px] border-admin-border bg-admin-card p-2 shadow-admin-rest ${placement.side === "above" ? "bottom-14" : "top-14"}`}
        >
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
