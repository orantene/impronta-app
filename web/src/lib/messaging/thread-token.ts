import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

const VERSION = "v1";
const SEPARATOR = ".";
const PURPOSE = "pos-thread";
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// D-MSG-6 (owner decision 6): "Client link lives until 30 days after the last
// record date; re-issued by any new payment or confirmation." The expiry is
// computed once, at mint time, and carried IN the payload — verification only
// ever compares `now` against `payload.exp`, never recomputes it. That keeps
// verifyThreadToken a pure, DB-free function (it runs on every guest request).
export type ThreadTokenPayload = {
  p: typeof PURPOSE;
  iq: string;
  tenant: string;
  iat: number;
  /** Epoch ms. Absent on tokens minted before this field existed — treated
   *  as `iat + DEFAULT_TTL_MS` by verifyThreadToken for backward compat. */
  exp?: number;
};

function secret(): string | null {
  const value = process.env.GUEST_COOKIE_SECRET;
  return value && value.length > 0 ? value : null;
}

function signEncoded(encoded: string, key: string): string {
  return createHmac("sha256", key).update(`pos-thread:${VERSION}:${encoded}`).digest("base64url");
}

/**
 * Mints the token. `expMs` is the absolute epoch-ms expiry to bake into the
 * payload — pass the result of `resolveThreadTokenExpiry` (D-MSG-6). Callers
 * that don't have a DB handle (or don't care, e.g. tests) may omit it and
 * get the old flat `mint + 30d` behaviour, unchanged.
 */
