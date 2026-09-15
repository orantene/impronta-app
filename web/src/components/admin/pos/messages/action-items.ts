import type { MessagingSheetName } from "@/lib/messaging/fixture";

import type { messagesCopy } from "./copy";

export type MessagingActionItem = {
  sheet: MessagingSheetName;
  label: string;
  hint: string;
  disabled?: string;
};

/** Shared Actions menu + phone Actions sheet (MM02B). */
export function messagingActionItems(copy: ReturnType<typeof messagesCopy>): MessagingActionItem[] {
  return [
    { sheet: "options", label: copy.sendOptions, hint: copy.previewCard },
    { sheet: "link", label: copy.createOrLink, hint: copy.nothingLinked },
    { sheet: "payment", label: copy.requestPayment, hint: copy.owedNow },
    { sheet: "offer", label: copy.revise, hint: copy.withdraw },
    { sheet: "change", label: copy.disabled.change, hint: copy.disabled.change, disabled: copy.disabled.change },
    { sheet: "diff", label: copy.letComplete, hint: copy.cancelPayment },
    { sheet: "recover", label: copy.recoverOrder, hint: copy.retrySameTicket },
    { sheet: "delivery", label: copy.history, hint: copy.retrySameTicket },
    { sheet: "agency", label: copy.handOver, hint: copy.ownerHint },
    { sheet: "note", label: copy.attachFile, hint: copy.disabled.attach, disabled: copy.disabled.attach },
    { sheet: "note", label: copy.note, hint: copy.composerNote },
    { sheet: "reminder", label: copy.scheduleReminder, hint: copy.reminderOne },
    { sheet: "resolve", label: copy.resolve, hint: copy.handOver },
  ];
}
