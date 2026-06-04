/**
 * guest-message-extract.ts — AI conversational capture (Lane D).
 *
 * Parses a guest's FIRST free-text chat message into structured InquiryIntent
 * fragments (location / date / event_type / headcount / budget / service hints)
 * so the coordinator sees real details instead of a raw blob + `not_sure`
 * everywhere.
 *
 * REUSE, not a new LLM client: this leans on the SAME provider/gate plumbing as
 * the directory interpret-search extractor —
 *   • resolveAiChatAdapter()        → the configured OpenAI/Anthropic adapter
 *   • adapter.chatCompletion({ jsonSchema }) → structured output (OpenAI native,
 *                                    Anthropic via prompt) — mirrors
 *                                    interpret-search-model.ts verbatim
 *   • getAiFeatureFlags()/isResolvedAiChatConfigured()/assertAiInvocationAllowed()
 *                                   → the existing master/draft toggles + usage gate
 *   • recordAiUsageEstimate()       → the existing spend counter
 *
 * CONTRACT: this is BEST-EFFORT and NON-BLOCKING. Every failure mode (AI off,
 * no key, rate-limited, network error, bad JSON, exception) returns an EMPTY
 * fragment set. The caller MUST fall back to `{ status: "not_sure" }` so
 * validateIntentForSubmit still passes and the inquiry is always created.
 */

import { resolveAiChatAdapter } from "@/lib/ai/resolve-provider";
import { isResolvedAiChatConfigured } from "@/lib/ai/resolve-provider";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import {
  assertAiInvocationAllowed,
  recordAiUsageEstimate,
} from "@/lib/ai/ai-usage-gate";
import { logServerError } from "@/lib/server/safe-error";
import type {
  InquiryBudget,
  InquiryDate,
  InquiryLocation,
  InquiryTalent,
} from "@/lib/inquiry/inquiry-intent";

/** Hard cap on the message we hand the model — abuse/cost guard. */
const MAX_MESSAGE_CHARS = 4000;
/** Wall-clock budget for the whole extraction. Beyond this we bail to defaults. */
const EXTRACTION_TIMEOUT_MS = Math.max(
  1500,
  Number.parseInt(process.env.GUEST_CAPTURE_TIMEOUT_MS?.trim() ?? "6000", 10) || 6000,
);

/**
 * The structured InquiryIntent fragments derived from the first message. Each is
 * optional — only fields the AI could confidently determine are present. The
 * caller spreads these over its `not_sure` defaults.
 */
export type GuestMessageCapture = {
  location?: InquiryLocation;
  date?: InquiryDate;
  budget?: InquiryBudget;
  talent?: Pick<InquiryTalent, "count_needed" | "types_needed">;
  /** Free-text event-type label ("wedding", "brand shoot"). UI hint only. */
  eventType?: string;
};

/** JSON-schema envelope — same shape/strict pattern as INTERPRET_SEARCH_JSON_SCHEMA. */
const CAPTURE_JSON_SCHEMA = {
  name: "guest_inquiry_capture",
  strict: true,
  schema: {
    type: "object",
    properties: {
      city: { type: "string" },
      area: { type: "string" },
      country: { type: "string" },
      /** "online" when explicitly virtual; "" otherwise. */
      is_online: { type: "boolean" },
      /** YYYY-MM-DD when an exact date is stated; "" otherwise. */
      event_date: { type: "string" },
      /** "exact" | "flexible" | "" — leave "" if no date signal at all. */
      date_signal: { type: "string" },
      /** Free-form duration ("2 hours", "full day"); "" if none. */
      duration: { type: "string" },
      /** Free-text event type ("wedding", "product launch"); "" if unclear. */
      event_type: { type: "string" },
      /** Number of talent/people requested; 0 when not stated. */
      headcount: { type: "integer" },
      /** Service / talent type hints (roles, e.g. "photographer", "DJ"). */
      service_hints: { type: "array", items: { type: "string" } },
      /** Budget amount as a number; 0 when not stated. */
      budget_amount: { type: "number" },
      /** ISO 4217 code when a currency is clear ("USD","EUR","MXN"); "" otherwise. */
      budget_currency: { type: "string" },
    },
    required: [
      "city",
      "area",
      "country",
      "is_online",
      "event_date",
      "date_signal",
      "duration",
      "event_type",
      "headcount",
      "service_hints",
      "budget_amount",
      "budget_currency",
    ],
    additionalProperties: false,
  },
} as const;

