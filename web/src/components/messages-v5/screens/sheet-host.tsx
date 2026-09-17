"use client";

import type { DerivedTask, Essentials, InboxRow, InquiryMessagingState, MessagingRefusal, RecordChip, ThreadMessage } from "@/lib/messaging/types";

import type { ScreenVariant, ShellActionId } from "./contracts";
import type { ScreenCopy } from "./copy";
import { registeredActionSheet, type ShellSheetContext } from "./sheet-registry";

type Props = {
  readonly id: ShellActionId;
  readonly onClose: () => void;
  readonly copy: ScreenCopy;
  readonly variant: ScreenVariant;
  readonly tenantId: string;
  readonly tenantSlug: string;
  readonly row: InboxRow | null;
  readonly essentials: Essentials | null;
  readonly messages: readonly ThreadMessage[] | null;
  readonly state: InquiryMessagingState;
  readonly chips: readonly RecordChip[];
  readonly tasks: readonly DerivedTask[];
  readonly reloadInbox: () => Promise<void>;
  readonly reloadThread: () => Promise<void>;
  readonly notify: (n: { kind: "refusal"; code: MessagingRefusal } | { kind: "ok"; text: string } | null) => void;
  readonly dispatch: (id: ShellActionId) => void;
};

/** Mounts the sheet a lane registered for `id`, handing it the shell context. */
export function ActionSheetHost(p: Props) {
  const entry = registeredActionSheet(p.id);
  if (!entry) return null;
  const Entry = entry.Component;
  const ctx: ShellSheetContext = {
    tenantId: p.tenantId,
    tenantSlug: p.tenantSlug,
    row: p.row,
    essentials: p.essentials,
    messages: p.messages,
    state: p.state,
    chips: p.chips,
    tasks: p.tasks,
    version: p.row?.version ?? 0,
    reloadInbox: p.reloadInbox,
    reloadThread: p.reloadThread,
    notify: (n) => p.notify(n),
    dispatch: p.dispatch,
  };
  return <Entry open onClose={p.onClose} ctx={ctx} copy={p.copy} variant={p.variant} />;
}
