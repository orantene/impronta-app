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

/* --------------------------------------------- L3 additive extension (D-MSG-91) */
/**
 * `ContextPanelProps` (above, L2) carries state/chips/tasks but no LINE-level
 * data: no offer/order lines, no money breakdown, no files/notes/follow-up
 * counts. Nothing upstream of the shell reads `inquiry_offer_line_items` /
 * `order_lines` / `payment_links` for the panel yet. These fields are
 * optional and additive so `ContextPanelProps` stays exactly what L2 shipped
 * for a caller that doesn't pass them; `ContextPanel` / `ContextDrawer` /
 * `DetailsSheet` render the section as its collapsed/empty state (never a
 * fake zero) when a field is `null` or `undefined`. See decisions.md
 * D-MSG-91: a follow-up shell wave wires these from the readers named there
 * (`loadInquiryOffers`, `lib/pos/draft.ts`, `lib/messaging/money.ts`).
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

export type ContextMoney = {
  readonly totalLabel: string;
  readonly depositLabel?: string | null;
  readonly paidLabel: string;
  readonly balanceLabel: string;
  readonly balanceDueCents: number;
};

export type ContextPanelExtra = {
  readonly itemsLoading?: boolean;
  readonly items?: readonly ContextItemLine[] | null;
  readonly money?: ContextMoney | null;
  readonly filesCount?: number | null;
  readonly notesCount?: number | null;
  readonly nextReminderLabel?: string | null;
  /** "{count} past bookings · {amount}" from the customers rollups, or
   * omitted (not zero) when the rollup is not readable through Essentials. */
  readonly clientHistoryLabel?: string | null;
};

/** `ContextPanel` / `ContextDrawer` / `DetailsSheet` all read this shape. */
export type ContextPanelPropsV2 = ContextPanelProps & ContextPanelExtra;

/**
 * `ClientSheetProps` (above, L2) is a two-action routing sheet
 * (`capture_identity` / `edit_contact`); the D15 board asks for a fuller
 * inline editor (two-matches list, a phone-collision refusal, identity
 * chips, Save). `matchState` is optional: undefined renders the L2 minimal
 * sheet (identity summary + "Edit contact" -> `onAction("edit_contact")`
 * unchanged); present renders the full D15 editor over it. The write this
 * editor calls is the existing `messagingCaptureIdentity` /
 * `messagingMatchCustomers` server actions (`lib/server-actions/
 * messaging-engine.ts`) and, for a plain contact-field correction,
 * `updateInquiryDetails` (`lib/inquiry/inquiry-engine-details.ts`) — no new
 * writer. See decisions.md D-MSG-91.
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

export type ClientSheetPropsExtra = {
  readonly matchState?: ClientSheetMatchState | null;
  readonly onFieldChange?: (field: "name" | "phone" | "email", value: string) => void;
  readonly onSelectMatch?: (value: string) => void;
  readonly onSave?: () => void;
};

export type ClientSheetPropsV2 = ClientSheetProps & ClientSheetPropsExtra;
