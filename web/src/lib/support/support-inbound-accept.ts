/** Pure: decide whether an inbound email may be appended to a ticket. */

export function normalizeEmailAddress(value: string | null | undefined): string {
  if (!value) return "";
  const m = /<([^>]+)>/.exec(value);
  return (m ? m[1] : value).trim().toLowerCase();
}

export type AcceptDecision = { accept: true } | { accept: false; reason: string };

const ROBOT_LOCALS = /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|donotreply)$/;

export function shouldAcceptInboundReply(input: {
  senderEmail: string | null | undefined;
  ticketOwnerEmail: string | null | undefined;
  headers: Record<string, string>;
}): AcceptDecision {
  const h: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.headers ?? {})) h[k.toLowerCase()] = String(v);

  const auto = h["auto-submitted"];
  if (auto !== undefined && auto.trim().toLowerCase() !== "no") {
    return { accept: false, reason: "auto_submitted" };
  }
  if (/^(bulk|junk|list)$/i.test((h["precedence"] ?? "").trim())) {
    return { accept: false, reason: "precedence_bulk" };
  }
  if ("x-autoreply" in h || "x-autorespond" in h) {
    return { accept: false, reason: "x_autoreply" };
  }
  const sender = normalizeEmailAddress(input.senderEmail);
  if (!sender || !sender.includes("@")) return { accept: false, reason: "no_sender" };
  if (ROBOT_LOCALS.test(sender.split("@")[0])) return { accept: false, reason: "robot_sender" };
  const owner = normalizeEmailAddress(input.ticketOwnerEmail);
  if (!owner) return { accept: false, reason: "owner_email_unknown" };
  if (sender !== owner) return { accept: false, reason: "sender_not_owner" };
  return { accept: true };
}