export function signThreadToken(
  inquiryId: string,
  tenantId: string,
  nowMs = Date.now(),
  expMs: number = nowMs + DEFAULT_TTL_MS,
): string | null {
  const key = secret();
  if (!key || !inquiryId || !tenantId) return null;
  const payload: ThreadTokenPayload = { p: PURPOSE, iq: inquiryId, tenant: tenantId, iat: nowMs, exp: expMs };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${VERSION}${SEPARATOR}${encoded}${SEPARATOR}${signEncoded(encoded, key)}`;
}

export type VerifyThreadTokenResult =
  | { ok: true; inquiryId: string; tenantId: string; issuedAtMs: number; expiresAtMs: number }
  | { ok: false; reason: "no_secret" | "malformed" | "bad_signature" | "expired" };

export function verifyThreadToken(token: string, nowMs = Date.now()): VerifyThreadTokenResult {
  const key = secret();
  if (!key) return { ok: false, reason: "no_secret" };
  const parts = token.split(SEPARATOR);
  if (parts.length !== 3 || parts[0] !== VERSION) return { ok: false, reason: "malformed" };
  const [ , encoded, sig] = parts;
  const expected = signEncoded(encoded, key);
  const left = Buffer.from(sig, "utf8");
  const right = Buffer.from(expected, "utf8");
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return { ok: false, reason: "bad_signature" };
  }
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ThreadTokenPayload;
    if (payload.p !== PURPOSE || !payload.iq || !payload.tenant) return { ok: false, reason: "malformed" };
    // Payload-carried expiry wins (D-MSG-6). Older tokens minted before `exp`
    // existed fall back to the flat 30-day rule so nothing already issued
    // breaks on deploy.
    const expiresAtMs = typeof payload.exp === "number" ? payload.exp : payload.iat + DEFAULT_TTL_MS;
    if (nowMs > expiresAtMs) return { ok: false, reason: "expired" };
    return { ok: true, inquiryId: payload.iq, tenantId: payload.tenant, issuedAtMs: payload.iat, expiresAtMs };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}

export function issueVisitorCode(): string {
  return String(randomInt(100000, 1000000));
}

/** Customer cards until the integrator dispatches `/c/:param` (D-POS-89). */
export function publicThreadPath(token: string): string {
  return `/c/t/${encodeURIComponent(token)}`;
}

// ── D-MSG-6: expiry-from-record resolution ─────────────────────────────────

/** Minimal duck-typed handle — same shape `essentials.ts` uses, so this file
 *  stays importable from any server context without pulling in the full
 *  `@supabase/supabase-js` client type. */
type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

const RECORD_KINDS_ON_ADMISSIONS = new Set(["appointment", "reservation", "tickets", "class_enrolment"]);

/**
 * One linked record's date, or null when the kind/table has no resolvable
 * date (e.g. 'project', 'offer' — no fulfilment date exists yet) or the row
 * is gone. Deliberately tolerant: a lookup failure drops that record from the
 * max() rather than throwing, because a link the customer no longer needs
 * (record deleted, etc.) must never take down link minting.
 *
 * order -> orders.created_at
 * appointment / reservation / tickets / class_enrolment -> admissions.starts_at
 *   (admissions is the single booking-holder table across Sessions & Classes,
 *   Reservations and Events/Ticketing — see supabase/migrations/20261229000360_admissions.sql
 *   and web/src/lib/reservations/store.ts's seatWalkIn, which inserts a
 *   reservation directly as an admissions row with `starts_at`.)
 * project / offer -> no known date column yet; skipped.
 */
async function resolveRecordDateMs(
  admin: Admin,
  recordKind: string,
  recordId: string,
): Promise<number | null> {
  try {
    if (recordKind === "order") {
      const { data, error } = await admin.from("orders").select("created_at").eq("id", recordId).maybeSingle();
      if (error) return null;
      const createdAt = (data as { created_at?: string } | null)?.created_at;
      if (!createdAt) return null;
      const ms = Date.parse(createdAt);
      return Number.isFinite(ms) ? ms : null;
    }
    if (RECORD_KINDS_ON_ADMISSIONS.has(recordKind)) {
      const { data, error } = await admin.from("admissions").select("starts_at").eq("id", recordId).maybeSingle();
      if (error) return null;
      const startsAt = (data as { starts_at?: string | null } | null)?.starts_at;
      if (!startsAt) return null;
      const ms = Date.parse(startsAt);
      return Number.isFinite(ms) ? ms : null;
    }
    // 'project' | 'offer' | anything future — no date semantics yet.
    return null;
  } catch {
    return null;
  }
}

/**
 * D-MSG-6: expiry is 30 days after the LATEST live linked record's date for
 * this inquiry; falls back to `nowMs + 30d` when there are no links, or none
 * of them resolve to a date. Pure query, no writes — safe to call from a read
 * path (e.g. before showing a link) as well as from mint/refresh.
 */
export async function resolveThreadTokenExpiry(
  admin: Admin,
  inquiryId: string,
  nowMs = Date.now(),
): Promise<number> {
  const fallback = nowMs + DEFAULT_TTL_MS;
  const { data: links, error: linkErr } = await admin
    .from("conversation_records")
    .select("record_kind, record_id")
    .eq("inquiry_id", inquiryId)
    .is("unlinked_at", null);
  if (linkErr) return fallback;
  const rows = (links ?? []) as { record_kind: string; record_id: string }[];
  if (rows.length === 0) return fallback;

  const dates = await Promise.all(rows.map((row) => resolveRecordDateMs(admin, row.record_kind, row.record_id)));
  const resolved = dates.filter((ms): ms is number => ms !== null);
  if (resolved.length === 0) return fallback;

  const latest = Math.max(...resolved);
  return latest + DEFAULT_TTL_MS;
}

/**
 * SEAM (not wired in): mints a fresh token for an inquiry, expiry resolved
 * per D-MSG-6. The payment and confirmation paths are where a new payment or
 * confirmation should "re-issue" the link (owner decision 6, second clause) —
 * this lane only exports the helper; a follow-up lane calls it from
 * `messaging-engine.ts` (or wherever payment/confirm actions land) after the
 * write that changes the record, and hands the new token to whatever surface
 * shows the customer their link.
 */
export async function refreshThreadToken(
  admin: Admin,
  inquiryId: string,
  tenantId: string,
  nowMs = Date.now(),
): Promise<string | null> {
  const expMs = await resolveThreadTokenExpiry(admin, inquiryId, nowMs);
  return signThreadToken(inquiryId, tenantId, nowMs, expMs);
}
