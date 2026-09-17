/**
 * D-MSG-2 · one thread-type rule.
 *
 * `inquiry_messages.thread_type` has two values and each is owned by one
 * audience:
 *
 *   - "private" is the CLIENT thread: agency staff + the client (or guest).
 *     Every staff reply and every card a client may see lives here, and so
 *     do internal notes, which sit beside the client thread for staff and are
 *     kept from the client by `message_kind`, never by thread.
 *   - "group" is the TALENT thread: agency staff + invited talent. The POS
 *     messaging engine never writes it; only the talent fan-out does.
 *
 * Every client-facing reader therefore reads "private" AND excludes
 * `message_kind = 'internal_note'`. The DB trigger that derives conversation
 * state keys on the same kind, so a note never flips a conversation.
 */

export const CLIENT_THREAD = "private" as const;
export const TALENT_THREAD = "group" as const;
export type InquiryThreadType = typeof CLIENT_THREAD | typeof TALENT_THREAD;

export const INTERNAL_NOTE_KIND = "internal_note" as const;

/**
 * The thread a staff-authored POS message lands on. Every kind the engine
 * writes, replies, cards and internal notes alike, is a client-thread row;
 * the kind decides who may read it, the thread never does.
 */
export function threadTypeForStaffMessage(kind: string): InquiryThreadType {
  void kind;
  return CLIENT_THREAD;
}

/** A client, guest or talent surface may render this kind. */
export function isClientVisibleMessageKind(kind: string | null | undefined): boolean {
  return kind !== INTERNAL_NOTE_KIND;
}
