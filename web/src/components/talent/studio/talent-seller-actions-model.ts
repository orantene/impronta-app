/**
 * The six direct-client actions (mockup "Messages · Actions menu") and which
 * ones her engine can run today. Pure so the honesty rule is testable: an
 * action whose writer refuses on the talent engine is shown disabled with a
 * plain note, never as a button that always fails.
 *
 * Not wired on the talent engine (2026-09-28):
 *  - file: `talentShellEngine.composer.upload` refuses (no talent upload writer).
 *  - note: `messagingTalentNote` returns not_allowed (no talent private-note writer).
 */

export const TALENT_SELLER_ACTIONS = [
  { id: "quote", title: "Send a quote", body: "Pick services, add extras." },
  { id: "time", title: "Propose a time", body: "Checks your calendar first." },
  { id: "deposit", title: "Request a deposit", body: "Secure link. Card or transfer." },
  { id: "file", title: "Send a photo or file", body: "The client sees it." },
  { id: "note", title: "Add a private note", body: "Only you." },
  { id: "client", title: "Save client details", body: "Name, phone, preferences." },
] as const;

export type TalentSellerActionId = (typeof TALENT_SELLER_ACTIONS)[number]["id"];

const NOT_YET: Partial<Record<TalentSellerActionId, string>> = {
  file: "Not available yet. Paste a link in the message for now.",
  note: "Not available yet. Private notes are coming.",
};

/** English reason the action cannot run, or null when it can. Translated at render. */
export function talentSellerActionBlock(id: TalentSellerActionId, hasThread: boolean): string | null {
  return NOT_YET[id] ?? (hasThread ? null : "Pick a conversation first");
}
