/**
 * The six direct-client actions (mockup "Messages · Actions menu") and which
 * ones her engine can run today. Pure so the honesty rule is testable: an
 * action whose writer refuses on the talent engine is shown disabled with a
 * plain note, never as a button that always fails.
 *
 * F38 (2026-09-30): all six run on the talent engine. File goes through the
 * signed attachment pipeline (talent participant scope); note through
 * `messagingTalentPrivateNote`. `NOT_YET` stays for a verb that loses its writer.
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

const NOT_YET: Partial<Record<TalentSellerActionId, string>> = {};

/** English reason the action cannot run, or null when it can. Translated at render. */
export function talentSellerActionBlock(id: TalentSellerActionId, hasThread: boolean): string | null {
  return NOT_YET[id] ?? (hasThread ? null : "Pick a conversation first");
}
