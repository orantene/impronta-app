import "server-only";

import { improntaLog } from "@/lib/server/structured-log";
import { logServerError } from "@/lib/server/safe-error";
import { normalizeEmailAddress, shouldAcceptInboundReply } from "./support-inbound-accept";
import { matchTicketFromInbound, supportInboundSecret } from "./support-inbound-match";
import { sanitizeInboundReplyBody } from "./support-inbound-sanitize";

/**
 * Append a stored inbound email (public.resend_inbound_emails) to the matching
 * support ticket thread. Called from the Resend webhook route AFTER the row is
 * stored. NEVER throws: every failure becomes an outcome + a log line.
 */

export type InboundRow = {
  from_address: string;
  to_addresses: string[];
  subject: string;
  body_text: string | null;
  body_html: string | null;
};

export type InboundTicket = {
  id: string;
  status: "open" | "resolved" | "closed";
  requesterUserId: string | null;
  contactEmail: string | null;
};

export type AppendOutcome =
  | { outcome: "appended"; ticketId: string; messageId: string }
  | { outcome: "duplicate"; ticketId: string; messageId: string }
  | { outcome: "unmatched"; reason: string }
  | { outcome: "rejected"; reason: string; ticketId?: string }
  | { outcome: "error"; reason: string };

export type AppendDeps = {
  secret: string | null;
  loadInboundRow: (emailId: string) => Promise<InboundRow | null>;
  /** Raw MIME headers of the received mail (null when they cannot be read). */
  fetchHeaders: (emailId: string) => Promise<Record<string, string> | null>;
  loadTicket: (ticketId: string) => Promise<InboundTicket | null>;
  /** Verified email of the ticket owner (account email, or guest contact email). */
  loadOwnerEmail: (ticket: InboundTicket) => Promise<string | null>;
  findExisting: (ticketId: string, sendKey: string) => Promise<{ id: string } | null>;
  append: (input: {
    ticketId: string;
    authorUserId: string | null;
    body: string;
    clientSendKey: string;
    extraMetadata: Record<string, unknown>;
  }) => Promise<{ ok: true; messageId: string } | { ok: false; error: string }>;
};

function log(outcome: AppendOutcome, emailId: string): void {
  void improntaLog("support.inbound.append", {
    emailId,
    outcome: outcome.outcome,
    reason: "reason" in outcome ? outcome.reason : null,
    ticketId: "ticketId" in outcome ? outcome.ticketId : null,
  });
}

export async function appendInboundReplyToTicket(
  emailId: string,
  deps: AppendDeps,
): Promise<AppendOutcome> {
  let result: AppendOutcome;
  try {
    result = await run(emailId, deps);
  } catch (err) {
    logServerError("support.inbound.append", err);
    result = { outcome: "error", reason: "exception" };
  }
  log(result, emailId);
  return result;
}

async function run(emailId: string, deps: AppendDeps): Promise<AppendOutcome> {
  if (!deps.secret) return { outcome: "unmatched", reason: "secret_not_configured" };

  const row = await deps.loadInboundRow(emailId);
  if (!row) return { outcome: "error", reason: "inbound_row_missing" };

  const headers = await deps.fetchHeaders(emailId);
  // Fail closed: without headers we cannot tell an auto-reply from a person.
  if (!headers) return { outcome: "error", reason: "headers_unavailable" };
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = String(v);

  const match = matchTicketFromInbound(
    {
      to: row.to_addresses,
      inReplyTo: lower["in-reply-to"],
      references: lower["references"],
      subject: row.subject,
    },
    deps.secret,
  );
  if ("unmatched" in match) return { outcome: "unmatched", reason: match.unmatched };

  const ticket = await deps.loadTicket(match.ticketId);
  if (!ticket) return { outcome: "unmatched", reason: "ticket_not_found" };
  if (ticket.status === "closed") {
    return { outcome: "rejected", reason: "ticket_closed", ticketId: ticket.id };
  }

  const ownerEmail = await deps.loadOwnerEmail(ticket);
  const decision = shouldAcceptInboundReply({
    senderEmail: normalizeEmailAddress(row.from_address),
    ticketOwnerEmail: ownerEmail,
    headers: lower,
  });
  if (!decision.accept) {
    return { outcome: "rejected", reason: decision.reason, ticketId: ticket.id };
  }

  const body = sanitizeInboundReplyBody({ text: row.body_text, html: row.body_html });
  if (!body) return { outcome: "rejected", reason: "empty_body", ticketId: ticket.id };

  const sendKey = `email:${emailId}`;
  const prior = await deps.findExisting(ticket.id, sendKey);
  if (prior) return { outcome: "duplicate", ticketId: ticket.id, messageId: prior.id };

  const appended = await deps.append({
    ticketId: ticket.id,
    authorUserId: ticket.requesterUserId,
    body,
    clientSendKey: sendKey,
    extraMetadata: { channel: "email", resend_email_id: emailId },
  });
  if (!appended.ok) return { outcome: "error", reason: appended.error };
  return { outcome: "appended", ticketId: ticket.id, messageId: appended.messageId };
}

