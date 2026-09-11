"use client";

import { POS_NOTE_INFO, POS_SECONDARY_ACTION } from "@/components/admin/pos/pos-classes";
import { cn } from "@/lib/utils";

import type { messagesCopy } from "./copy";

export function IncomingToast(props: {
  readonly copy: ReturnType<typeof messagesCopy>;
  readonly visible: boolean;
  readonly onOpen: () => void;
  readonly onLater: () => void;
}) {
  if (!props.visible) return null;
  return (
    <div className={cn(POS_NOTE_INFO, "mx-4 mt-3 flex items-center justify-between gap-3")} role="status" data-pos-messages-toast="">
      <p className="text-[14px]">{props.copy.toastIncoming}</p>
      <div className="flex gap-2">
        <button type="button" className={POS_SECONDARY_ACTION} onClick={props.onOpen}>
          {props.copy.open}
        </button>
        <button type="button" className={POS_SECONDARY_ACTION} onClick={props.onLater}>
          {props.copy.later}
        </button>
      </div>
    </div>
  );
}
