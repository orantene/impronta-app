/**
 * TUL-1415 / TUL-1587 · the front-door chat builds ONE request across roster services.
 * The decision logic, with its dependencies injected so it is testable per host kind.
 *
 * "chef for 10 people Saturday and 2 waiters" becomes one prefilled message for the workspace
 * contact form (several lines, party size, day). REQUEST-ONLY: no price, no checkout, no pay button.
 *
 * The tenant comes ONLY from the public host (never a client value) and only an AGENCY workspace
 * host has a roster to sell; the shared hub, a talent site and every other host never do. Fails closed.
 */
import {
  ROSTER_REQUEST_MAX_SENTENCE,
  buildRosterRequestDraft,
  buildRosterRequestMessage,
  rosterChatRequestHref,
  type RosterRequestLine,
} from "./roster-chat-request";
import type { RosterServiceItem } from "./roster-services";

export { ROSTER_REQUEST_MAX_SENTENCE };

export type BuildRosterRequestResult =
  | {
      ok: true;
      lines: RosterRequestLine[];
      partySize: number | null;
      when: string | null;
      /** The ONE message, ready for the contact form. */
      message: string;
      /** The workspace contact page with `message` prefilled. A person answers it. */
      href: string;
      truncated: boolean;
    }
  | { ok: false; error: "invalid" | "rate_limited" | "not_available" | "no_match" | "unavailable" };

export type RosterRequestDeps = {
  /** false = over the limit. */
  rateLimitOk: () => Promise<boolean>;
  host: () => Promise<{ kind: string; tenantId: string | null }>;
  /** Null = no database client. */
  loadItems: (tenantId: string) => Promise<RosterServiceItem[] | null>;
  replyLocale: (sentence: string, hint: string | null | undefined) => string;
};

export async function buildRosterRequestWith(
  deps: RosterRequestDeps,
  raw: { sentence: string; locale?: string | null },
): Promise<BuildRosterRequestResult> {
  const sentence = typeof raw?.sentence === "string" ? raw.sentence.trim() : "";
  if (sentence.length < 1 || sentence.length > ROSTER_REQUEST_MAX_SENTENCE) return { ok: false, error: "invalid" };
  const hint = typeof raw.locale === "string" && raw.locale.length <= 8 ? raw.locale : null;
  if (raw.locale != null && typeof raw.locale !== "string") return { ok: false, error: "invalid" };
  if (typeof raw.locale === "string" && raw.locale.length > 8) return { ok: false, error: "invalid" };
  try {
    if (!(await deps.rateLimitOk())) return { ok: false, error: "rate_limited" };
    // The tenant is the host's. Only an agency workspace has a roster; hub and talent hosts do not.
    const host = await deps.host();
    if (host.kind !== "agency" || !host.tenantId) return { ok: false, error: "not_available" };
    const items = await deps.loadItems(host.tenantId);
    if (items === null) return { ok: false, error: "unavailable" };
    if (items.length === 0) return { ok: false, error: "no_match" };
    const draft = buildRosterRequestDraft(sentence, items);
    if (draft.lines.length === 0) return { ok: false, error: "no_match" };

    const locale = deps.replyLocale(sentence, hint);
    const built = buildRosterRequestMessage(draft, locale);
    return {
      ok: true,
      lines: draft.lines,
      partySize: draft.partySize,
      when: draft.when,
      message: built.message,
      // Agency hosts serve the contact page at the root.
      href: rosterChatRequestHref("/contact", built.message),
      truncated: built.truncated,
    };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}
