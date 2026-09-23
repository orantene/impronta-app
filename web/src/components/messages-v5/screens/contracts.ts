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
 * as optional and notes it in decisions.md. Wave A reconciled (D-MSG-110):
 * L1's `now` / `onSearchSubmit`, L3's line / money / count extras and the
 * inline client editor, L4's `generated` / `onKeepSeparate` all live here as
 * optional fields; no lane keeps a local copy or alias of these types.
 */

import type {
  ActionResult,
  ConversationHistoryEntry,
  CustomerMatch,
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
  /** Every keystroke: the shell keeps `search` in sync and the pane narrows client-side. */
  readonly onSearch: (query: string) => void;
  /** L1 (D-MSG-81): Enter in the search field. Optional; the shell may run `messagingSearch` here. */
  readonly onSearchSubmit?: (query: string) => void;
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
  /** L1 (D-MSG-81): the clock the day-boundary grouping reads, so tests are deterministic. Defaults to `new Date()`. */
  readonly now?: Date;
};

/* --------------------------------------------------------- Context panel (L3) */

/**
 * L3 (D-MSG-91): one offer / order line as the Items section draws it
 * (`LineEditorRow`, read-only). The shell fills these from the POS readers
 * when one is reachable; `items` stays undefined otherwise and the section
 * draws its empty state, never a fake zero.
 */
export type ContextItemLine = {
  readonly id: string;
  readonly name: string;
  readonly sub?: string | null;
  readonly units: string;
  readonly price: string;
  readonly proposedBy?: "client" | "staff" | null;
  readonly proposedByName?: string | null;
  readonly confirmed?: boolean;
  /** Set only when `priceDrift` (`lib/pos/price-drift.ts`) found a drift. */
  readonly priceSnapshot?: string | null;
};

/** L3 (D-MSG-91): the Money section, already formatted (USD, `formatCentsUSD`). */
export type ContextMoney = {
  readonly totalLabel: string;
  readonly depositLabel?: string | null;
  readonly paidLabel: string;
  readonly balanceLabel: string;
  readonly balanceDueCents: number;
};

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
  /* L3 extras (D-MSG-91), every one optional: absent = the section's empty/collapsed state. */
  readonly itemsLoading?: boolean;
  readonly items?: readonly ContextItemLine[] | null;
  readonly money?: ContextMoney | null;
  readonly filesCount?: number | null;
  readonly notesCount?: number | null;
  readonly nextReminderLabel?: string | null;
  /** "{count} past bookings · {amount}" from a customers rollup, or omitted (not zero) when no reader carries one (D-MSG-92). */
  readonly clientHistoryLabel?: string | null;
  /** Held slot in the payload timezone (D-MSG-330). Null when the thread has no times card. */
  readonly holdSlotLabel?: string | null;
};

/** Mobile: the same card as one scrollable 92% sheet (board M04). */
export type DetailsSheetProps = ContextPanelProps & {
  readonly open: boolean;
  readonly onClose: () => void;
};

/**
 * L3 (D-MSG-91): the inline client editor's state (board D15). When the shell
 * passes it, `ClientSheet` draws name / phone / email fields, the matches
 * list from `messagingMatchCustomers`, a refusal line and Save; when it does
 * not, the sheet is the L2 summary with an "Edit contact" button.
 */
export type ClientSheetMatchState = {
  readonly name: string;
  readonly phone: string;
  readonly email: string;
  readonly matches: readonly CustomerMatch[];
  /** A matched `customerId`, or `"new"`. */
  readonly selected: string;
  readonly busy: boolean;
  /** `"already_linked"` when the typed phone belongs to another client's confirmed identity. */
  readonly refusal?: MessagingRefusal | null;
};

/** The Client section opened on its own (desktop "Open" on the Client section, M04 Client). */
export type ClientSheetProps = {
  readonly essentials: Essentials;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly copy: KitCopy;
  readonly variant: ScreenVariant;
  readonly onAction: (kind: "capture_identity" | "edit_contact") => void;
  /* L3 extras (D-MSG-91): the inline editor, all optional. */
  readonly matchState?: ClientSheetMatchState | null;
  readonly onFieldChange?: (field: "name" | "phone" | "email", value: string) => void;
  readonly onSelectMatch?: (value: string) => void;
  readonly onSave?: () => void;
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
   * L4 (D-MSG-100): true when `name` is `isGeneratedName(name, contactName)`
   * (`lib/messaging/inquiry-name.ts`); the shell computes it once because the
   * pane has no `contactName`. Undefined draws no hint.
   */
  readonly generated?: boolean;
};

export type MergeCardProps = {
  readonly duplicate: { readonly inquiryId: string; readonly name: string };
  readonly into: { readonly inquiryId: string; readonly name: string; readonly version: number };
  readonly busy: boolean;
  readonly refusal: MessagingRefusal | null;
  readonly onMerge: () => void;
  /**
   * L4 (D-MSG-100): the card's middle row, "Keep separate, link the client"
   * (`messagingCaptureIdentity`, level "linked"). Optional; the row is not
   * drawn when the shell does not pass it.
   */
  readonly onKeepSeparate?: () => void;
  readonly onDismiss: () => void;
  readonly copy: KitCopy;
  readonly variant: ScreenVariant;
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
  | "book_again"
  /** L7 (D-MSG-14x), additive: the `CancelRefundSheet` seam. Not reachable
   * from any wired button yet in this wave (no context-panel/tray action
   * dispatches it) — the union entry plus the "coming" route exist so the
   * registry can take over the moment a later lane wires a caller, the same
   * pattern `request_payment` already followed for L7 itself. */
  | "cancel_record"
  | "refund";