type RawCapture = {
  city?: unknown;
  area?: unknown;
  country?: unknown;
  is_online?: unknown;
  event_date?: unknown;
  date_signal?: unknown;
  duration?: unknown;
  event_type?: unknown;
  headcount?: unknown;
  service_hints?: unknown;
  budget_amount?: unknown;
  budget_currency?: unknown;
};

const SYSTEM_PROMPT = `You extract structured booking details from the FIRST chat message a prospective client sends a talent agency. Output ONLY JSON matching the schema — no markdown.

Rules:
- Extract ONLY what the message clearly states or strongly implies. Never invent a city, date, headcount, or budget that is not present.
- city / area / country: the event/shoot location if mentioned, else "".
- is_online: true only if the event is explicitly virtual/remote/online.
- event_date: a concrete calendar date as YYYY-MM-DD if one is stated or unambiguous (resolve relative dates like "next Friday" only when a reference date is obvious; otherwise leave ""). Use "" if no exact date.
- date_signal: "exact" if a specific date is given, "flexible" if they mention a rough window or say they are flexible, else "".
- duration: free-form length if stated ("2 hours", "full day"), else "".
- event_type: a short label for the occasion ("wedding", "corporate gala", "brand shoot"), else "".
- headcount: integer count of talent/performers/people requested; 0 if not stated.
- service_hints: short role/service phrases requested ("photographer", "DJ", "host"); [] if none.
- budget_amount: numeric budget if stated; 0 if not. budget_currency: ISO 4217 (USD, EUR, MXN, GBP) if the currency or symbol is clear, else "".
- When unsure, prefer the empty/zero value over a guess.`;

function extractJsonPayload(content: string): string {
  const t = content.trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i.exec(t);
  if (fence) return fence[1]!.trim();
  return t;
}

function parseRaw(content: string): RawCapture | null {
  try {
    const parsed = JSON.parse(extractJsonPayload(content)) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as RawCapture;
  } catch {
    return null;
  }
}

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function asPositiveInt(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseInt(asString(v), 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

function asPositiveNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(asString(v));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

/** ISO-4217-ish: 3 letters. Normalize common symbols the model may emit. */
function normalizeCurrency(v: unknown): string | undefined {
  const raw = asString(v).toUpperCase();
  if (!raw) return undefined;
  const symbolMap: Record<string, string> = { "$": "USD", "€": "EUR", "£": "GBP" };
  const mapped = symbolMap[raw] ?? raw;
  return /^[A-Z]{3}$/.test(mapped) ? mapped : undefined;
}

const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Maps the raw model output to InquiryIntent fragments. Returns ONLY the
 * sub-objects that carry real signal; empty/zero fields are dropped so the
 * caller's `not_sure` defaults remain in force for them.
 */
function mapRawToCapture(raw: RawCapture): GuestMessageCapture {
  const out: GuestMessageCapture = {};

  // ── Location ───────────────────────────────────────────────────────────────
  const city = asString(raw.city);
  const area = asString(raw.area);
  const country = asString(raw.country);
  const isOnline = raw.is_online === true;
  if (city || area || country || isOnline) {
    const location: InquiryLocation = {
      status: isOnline ? "online" : "unconfirmed",
    };
    if (city) location.city = city;
    if (area) location.area = area;
    if (country) location.country = country;
    out.location = location;
  }

  // ── Date ─────────────────────────────────────────────────────────────────--
  const eventDate = asString(raw.event_date);
  const dateSignal = asString(raw.date_signal).toLowerCase();
  const duration = asString(raw.duration);
  if (VALID_DATE.test(eventDate)) {
    const date: InquiryDate = { status: "exact", event_date: eventDate };
    if (duration) date.duration = duration;
    out.date = date;
  } else if (dateSignal === "flexible" || duration) {
    const date: InquiryDate = { status: "flexible" };
    if (duration) date.duration = duration;
    out.date = date;
  }

  // ── Event type (UI hint) ────────────────────────────────────────────────────
  const eventType = asString(raw.event_type);
  if (eventType) out.eventType = eventType;

  // ── Talent (headcount + service hints) ──────────────────────────────────────
  const headcount = asPositiveInt(raw.headcount);
  const serviceHints = Array.isArray(raw.service_hints)
    ? raw.service_hints
        .map((s) => asString(s))
        .filter((s) => s.length > 0)
        .slice(0, 12)
    : [];
  if (headcount > 0 || serviceHints.length > 0) {
    const talent: Pick<InquiryTalent, "count_needed" | "types_needed"> = {};
    if (headcount > 0) talent.count_needed = headcount;
    if (serviceHints.length > 0) talent.types_needed = serviceHints;
    out.talent = talent;
  }

  // ── Budget ───────────────────────────────────────────────────────────────--
  const amount = asPositiveNumber(raw.budget_amount);
  const currency = normalizeCurrency(raw.budget_currency);
  if (amount > 0) {
    const budget: InquiryBudget = { preference: "total_budget", amount };
    if (currency) budget.currency = currency;
    out.budget = budget;
  }

  return out;
}

/** Resolves to `null` after the timeout — never rejects the race. */
function timeoutNull<T>(ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(null), ms);
  });
}

