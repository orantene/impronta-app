/**
 * What the Free-plan Clients page says about inquiries. It must read the same
 * list the Inbox renders (never a hard-coded sample), so the two screens can
 * never contradict each other (TUL-733).
 */
export type ClientsInquiryCard =
  | { kind: "none" }
  | { kind: "one"; id: string }
  | { kind: "many"; count: number; firstId: string };

export function clientsInquiryCard(inquiries: readonly { id: string }[]): ClientsInquiryCard {
  const first = inquiries[0];
  if (!first) return { kind: "none" };
  if (inquiries.length === 1) return { kind: "one", id: first.id };
  return { kind: "many", count: inquiries.length, firstId: first.id };
}
