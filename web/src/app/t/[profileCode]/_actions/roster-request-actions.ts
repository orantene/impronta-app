"use server";

/**
 * TUL-1415 · the front-door chat builds ONE request across roster services.
 *
 * "chef for 10 people Saturday and 2 waiters" becomes one prefilled message for the
 * workspace contact form (several lines, party size, day). REQUEST-ONLY: no price, no
 * checkout, no pay button.
 *
 * The tenant comes ONLY from the public host (never a client value) and only an AGENCY
 * workspace host has a roster to sell; the shared hub never does. Candidates are exactly what
 * `loadWorkspaceRosterServices` returns (tenant-strict, public-directory predicate on every
 * entry, hidden show-who entries expose no talent id or name). Fails closed.
 */

import { headers } from "next/headers";
import { z } from "zod";

import { resolveBookingAssistantReplyLocale } from "@/lib/ai/booking-assistant/handoff";
import { checkPublicCatalog } from "@/lib/rate-limit-kv";
import { getPublicHostContext } from "@/lib/saas/scope";
import { logServerError } from "@/lib/server/safe-error";
import { resolvePublicClientIp } from "@/lib/server/public-client-ip";
import {
  ROSTER_REQUEST_MAX_SENTENCE,
  buildRosterRequestDraft,
  buildRosterRequestMessage,
  rosterChatRequestHref,
  type RosterRequestLine,
} from "@/lib/service-hub/roster-chat-request";
import { loadWorkspaceRosterServices } from "@/lib/service-hub/roster-services";
import { createServiceRoleClient } from "@/lib/supabase/admin";

const inputSchema = z.object({
  sentence: z.string().trim().min(1).max(ROSTER_REQUEST_MAX_SENTENCE),
  /** Page language hint only; the sentence's own language wins. */
  locale: z.string().max(8).nullable().optional(),
});

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

export async function buildRosterRequestFromSentence(raw: { sentence: string; locale?: string | null }): Promise<BuildRosterRequestResult> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    const limited = await checkPublicCatalog(resolvePublicClientIp(await headers()));
    if (!limited.ok) return { ok: false, error: "rate_limited" };
    // The tenant is the host's. Only an agency workspace has a roster; hub and talent hosts do not.
    const host = await getPublicHostContext();
    if (host.kind !== "agency" || !host.tenantId) return { ok: false, error: "not_available" };
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "unavailable" };

    const items = await loadWorkspaceRosterServices(admin, host.tenantId);
    if (items.length === 0) return { ok: false, error: "no_match" };
    const draft = buildRosterRequestDraft(parsed.data.sentence, items);
    if (draft.lines.length === 0) return { ok: false, error: "no_match" };

    const locale = resolveBookingAssistantReplyLocale(parsed.data.sentence, parsed.data.locale);
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
  } catch (err) {
    logServerError("roster-request-actions.buildRosterRequestFromSentence", err);
    return { ok: false, error: "unavailable" };
  }
}