/**
 * Best-effort structured capture from a guest's first message.
 *
 * NEVER throws. Returns an empty object on ANY failure (AI disabled, no key,
 * rate-limited, timeout, bad JSON, exception). The caller treats an empty
 * result as "no AI signal" and keeps its `not_sure` defaults.
 *
 * @param tenantId scopes the AI usage gate to the right tenant counters.
 */
export async function captureGuestMessageDetails(
  firstMessage: string,
  tenantId?: string,
): Promise<GuestMessageCapture> {
  const message = (firstMessage ?? "").trim().slice(0, MAX_MESSAGE_CHARS);
  if (!message) return {};

  try {
    // Respect the existing master + draft toggles (same gates the inquiry-draft
    // endpoint uses — capture is part of the same "AI assists the inquiry" set).
    const flags = await getAiFeatureFlags();
    if (!flags.ai_master_enabled) return {};

    if (!(await isResolvedAiChatConfigured())) return {};

    // Respect the existing rate-limit / spend-cap guard. A tripped gate is NOT
    // an error here — we simply skip extraction and let the caller default.
    const gate = tenantId
      ? await assertAiInvocationAllowed(tenantId)
      : await assertAiInvocationAllowed();
    if (!gate.ok) return {};

    const adapter = await resolveAiChatAdapter();
    const completion = adapter.chatCompletion({
      systemPrompt: SYSTEM_PROMPT,
      userMessage: message,
      temperature: 0.1,
      maxTokens: 400,
      jsonSchema: {
        name: CAPTURE_JSON_SCHEMA.name,
        strict: CAPTURE_JSON_SCHEMA.strict,
        schema: CAPTURE_JSON_SCHEMA.schema as unknown as Record<string, unknown>,
      },
    });

    // Bound the wall-clock so a slow provider can never delay inquiry creation.
    const result = await Promise.race([completion, timeoutNull<Awaited<typeof completion>>(EXTRACTION_TIMEOUT_MS)]);
    if (!result || !result.ok) return {};

    const raw = parseRaw(result.text);
    if (!raw) return {};

    // Record the spend estimate (fire-and-forget) — same as every other AI path.
    if (tenantId) {
      recordAiUsageEstimate(tenantId).catch((err) =>
        logServerError("guest-message-extract/recordAiUsageEstimate", err),
      );
    } else {
      recordAiUsageEstimate().catch((err) =>
        logServerError("guest-message-extract/recordAiUsageEstimate", err),
      );
    }

    return mapRawToCapture(raw);
  } catch (err) {
    // Total isolation: extraction failure must NEVER block inquiry creation.
    logServerError("guest-message-extract/captureGuestMessageDetails", err);
    return {};
  }
}
