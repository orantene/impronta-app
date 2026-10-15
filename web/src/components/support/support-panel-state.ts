import type {
  SupportMessageRow,
  SupportTicketRow,
  SupportTicketSummary,
} from "@/lib/support/support-types";

/**
 * Pure state rules for the support panel (TUL-599). The panel stays mounted
 * while closed and is reused for every thread, so any state that is not keyed
 * by ticket id leaks the previous thread into the next one.
 */

export type ThreadState = {
  /** Ticket the rows below belong to. Null before anything loaded. */
  id: string | null;
  ticket: SupportTicketRow | null;
  messages: SupportMessageRow[];
  /** True once the fetch for `id` finished (even if it found nothing). */
  loaded: boolean;
};

export const EMPTY_THREAD: ThreadState = { id: null, ticket: null, messages: [], loaded: false };

export type ThreadAction =
  | { type: "loaded"; ticketId: string; ticket: SupportTicketRow | null; messages: SupportMessageRow[] }
  | { type: "message"; row: SupportMessageRow }
  /** Rows fetched after an AI turn: catches a reply realtime missed. Ignored when another thread is on screen. */
  | { type: "merge"; ticketId: string; messages: SupportMessageRow[] }
  | { type: "ticket"; row: SupportTicketRow }
  | { type: "patchTicket"; ticketId: string; patch: Partial<SupportTicketRow> };

function mergeMessages(base: SupportMessageRow[], extra: SupportMessageRow[]): SupportMessageRow[] {
  const seen = new Set(base.map((m) => m.id));
  const out = [...base];
  for (const m of extra) if (!seen.has(m.id)) out.push(m);
  return out;
}

export function threadReducer(state: ThreadState, action: ThreadAction): ThreadState {
  switch (action.type) {
    case "loaded": {
      // Rows that arrived over realtime while the fetch was in flight belong
      // to the same ticket and must survive the fetch result.
      const early = state.id === action.ticketId ? state.messages : [];
      const earlyTicket = state.id === action.ticketId ? state.ticket : null;
      return {
        id: action.ticketId,
        ticket: action.ticket ?? earlyTicket,
        messages: mergeMessages(action.messages, early),
        loaded: true,
      };
    }
    case "message": {
      if (state.id !== action.row.ticketId) {
        // First row for a thread whose fetch has not landed yet: start it.
        return { id: action.row.ticketId, ticket: null, messages: [action.row], loaded: false };
      }
      if (state.messages.some((m) => m.id === action.row.id)) return state;
      return { ...state, messages: [...state.messages, action.row] };
    }
    case "merge": {
      if (state.id !== action.ticketId) return state;
      const merged = mergeMessages(state.messages, action.messages);
      if (merged.length === state.messages.length) return state;
      merged.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return { ...state, messages: merged };
    }
    case "ticket":
      return state.id === action.row.id || state.id === null
        ? { ...state, id: action.row.id, ticket: action.row }
        : { id: action.row.id, ticket: action.row, messages: [], loaded: false };
    case "patchTicket":
      if (state.id !== action.ticketId || !state.ticket) return state;
      return { ...state, ticket: { ...state.ticket, ...action.patch } };
  }
}

/**
 * What the thread view may show for the ticket being viewed. Anything loaded
 * for a different ticket is hidden, so the previous conversation never flashes
 * while the new one loads.
 */
export function selectThread(
  state: ThreadState,
  ticketId: string | null,
): { ticket: SupportTicketRow | null; messages: SupportMessageRow[]; loading: boolean } {
  if (!ticketId) return { ticket: null, messages: [], loading: false };
  if (state.id !== ticketId) return { ticket: null, messages: [], loading: true };
  return { ticket: state.ticket, messages: state.messages, loading: !state.loaded };
}

/**
 * The panel is reused across opens. Reopening after a close lands on Home;
 * the previous thread is one tap away in Tickets. Returns the view to show.
 */
