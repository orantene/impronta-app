/**
 * Messages v5 screen contracts (L2 owns this file; wave-A lanes import it).
 *
 * The shell (`shell/MessagesV5Shell.tsx`) mounts every pane through the prop
 * shapes below. L1 builds `Inbox`, L3 builds `ContextPanel` / `DetailsSheet` /
 * `ClientSheet`, L4 builds `HistorySheet` / `TasksTray` / `RenameInline` /
 * `MergeCard`. Each pane is pure over these props: no server action inside a
 * pane, no translator call (take `copy`), no reading of the admin shell. The
 * shell owns loading, live patches, drafts, refusals and routing.
 *
 * Types are additive only. A lane that needs one more field appends it here
 * as optional and notes it in decisions.md.
 */

import type {
  ActionResult,
  ConversationHistoryEntry,
  DerivedTask,
  Essentials,
  InboxRow,
  InquiryMessagingState,
  MessagingRefusal,
  RecordChip,
} from "@/lib/messaging/types";

import type { KitCopy } from "../kit/copy";
import type { InboxFilterKey, InboxSegment } from "../kit/InboxSegments";

/** Desktop grammar (also 1194) or the mobile kit (below 900). */
export type ScreenVariant = "desktop" | "mobile";

/* ---------------------------------------------------------------- Inbox (L1) */

/** The three segments (Needs action / Waiting / All) map to engine filters
 * `needs_reply` / `awaiting_customer` / `all` in the shell. */
export type InboxFilter = InboxSegment;

export type InboxLoadState = "idle" | "loading" | "ok" | "empty" | "failed";

export type InboxProps = {
  readonly rows: readonly InboxRow[];
  readonly filter: InboxFilter;
  readonly onFilter: (filter: InboxFilter) => void;
  /** Narrowing chips (Mine, Unassigned, Unread, record kinds). Client-side. */
  readonly chips: readonly InboxFilterKey[];
  readonly onToggleChip: (key: InboxFilterKey) => void;
  readonly search: string;
  readonly onSearch: (query: string) => void;
  readonly selectedId: string | null;
  readonly onSelect: (inquiryId: string) => void;
  readonly loading: boolean;
  /** Non-null when the last load failed; the pane says the data is safe and offers Retry. */
  readonly error: MessagingRefusal | null;
  readonly onRetry: () => void;
  /** Every-filter unread total (the rail badge number). Null until the first load answers. */
  readonly unreadTotal: number | null;
  /** Per-segment counts when known. */
  readonly counts: Partial<Record<InboxFilter, number>>;
  readonly onNew: () => void;
  readonly currentUserId: string | null;
  readonly copy: KitCopy;
  readonly variant: ScreenVariant;
};

/* --------------------------------------------------------- Context panel (L3) */

/**
 * What a context-panel control asks the shell to do. The shell routes every
 * one of these through the same table the NextStep bar uses (`NextStep.tsx`),
 * so a "coming" target opens the same "Coming in this program" sheet.
 */
export type ContextPanelAction =
  | "reply"
  | "capture_identity"
  | "open_client"
  | "add_items"
  | "create_offer"
  | "revise_offer"
  | "request_payment"
  | "confirm"
  | "remind"
  | "add_note"
  | "add_file"
  | "link_record"
  | "open_record"
  | "history"
  | "reopen";

export type ContextPanelProps = {
  /** Null while loading (the panel draws `SummaryBlock loading`). */
  readonly essentials: Essentials | null;
  readonly state: InquiryMessagingState;
  readonly chips: readonly RecordChip[];
  readonly tasks: readonly DerivedTask[];
  /** "Talent & services" for an agency, "Items" for a restaurant: the shell resolves it from the tenant. */
  readonly itemsLabel: string;
  readonly loading: boolean;
  readonly copy: KitCopy;
  readonly variant: ScreenVariant;
  readonly onAction: (kind: ContextPanelAction, detail?: { readonly recordId?: string; readonly kind?: RecordChip["kind"] }) => void;
  /** Present when the panel is a drawer (1024 to 1279) so it can draw its own close. */
  readonly onClose?: () => void;
};

