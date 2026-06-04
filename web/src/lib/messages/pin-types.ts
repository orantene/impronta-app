/**
 * Plain (directive-free) types for the inquiry-wide message-pin feature.
 *
 * Kept out of the "use server" action module (a server-action module may only
 * export async functions — a type export from one is stripped by Turbopack and
 * breaks the build). Both the server loader and the client UI import from here.
 */

export type PinnedMessage = {
  messageId: string;
  inquiryId: string;
  body: string;
  senderUserId: string | null;
  senderName: string | null;
  threadType: "private" | "group";
  pinnedByName: string | null;
  pinnedAt: string;
  createdAt: string;
};
