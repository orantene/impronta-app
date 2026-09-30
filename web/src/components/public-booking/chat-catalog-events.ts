/**
 * CH-4: the card chat's in-chat service list asks the catalog island on the
 * page to select a service, exactly as tapping its row would (single select,
 * or the sheet when the service has options). The chat does not know the
 * variants or extras, so the island, which owns them, does the work.
 */
export const CHAT_ADD_SERVICE_EVENT = "tulala:chat-add-service";

export type ChatAddServiceDetail = { offeringId: string };

export function requestChatAddService(offeringId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new window.CustomEvent<ChatAddServiceDetail>(CHAT_ADD_SERVICE_EVENT, { detail: { offeringId } }),
  );
}
