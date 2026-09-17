"use client";

/**
 * Sheet registry — the one seam later lanes plug into.
 *
 * A lane that owns an action sheet (items picker, offer editor, payment
 * request, confirm, reminder, link record, book again) registers ONE entry
 * here with `registerActionSheet(...)`. The shell's dispatcher then opens the
 * registered sheet instead of the "coming" sheet, and the route table in
 * NextStep.tsx no longer needs editing. Nothing else in the shell changes.
 *
 * Entries are module-level so the registry is filled at import time; the
 * barrel `screens/sheets/index.ts` imports every lane's sheet file for that
 * side effect. Tests can call `registerActionSheet` directly.
 */

import type { ComponentType } from "react";

import type { DerivedTask, Essentials, InboxRow, InquiryMessagingState, MessagingRefusal, RecordChip, ThreadMessage } from "@/lib/messaging/types";

import type { ScreenCopy } from "./copy";
import type { ScreenVariant, ShellActionId } from "./contracts";

/** What every registered sheet receives from the shell. Read-only snapshot + reload hooks. */
export type ShellSheetContext = {
  readonly tenantId: string;
  readonly tenantSlug: string;
  readonly row: InboxRow | null;
  readonly essentials: Essentials | null;
  readonly messages: readonly ThreadMessage[] | null;
  readonly state: InquiryMessagingState;
  readonly chips: readonly RecordChip[];
  readonly tasks: readonly DerivedTask[];
  /** The conversation's optimistic-lock version (InboxRow.version). */
  readonly version: number;
  /** Re-read inbox rows / the open thread after a write. */
  readonly reloadInbox: () => Promise<void>;
  readonly reloadThread: () => Promise<void>;
  /** Surface a refusal sentence or an ok line in the shell's notice slot. */
  readonly notify: (n: { kind: "refusal"; code: MessagingRefusal } | { kind: "ok"; text: string }) => void;
  /** Open another action (e.g. items picker → create_offer). */
  readonly dispatch: (id: ShellActionId) => void;
};

export type ActionSheetProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly ctx: ShellSheetContext;
  readonly copy: ScreenCopy;
  readonly variant: ScreenVariant;
};

export type ActionSheetEntry = {
  readonly Component: ComponentType<ActionSheetProps>;
  /** Owning lane, for the ledger. */
  readonly lane: string;
};

const REGISTRY = new Map<ShellActionId, ActionSheetEntry>();

export function registerActionSheet(id: ShellActionId, entry: ActionSheetEntry): void {
  REGISTRY.set(id, entry);
}

export function registeredActionSheet(id: ShellActionId): ActionSheetEntry | null {
  return REGISTRY.get(id) ?? null;
}

export function registeredActionIds(): ShellActionId[] {
  return [...REGISTRY.keys()];
}

/** Test helper. */
export function resetActionSheetRegistry(): void {
  REGISTRY.clear();
}