/** Production wiring. Dynamic imports keep the pure path light in tests. */
export function buildDefaultAppendDeps(): AppendDeps {
  const secret = supportInboundSecret();
  return {
    secret,
    async loadInboundRow(emailId) {
      const { createServiceRoleClient } = await import("@/lib/supabase/admin");
      const admin = createServiceRoleClient();
      if (!admin) return null;
      const { data, error } = await admin
        .from("resend_inbound_emails")
        .select("from_address, to_addresses, subject, body_text, body_html")
        .eq("resend_email_id", emailId)
        .maybeSingle();
      if (error) {
        logServerError("support.inbound.loadRow", error);
        return null;
      }
      return (data as InboundRow | null) ?? null;
    },
    async fetchHeaders(emailId) {
      const { getResendClient } = await import("@/lib/email/resend-client");
      const resend = getResendClient();
      if (!resend) return null;
      const { data, error } = await resend.emails.receiving.get(emailId);
      if (error || !data) {
        logServerError("support.inbound.fetchHeaders", error ?? new Error("no payload"));
        return null;
      }
      const raw = (data as { headers?: unknown }).headers;
      const out: Record<string, string> = {};
      if (Array.isArray(raw)) {
        for (const h of raw as Array<{ name?: string; value?: string }>) {
          if (h?.name) out[h.name] = String(h.value ?? "");
        }
      } else if (raw && typeof raw === "object") {
        for (const [k, v] of Object.entries(raw as Record<string, unknown>)) out[k] = String(v ?? "");
      }
      return out;
    },
    async loadTicket(ticketId) {
      const { adminClient, loadTicketById } = await import("./support-engine-db");
      const admin = adminClient();
      if (!admin) return null;
      const t = await loadTicketById(ticketId, admin);
      if (!t) return null;
      return {
        id: t.id,
        status: t.status,
        requesterUserId: t.requesterUserId,
        contactEmail: t.contactEmail,
      };
    },
    async loadOwnerEmail(ticket) {
      if (!ticket.requesterUserId) return ticket.contactEmail; // guest ticket
      const { createServiceRoleClient } = await import("@/lib/supabase/admin");
      const admin = createServiceRoleClient();
      if (!admin) return null;
      const { data, error } = await admin.auth.admin.getUserById(ticket.requesterUserId);
      if (error) {
        logServerError("support.inbound.ownerEmail", error);
        return null;
      }
      const user = data?.user;
      // Only a confirmed account email counts as "verified".
      return user?.email && user.email_confirmed_at ? user.email : null;
    },
    async findExisting(ticketId, sendKey) {
      const { adminClient, findMessageByClientSendKey } = await import("./support-engine-db");
      const admin = adminClient();
      if (!admin) return null;
      return findMessageByClientSendKey(admin, ticketId, sendKey);
    },
    async append(input) {
      const { supportEngine } = await import("./support-engine");
      const res = await supportEngine.appendMessage({
        ticketId: input.ticketId,
        authorKind: "requester",
        authorUserId: input.authorUserId,
        body: input.body,
        clientSendKey: input.clientSendKey,
        extraMetadata: input.extraMetadata,
      });
      return res.ok ? { ok: true, messageId: res.data.message.id } : { ok: false, error: res.error };
    },
  };
}

/** Reply threading is on only when a Resend receiving domain is configured. */
export function inboundThreadingEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return !!env.SUPPORT_INBOUND_DOMAIN?.trim();
}

/** Route hook: safe to await, never throws. */
export async function appendInboundSupportReply(emailId: string | undefined): Promise<void> {
  if (!emailId) return;
  // Inert until a receiving domain exists: no outbound mail carries a token before
  // then, so skip the extra Resend call for every inbound email.
  if (!inboundThreadingEnabled()) return;
  try {
    await appendInboundReplyToTicket(emailId, buildDefaultAppendDeps());
  } catch (err) {
    logServerError("support.inbound.hook", err);
  }
}
