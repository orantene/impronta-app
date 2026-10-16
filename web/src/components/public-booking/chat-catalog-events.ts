/**
 * CH-4: the card chat's in-chat service list asks the catalog island on the
 * page to select a service, exactly as tapping its row would (single select,
 * or the sheet when the service has options). The chat does not know the
 * variants or extras, so the island, which owns them, does the work.
 */
export const CHAT_ADD_SERVICE_EVENT = "tulala:chat-add-service";

export type ChatAddServiceDetail = { offeringId: string };

/**
 * Returns true when a catalog island on the page took the request (its listener
 * cancels the event), false when nothing on this page owns that offering. Callers
 * that have a fallback (TUL-1068: the dock's Select link) use it; the rest ignore it.
 */
export function requestChatAddService(offeringId: string): boolean {
  if (typeof window === "undefined") return false;
  const handled = !window.dispatchEvent(
    new window.CustomEvent<ChatAddServiceDetail>(CHAT_ADD_SERVICE_EVENT, { detail: { offeringId }, cancelable: true }),
  );
  return handled;
}