export function viewAfterOpenChange(
  wasOpen: boolean,
  isOpen: boolean,
  view: string,
): "home" | null {
  if (wasOpen && !isOpen && view !== "home") return "home";
  return null;
}

/**
 * Tickets that need the user's attention: open and holding a message they
 * have not read. This one number feeds the Tickets tab badge and the launcher
 * dot so they cannot disagree.
 */
export function unreadOpenCount(tickets: readonly SupportTicketSummary[]): number {
  return tickets.filter((t) => t.unread && t.status === "open").length;
}

/**
 * Apply a message that arrived over realtime to the ticket summaries.
 * Replies from someone else mark the ticket unread unless the user is looking
 * at that very thread; the user's own messages never do. Unknown tickets are
 * ignored (the list is loaded server-side, a stray row must not invent one).
 */
export function applyIncomingMessage(
  tickets: readonly SupportTicketSummary[],
  row: Pick<SupportMessageRow, "ticketId" | "authorKind" | "authorUserId" | "messageKind" | "body" | "createdAt">,
  ctx: { userId: string; viewingTicketId: string | null },
): SupportTicketSummary[] {
  if (row.messageKind === "note") return tickets as SupportTicketSummary[];
  return tickets.map((t) => {
    if (t.id !== row.ticketId) return t;
    const mine = row.authorKind === "requester" && row.authorUserId === ctx.userId;
    const viewing = ctx.viewingTicketId === t.id;
    return {
      ...t,
      lastMessagePreview: row.body.slice(0, 140),
      lastMessageAt: row.createdAt,
      unread: mine || viewing ? t.unread : true,
    };
  });
}

/** Local ticket patch applied the moment the user asks for a person (TUL-307). */
export function humanRequestedPatch(nowIso: string): Partial<SupportTicketRow> {
  return { handledBy: "human", escalatedAt: nowIso, waitingOn: "support" };
}

/** The "talk to a person" offer is only meaningful while the AI still owns an open ticket. */
export function canOfferHuman(ticket: Pick<SupportTicketRow, "handledBy" | "status"> | null): boolean {
  if (!ticket) return true;
  return ticket.handledBy !== "human" && ticket.status !== "closed";
}

/**
 * TUL-942: the id of the newest AI answer. The "talk to a person" control
 * lives on that one bubble only, never on older answers and never beside it.
 */
export function lastAiAnswerId(
  messages: ReadonlyArray<Pick<SupportMessageRow, "id" | "authorKind" | "messageKind" | "deletedAt">>,
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.deletedAt) continue;
    if (m.authorKind === "ai" && m.messageKind !== "card") return m.id;
  }
  return null;
}

/**
 * TUL-942: ONE escalate control per thread. The offer card wins, then the
 * newest AI bubble; the standalone footer button is only for threads that
 * have neither.
 */
export function humanOfferPlacement(input: {
  canOffer: boolean;
  hasOfferCard: boolean;
  hasAiAnswer: boolean;
}): "card" | "bubble" | "footer" | "none" {
  if (!input.canOffer) return "none";
  if (input.hasOfferCard) return "card";
  return input.hasAiAnswer ? "bubble" : "footer";
}

/**
 * TUL-943: the "Did this help?" Yes/No row only exists while the AI owns the
 * ticket. After a person takes over, half of it used to linger.
 */
export function showHelpfulRow(
  ticket: Pick<SupportTicketRow, "handledBy" | "status"> | null,
  acked: boolean,
): boolean {
  return !acked && canOfferHuman(ticket);
}

/**
 * TUL-948: the AI turn flag outlives the reply (the request resolves after
 * realtime already delivered it), which drew a second "thinking" bubble
 * under the answer. Show it only while the last message is not an AI reply.
 */
export function shouldShowThinking(
  thinking: boolean,
  messages: ReadonlyArray<Pick<SupportMessageRow, "authorKind" | "deletedAt">>,
): boolean {
  if (!thinking) return false;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].deletedAt) continue;
    return messages[i].authorKind !== "ai";
  }
  return true;
}
