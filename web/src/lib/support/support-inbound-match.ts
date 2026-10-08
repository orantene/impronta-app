/**
 * Pure helpers that tie an inbound email back to ONE support ticket.
 *
 * Token = `<ticket uuid, 32 hex>-<16 base32 chars of HMAC-SHA256(secret, id)>`.
 * The address `support+<token>@<inbound domain>` is unguessable (the MAC), and
 * the same token is embedded in a stable Message-ID / References so that
 * In-Reply-To matching needs no extra column. No DB, no env: pure + testable.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const B32 = "abcdefghijklmnopqrstuvwxyz234567";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^([0-9a-f]{32})-([a-z2-7]{16})$/;
const HEADER_TOKEN_RE = /tulala-support-([0-9a-f]{32}-[a-z2-7]{16})/i;
const PLUS_RE = /(?:^|[<\s,;"'])support\+([a-z0-9-]+)@/i;

function base32(buf: Buffer, chars: number): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = ((value << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5 && out.length < chars) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out.slice(0, chars);
}

function mac(ticketIdHex: string, secret: string): string {
  const digest = createHmac("sha256", secret)
    .update(`support-inbound-v1:${ticketIdHex}`)
    .digest();
  return base32(digest, 16);
}

export function ticketToken(ticketId: string, secret: string): string {
  if (!UUID_RE.test(ticketId)) throw new Error("ticketToken: ticketId must be a uuid");
  if (!secret) throw new Error("ticketToken: secret required");
  const hex = ticketId.replace(/-/g, "").toLowerCase();
  return `${hex}-${mac(hex, secret)}`;
}

/** Returns the ticket uuid when the token's MAC verifies, else null. */
export function parseTicketToken(token: string, secret: string): string | null {
  if (!secret || typeof token !== "string") return null;
  const m = TOKEN_RE.exec(token.trim().toLowerCase());
  if (!m) return null;
  const [, hex, given] = m;
  const expected = Buffer.from(mac(hex, secret));
  const actual = Buffer.from(given);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type InboundMatch = { ticketId: string } | { unmatched: string };

export function matchTicketFromInbound(
  input: {
    to: string | string[] | null | undefined;
    inReplyTo?: string | null;
    references?: string | null;
    /** Accepted for audit only: a `[Tulala #N]` subject is spoofable, never trusted. */
    subject?: string | null;
  },
  secret: string,
): InboundMatch {
  if (!secret) return { unmatched: "secret_not_configured" };
  const toList = Array.isArray(input.to) ? input.to : input.to ? [input.to] : [];
  let sawBadToken = false;
  for (const addr of toList) {
    const m = PLUS_RE.exec(String(addr));
    if (!m) continue;
    const id = parseTicketToken(m[1], secret);
    if (id) return { ticketId: id };
    sawBadToken = true;
  }
  for (const h of [input.inReplyTo, input.references]) {
    if (!h) continue;
    const m = HEADER_TOKEN_RE.exec(h);
    if (!m) continue;
    const id = parseTicketToken(m[1], secret);
    if (id) return { ticketId: id };
    sawBadToken = true;
  }
  return { unmatched: sawBadToken ? "invalid_token" : "no_token" };
}

/** Outbound threading values for a support email (consumed by the email channel). */
export function buildSupportThreading(opts: {
  ticketId: string;
  secret: string;
  domain: string;
  uniq: string;
}): { replyTo: string; headers: Record<string, string> } {
  const token = ticketToken(opts.ticketId, opts.secret);
  const safeUniq = opts.uniq.replace(/[^a-zA-Z0-9]/g, "").slice(0, 40) || "m";
  return {
    replyTo: `support+${token}@${opts.domain}`,
    headers: {
      "Message-ID": `<tulala-support-${token}.${safeUniq}@${opts.domain}>`,
      References: `<tulala-support-${token}@${opts.domain}>`,
    },
  };
}
