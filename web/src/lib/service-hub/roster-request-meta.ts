/**
 * TUL-1415 / TUL-1587 · the structured form of a front-door roster request.
 *
 * "chef for 10 people Saturday and 2 waiters" is stored ON the guest's message
 * (`inquiry_messages.metadata.roster_request`), so the owner inbox can draw it as a request with
 * lines instead of a plain chat bubble. REQUEST-ONLY: no price, no pay button, no checkout.
 *
 * The client only proposes `{ entry_id, quantity }`; the server re-reads the tenant-strict roster
 * and keeps the lines whose opaque id is on that list (titles and names always come from the list).
 * Pure: no I/O.
 */
import {
  ROSTER_REQUEST_MAX_LINES,
  ROSTER_REQUEST_MAX_PARTY,
  sanitizeModelRosterLines,
  type RosterRequestLine,
} from "./roster-chat-request";
import type { RosterServiceItem } from "./roster-services";

export const ROSTER_REQUEST_META_KEY = "roster_request";

/** What the guest chat sends along with the message text. Untrusted until sanitized. */
export type RosterRequestWire = {
  lines: { entry_id: string; quantity: number }[];
  party_size: number | null;
  when: string | null;
};

/** What is stored and what the owner inbox reads. */
export type RosterRequestMeta = {
  lines: { entry_id: string; title: string; quantity: number; talent_name: string | null }[];
  party_size: number | null;
  when: string | null;
};

const WHEN_RE = /^[a-z0-9-]{2,12}$/;

export function toRosterRequestWire(res: { lines: readonly RosterRequestLine[]; partySize: number | null; when: string | null }): RosterRequestWire {
  return {
    lines: res.lines.slice(0, ROSTER_REQUEST_MAX_LINES).map((l) => ({ entry_id: l.entryId, quantity: l.quantity })),
    party_size: res.partySize,
    when: res.when,
  };
}

/** The wire value reduced to what exists on the allow-list, or null when no line survives. */
export function sanitizeRosterRequestWire(raw: unknown, items: readonly RosterServiceItem[]): RosterRequestMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const lines = sanitizeModelRosterLines(o.lines, items);
  if (lines.length === 0) return null;
  const party = typeof o.party_size === "number" && Number.isInteger(o.party_size) && o.party_size >= 1 && o.party_size <= ROSTER_REQUEST_MAX_PARTY ? o.party_size : null;
  const when = typeof o.when === "string" && WHEN_RE.test(o.when) ? o.when : null;
  return {
    lines: lines.map((l) => ({ entry_id: l.entryId, title: l.title, quantity: l.quantity, talent_name: l.talentName })),
    party_size: party,
    when,
  };
}

/** The message `metadata` object to store, or undefined for a plain message. */
export function rosterRequestMetadata(meta: RosterRequestMeta | null): Record<string, unknown> | undefined {
  return meta ? { [ROSTER_REQUEST_META_KEY]: meta } : undefined;
}

/** Owner side: the stored request off a message's metadata, defensively parsed. Null = a plain message. */
export function readRosterRequestMeta(metadata: unknown): RosterRequestMeta | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = (metadata as Record<string, unknown>)[ROSTER_REQUEST_META_KEY];
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { lines?: unknown }).lines)) return null;
  const r = raw as { lines: unknown[]; party_size?: unknown; when?: unknown };
  const lines: RosterRequestMeta["lines"] = [];
  for (const l of r.lines) {
    if (!l || typeof l !== "object") continue;
    const x = l as Record<string, unknown>;
    if (typeof x.entry_id !== "string" || typeof x.title !== "string" || !x.title.trim()) continue;
    const q = typeof x.quantity === "number" && Number.isFinite(x.quantity) && x.quantity >= 1 ? Math.floor(x.quantity) : 1;
    lines.push({ entry_id: x.entry_id, title: x.title, quantity: q, talent_name: typeof x.talent_name === "string" && x.talent_name.trim() ? x.talent_name : null });
  }
  if (lines.length === 0) return null;
  return {
    lines,
    party_size: typeof r.party_size === "number" ? r.party_size : null,
    when: typeof r.when === "string" ? r.when : null,
  };
}
