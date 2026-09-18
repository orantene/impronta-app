/**
 * NextStep wiring (boards D01, M02): S4's `deriveTasks` output → one primary
 * button whose action id the shell routes. Pure tables first, one component
 * after. A target another lane owns is `coming`: the shell opens the "Coming
 * in this program" sheet (never a dead button), and decisions.md lists each
 * as a D-MSG-7x seam.
 */

import type { DerivedTask, InquiryMessagingState } from "@/lib/messaging/types";

import { NextStepBar, NextStepBlock, type NextStepAction } from "../kit/NextStep";
import type { ScreenVariant, ShellActionId } from "./contracts";
import type { ScreenCopy } from "./copy";

/** S4 task key → the action the primary button fires. Null draws a sentence, never a fake button. */
export const TASK_ACTION: Readonly<Record<string, ShellActionId | null>> = {
  reply: "reply",
  payment_issue: "request_payment",
  expired_hold: "send_times",
  confirm_identity: "capture_identity",
  await_offer: "remind",
  collect_deposit: "request_payment",
  prepare_order: "open_record",
  collect_balance: "request_payment",
  send_reminder: "remind",
  confirm_talent: "confirm",
  closed: "reopen",
  add_items: "add_items",
  send_offer: "create_offer",
  all_clear: null,
};

export type ShellRoute = { readonly kind: "wired" } | { readonly kind: "coming"; readonly seam: string };

/**
 * What this wave can do. Everything under `coming` is owned by a later lane
 * (the seam names the lane that lands it); the shell shows one sentence.
 */
const ROUTES: Readonly<Record<ShellActionId, ShellRoute>> = {
  reply: { kind: "wired" },
  reopen: { kind: "wired" },
  resolve: { kind: "wired" },
  assign: { kind: "wired" },
  handover: { kind: "wired" },
  rename: { kind: "wired" },
  copy_link: { kind: "wired" },
  close_lost: { kind: "wired" },
  history: { kind: "wired" },
  add_note: { kind: "wired" },
  capture_identity: { kind: "wired" },
  new_conversation: { kind: "wired" },
  open_client: { kind: "wired" },
  send_file: { kind: "wired" },
  add_items: { kind: "coming", seam: "L5 items picker" },
  create_offer: { kind: "coming", seam: "L6 offer builder" },
  revise_offer: { kind: "coming", seam: "L6 offer builder" },
  request_payment: { kind: "coming", seam: "L7 payment sheet" },
  confirm: { kind: "coming", seam: "L8 confirm (S3 messagingConfirmRecord)" },
  remind: { kind: "coming", seam: "L9 reminder sheet" },
  send_times: { kind: "coming", seam: "L5 times picker" },
  link_record: { kind: "coming", seam: "L10 link a record" },
  open_record: { kind: "coming", seam: "L10 record view" },
  book_again: { kind: "coming", seam: "L11 book again" },
  // L7 registers both sheets in `sheet-registry.tsx`, which the shell
  // consults BEFORE this table (`dispatch` in `MessagesV5Shell.tsx`), so
  // these "coming" entries are dead code once `screens/sheets/index.ts`
  // is imported — they exist only so `ROUTES` (a `Record<ShellActionId, ...>`)
  // stays exhaustive and a future caller that dispatches before the sheets
  // import runs still opens "Coming in this program", never nothing.
  cancel_record: { kind: "coming", seam: "L7" },
  refund: { kind: "coming", seam: "L7" },
};

export function routeShellAction(id: ShellActionId): ShellRoute {
  return ROUTES[id];
}

export function comingActions(): ShellActionId[] {
  return (Object.keys(ROUTES) as ShellActionId[]).filter((id) => ROUTES[id].kind === "coming");
}

export function primaryTask(tasks: readonly DerivedTask[]): DerivedTask | null {
  return tasks.find((t) => t.primary) ?? tasks[0] ?? null;
}

/** The action id for the primary task, given the conversation state (closed → reopen only when resolved or lost). */
export function primaryActionFor(tasks: readonly DerivedTask[], state: InquiryMessagingState): ShellActionId | null {
  const task = primaryTask(tasks);
  if (!task) return null;
  const mapped = TASK_ACTION[task.key] ?? null;
  if (task.key === "closed") {
    return state.conversation === "resolved" || state.opportunity === "lost" ? "reopen" : null;
  }
  return mapped;
}

export function actionLabel(id: ShellActionId, copy: ScreenCopy): string {
  const next = copy.shell.next as Partial<Record<ShellActionId, string>>;
  return next[id] ?? copy.kit.next.label;
}

export type NextStepWireProps = {
  readonly tasks: readonly DerivedTask[];
  readonly state: InquiryMessagingState;
  readonly copy: ScreenCopy;
  readonly variant: ScreenVariant;
  readonly loading?: boolean;
  readonly busy?: boolean;
  readonly onAction: (id: ShellActionId) => void;
  readonly onMoreTasks?: () => void;
};

export function NextStepWire({ tasks, state, copy, variant, loading, busy, onAction, onMoreTasks }: NextStepWireProps) {
  const id = primaryActionFor(tasks, state);
  const action: NextStepAction | null = id ? { label: actionLabel(id, copy), onClick: () => onAction(id) } : null;
  const props = { tasks, copy: copy.kit, action, busy, loading, onMoreTasks };
  return variant === "mobile" ? <NextStepBlock {...props} /> : <NextStepBar {...props} />;
}
