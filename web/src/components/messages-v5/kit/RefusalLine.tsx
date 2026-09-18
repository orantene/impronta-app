/**
 * RefusalLine, OkLine, AlertLine: one sentence, one action (boards D04, D10).
 * The refusal sentence is the catalogue entry for the engine code
 * (`dashboard.pos.messages.refusal.<code>`), never free text.
 */

import type { MessagingRefusal } from "@/lib/messaging/types";

import type { KitCopy } from "./copy";
import { Btn, Icon } from "./primitives";

export type LineAction = { readonly label: string; readonly onClick: () => void; readonly busy?: boolean };

export function RefusalLine({ code, copy, action, variant = "desktop" }: { code: MessagingRefusal; copy: KitCopy; action?: LineAction | null; variant?: "desktop" | "mobile" }) {
  const sentence = copy.refusal(code);
  return (
    <div className={variant === "mobile" ? "mx-line err" : "refuse"} role="alert" data-refusal={code}>
      <Icon name="alert" size={variant === "mobile" ? 15 : 14} />
      <b>{sentence}</b>
      {action ? (
        <Btn size="sm" busy={action.busy} onClick={action.onClick}>
          {action.label}
        </Btn>
      ) : null}
    </div>
  );
}

export function OkLine({ text, variant = "desktop" }: { text: string; variant?: "desktop" | "mobile" }) {
  return (
    <div className={variant === "mobile" ? "mx-line ok" : "okline"} role="status" data-ok-line>
      <Icon name="check" size={variant === "mobile" ? 15 : 14} />
      {text}
    </div>
  );
}

export function AlertLine({ text, action, variant = "desktop" }: { text: string; action?: LineAction | null; variant?: "desktop" | "mobile" }) {
  return (
    <div className={variant === "mobile" ? "mx-line warn" : "alertline"} role="status" data-alert-line>
      <Icon name="alert" size={variant === "mobile" ? 15 : 14} />
      <span>{text}</span>
      {action ? (
        <Btn size="sm" busy={action.busy} onClick={action.onClick}>
          {action.label}
        </Btn>
      ) : null}
    </div>
  );
}
