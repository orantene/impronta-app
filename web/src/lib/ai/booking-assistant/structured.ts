/**
 * TUL-36 phase 2, flow A: the model's structured answer and the pure rules
 * that decide what the server does with it. The model only ever PROPOSES
 * "offer these times for this service"; the server validates the service id
 * against the public catalog and loads the real open times itself.
 * No money, no holds, no bookings here.
 */

import type { JsonSchemaForChat } from "@/lib/ai/provider";

export type BookingAssistantAction = "answer" | "offer_times" | "handoff";

export type BookingAssistantStructuredReply = {
  readonly reply: string;
  readonly action: BookingAssistantAction;
  readonly offeringId: string | null;
  /** YYYY-MM-DD, a hint for where to start looking. */
  readonly date: string | null;
};

export const BOOKING_ASSISTANT_JSON_SCHEMA: JsonSchemaForChat = {
  name: "booking_assistant_reply",
  strict: false,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["reply", "action"],
    properties: {
      reply: { type: "string" },
      action: { type: "string", enum: ["answer", "offer_times", "handoff"] },
      offering_id: { type: "string" },
      date: { type: "string", description: "YYYY-MM-DD" },
    },
  },
};

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Tolerates a ```json fence around the object. Returns null on anything else. */
export function parseBookingAssistantJson(raw: string): BookingAssistantStructuredReply | null {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  if (!text.startsWith("{")) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  if (typeof o.reply !== "string") return null;
  if (o.action !== "answer" && o.action !== "offer_times" && o.action !== "handoff") return null;
  const offeringId = typeof o.offering_id === "string" && o.offering_id.trim() ? o.offering_id.trim() : null;
  const date = typeof o.date === "string" && YMD_RE.test(o.date.trim()) ? o.date.trim() : null;
  return { reply: o.reply, action: o.action, offeringId, date };
}

/**
 * TUL-36 runtime check 1: how a raw completion is used. The adapter only asks
 * for the schema in the prompt, so the model may wrap the JSON in prose or cut
 * it off. Structured JSON (bare, fenced or embedded) is used; JSON-looking text
 * that will not parse is "broken" (the caller hands off and posts nothing); any
 * other text keeps the phase-1 text path.
 */
export type AssistantOutput =
  | { kind: "structured"; value: BookingAssistantStructuredReply }
  | { kind: "text"; text: string }
  | { kind: "broken" };

export function classifyAssistantOutput(raw: string): AssistantOutput {
  const direct = parseBookingAssistantJson(raw);
  if (direct) return { kind: "structured", value: direct };
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const embedded = parseBookingAssistantJson(raw.slice(start, end + 1));
    if (embedded) return { kind: "structured", value: embedded };
  }
  if (start >= 0 || /"(reply|action)"\s*:/.test(raw)) return { kind: "broken" };
  return { kind: "text", text: raw.trim() };
}

export type ResolvedAssistantAction =
  | { kind: "answer"; reply: string }
  | { kind: "handoff"; reply: string }
  | { kind: "offer_times"; reply: string; offeringId: string; date: string | null };

/**
 * offer_times needs a catalog service id and a mode that takes bookings.
 * Anything else falls to a handoff, never to a guessed service.
 */
export function resolveAssistantAction(
  parsed: BookingAssistantStructuredReply,
  input: { readonly catalogIds: ReadonlySet<string>; readonly canOfferTimes: boolean },
): ResolvedAssistantAction {
  if (parsed.action === "answer") return { kind: "answer", reply: parsed.reply };
  if (parsed.action === "handoff") return { kind: "handoff", reply: parsed.reply };
  if (!input.canOfferTimes) return { kind: "handoff", reply: parsed.reply };
  if (!parsed.offeringId || !input.catalogIds.has(parsed.offeringId)) {
    return { kind: "handoff", reply: parsed.reply };
  }
  return { kind: "offer_times", reply: parsed.reply, offeringId: parsed.offeringId, date: parsed.date };
}

/** Most starts one card carries (matches the staff times sheet). */
export const OFFER_TIMES_MAX = 6;

/** Days scanned for open times when the guest named none, or the day is full. */
export const OFFER_TIMES_WINDOW_DAYS = 7;

/**
 * Where to start looking: the hinted date when it is today or later,
 * otherwise now. Past or malformed hints never reach the slot loader.
 */
export function offerTimesFrom(date: string | null, now: Date): Date {
  if (!date) return now;
  const d = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime()) || d.getTime() <= now.getTime()) return now;
  return d;
}

/** Future, de-duplicated, sorted, capped starts. */
export function pickOfferStarts(slots: readonly string[], now: Date, max: number = OFFER_TIMES_MAX): string[] {
  const out = new Set<string>();
  for (const s of [...slots].sort()) {
    if (Date.parse(s) > now.getTime()) out.add(s);
    if (out.size >= max) break;
  }
  return [...out];
}