/** Mobile: the same card as one scrollable 92% sheet (board M04). */
export type DetailsSheetProps = ContextPanelProps & {
  readonly open: boolean;
  readonly onClose: () => void;
};

/** The Client section opened on its own (desktop "Open" on the Client section, M04 Client). */
export type ClientSheetProps = {
  readonly essentials: Essentials;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly copy: KitCopy;
  readonly variant: ScreenVariant;
  readonly onAction: (kind: "capture_identity" | "edit_contact") => void;
};

/* ------------------------------------------------ History, tasks, rename (L4) */

export type HistorySheetProps = {
  /** Null while loading. */
  readonly entries: readonly ConversationHistoryEntry[] | null;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly copy: KitCopy;
  readonly variant: ScreenVariant;
  readonly error?: MessagingRefusal | null;
};

export type TasksTrayProps = {
  readonly tasks: readonly DerivedTask[];
  readonly open: boolean;
  readonly onClose: () => void;
  /** The shell maps a task key to a shell action (see `NextStep.tsx`). */
  readonly onPick: (taskKey: DerivedTask["key"]) => void;
  readonly copy: KitCopy;
  readonly variant: ScreenVariant;
};

export type RenameResult = ActionResult<{ version?: number }>;

export type RenameInlineProps = {
  readonly name: string;
  /** The inquiry row's optimistic-lock counter, sent back as `expectedVersion`. */
  readonly version: number;
  readonly onSave: (name: string, expectedVersion: number) => Promise<RenameResult>;
  readonly onCancel: () => void;
  readonly copy: KitCopy;
  readonly variant: ScreenVariant;
  /**
   * L4 EXTENSION (additive, decisions.md D-MSG-100): true when `name` is
   * `isGeneratedName(name, contactName)` (lib/messaging/inquiry-name.ts) —
   * the shell knows `contactName` (it already reads `essentials.customer.name`
   * for `ThreadHeader`) and this component does not, so it is computed once
   * upstream rather than threading `contactName` down. Undefined is treated
   * as false (no hint) so an older caller compiles unchanged.
   */
  readonly generated?: boolean;
};

export type MergeCardProps = {
  readonly duplicate: { readonly inquiryId: string; readonly name: string };
  readonly into: { readonly inquiryId: string; readonly name: string; readonly version: number };
  readonly busy: boolean;
  readonly refusal: MessagingRefusal | null;
  readonly onMerge: () => void;
  readonly onDismiss: () => void;
  readonly copy: KitCopy;
  readonly variant: ScreenVariant;
  /**
   * L4 EXTENSION (additive, decisions.md D-MSG-100): the brief's three-option
   * card ("Merge into <name>" / "Keep separate, link the client" / "Not the
   * same person") needs a third action the original two-callback contract
   * (onMerge, onDismiss) has no seam for — "keep separate but link the
   * client" calls `messagingCaptureIdentity` (level "linked"), a DIFFERENT
   * engine action than either merging or dismissing the match. Optional so a
   * caller that only wants Merge/Not-the-same-person (the original shape)
   * still compiles; when omitted the middle row is not rendered.
   */
  readonly onKeepSeparate?: () => void;
};

/* ------------------------------------------------------- Shell action routing */

/**
 * Every button in the thread, the next-step bar, the context panel and the
 * tray dispatches one of these ids; `routeShellAction` in `NextStep.tsx` says
 * whether it is wired in this wave or opens the "Coming in this program" sheet.
 */
export type ShellActionId =
  | "reply"
  | "add_items"
  | "create_offer"
  | "revise_offer"
  | "request_payment"
  | "confirm"
  | "capture_identity"
  | "remind"
  | "reopen"
  | "resolve"
  | "assign"
  | "handover"
  | "rename"
  | "copy_link"
  | "close_lost"
  | "history"
  | "send_times"
  | "send_file"
  | "link_record"
  | "open_record"
  | "open_client"
  | "add_note"
  | "new_conversation"
  | "book_again";
