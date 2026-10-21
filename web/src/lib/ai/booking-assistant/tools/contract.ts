/**
 * TUL-36 slice 1: the booking assistant's TOOL CONTRACT. Pure, no I/O, no money.
 *
 * The model never runs code. It PROPOSES one tool call as JSON; the server parses it
 * here, decides whether the tool is available, and only then runs the deterministic
 * executor for that tool. Everything unclear falls to a handoff to a person.
 *
 * Rules this file pins:
 *  - a tool call is strict: unknown tools, unknown fields and bad types are a handoff;
 *  - the model names a service by a per-turn REF ("s1", "s2"), never a database id, and
 *    only refs of services the assistant was grounded on resolve (no hidden services);
 *  - a money tool carries NO amount, price or currency field at all: the price is always
 *    computed on the server from catalog rows (a model-supplied number is rejected);
 *  - money tools are not even offered unless the money flag is on (default OFF).
 */
import { z } from "zod";

import type { BookingHandoffReason } from "../handoff";

/** Read-only tools: safe to run for any guest of an enabled assistant. */
export const READ_ONLY_TOOLS = ["get_quote", "check_availability", "handoff_to_person"] as const;
/** Money tools: create an order / send a pay link. Flag-gated, default OFF. */
export const MONEY_TOOLS = ["create_order", "send_pay_link"] as const;

export type ReadOnlyToolName = (typeof READ_ONLY_TOOLS)[number];
export type MoneyToolName = (typeof MONEY_TOOLS)[number];
export type AssistantToolName = ReadOnlyToolName | MoneyToolName;

export function isMoneyTool(name: string): name is MoneyToolName {
  return (MONEY_TOOLS as readonly string[]).includes(name);
}

/** A per-turn service ref: "s1".."s40". Never a database id. */
const serviceRef = z.string().trim().regex(/^s[1-9][0-9]?$/);
const ymd = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoInstant = z.string().trim().min(10).max(40);
const units = z.number().int().min(1).max(20);

const getQuoteArgs = z.object({ service: serviceRef, units: units.optional() }).strict();
const checkAvailabilityArgs = z.object({ service: serviceRef, date: ymd.optional() }).strict();
const handoffArgs = z.object({ reason: z.enum(["unsure", "human_requested"]).optional() }).strict();
// Money tools: ref, units and a chosen start only. `.strict()` makes any price/amount/currency
// field a parse failure, so a model-supplied number can never reach the money code.
const createOrderArgs = z.object({ service: serviceRef, units: units.optional(), starts_at: isoInstant.optional() }).strict();
const sendPayLinkArgs = z.object({ service: serviceRef }).strict();

export const TOOL_ARG_SCHEMAS = {
  get_quote: getQuoteArgs,
  check_availability: checkAvailabilityArgs,
  handoff_to_person: handoffArgs,
  create_order: createOrderArgs,
  send_pay_link: sendPayLinkArgs,
} as const;

export type AssistantToolCall =
  | { tool: "get_quote"; args: z.infer<typeof getQuoteArgs> }
  | { tool: "check_availability"; args: z.infer<typeof checkAvailabilityArgs> }
  | { tool: "handoff_to_person"; args: z.infer<typeof handoffArgs> }
  | { tool: "create_order"; args: z.infer<typeof createOrderArgs> }
  | { tool: "send_pay_link"; args: z.infer<typeof sendPayLinkArgs> };

export type ParsedToolCall = { ok: true; call: AssistantToolCall } | { ok: false; reason: "bad_tool_call" };

/**
 * Parses `{ "tool": "...", "args": {...} }`. Tolerates a ```json fence. Anything else
 * (prose, extra keys, an unknown tool, a bad argument) is `bad_tool_call`, never a guess.
 */
export function parseAssistantToolCall(raw: unknown): ParsedToolCall {
  let value: unknown = raw;
  if (typeof raw === "string") {
    const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    if (!text.startsWith("{")) return { ok: false, reason: "bad_tool_call" };
    try {
      value = JSON.parse(text);
    } catch {
      return { ok: false, reason: "bad_tool_call" };
    }
  }
  const envelope = z.object({ tool: z.string(), args: z.record(z.string(), z.unknown()).optional() }).strict().safeParse(value);
  if (!envelope.success) return { ok: false, reason: "bad_tool_call" };
  const { tool } = envelope.data;
  const args = envelope.data.args ?? {};
  if (!Object.prototype.hasOwnProperty.call(TOOL_ARG_SCHEMAS, tool)) return { ok: false, reason: "bad_tool_call" };
  const schema: z.ZodType = TOOL_ARG_SCHEMAS[tool as AssistantToolName];
  const parsed = schema.safeParse(args);
  if (!parsed.success) return { ok: false, reason: "bad_tool_call" };
  return { ok: true, call: { tool, args: parsed.data } as AssistantToolCall };
}

/**
 * The services the assistant was grounded on this turn, as refs. Build it from the SAME public
 * list that goes into the prompt (never from a wider read), so a service the guest cannot see
 * has no ref and can never be named.
 */
export type ServiceRefs = ReadonlyMap<string, string>;

export function buildServiceRefs(offeringIds: readonly string[], max = 40): ServiceRefs {
  const out = new Map<string, string>();
  const seen = new Set<string>();
  for (const id of offeringIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (out.size >= max) break;
    out.set(`s${out.size + 1}`, id);
  }
  return out;
}

/** The database id for a ref, or null when the ref was not grounded this turn. */
export function resolveServiceRef(ref: string, refs: ServiceRefs): string | null {
  return refs.get(ref) ?? null;
}

export type ToolAvailabilityInput = {
  /** per-talent toggle AND master switch already resolved by the caller */
  assistantEnabled: boolean;
  /** the money flag (default OFF) */
  moneyEnabled?: boolean;
};

/** Tools offered to the model this turn. Money tools appear only when the flag is on. */
export function availableTools(input: ToolAvailabilityInput): AssistantToolName[] {
  if (!input.assistantEnabled) return [];
  return input.moneyEnabled === true ? [...READ_ONLY_TOOLS, ...MONEY_TOOLS] : [...READ_ONLY_TOOLS];
}

export type AssistantHandoffReason = BookingHandoffReason | "bad_tool_call" | "tool_unavailable" | "unknown_service" | "not_sellable";

/** Reasons the existing phase-1 handoff copy already knows; the rest read as "unsure". */
export function toBookingHandoffReason(reason: AssistantHandoffReason): BookingHandoffReason {
  switch (reason) {
    case "unsure":
    case "human_requested":
    case "turn_ceiling":
    case "gated":
    case "off":
      return reason;
    default:
      return "unsure";
  }
}

export type ToolRoute =
  | { kind: "run"; call: AssistantToolCall }
  | { kind: "handoff"; reason: AssistantHandoffReason };

/**
 * One decision for a parsed call: run it, or hand off. A tool that was not offered this turn
 * (assistant off, money flag off) is a handoff, never a silent skip and never a run.
 */
export function routeToolCall(parsed: ParsedToolCall, input: ToolAvailabilityInput): ToolRoute {
  if (!parsed.ok) return { kind: "handoff", reason: parsed.reason };
  if (!availableTools(input).includes(parsed.call.tool)) return { kind: "handoff", reason: "tool_unavailable" };
  if (parsed.call.tool === "handoff_to_person") {
    return { kind: "handoff", reason: parsed.call.args.reason ?? "unsure" };
  }
  return { kind: "run", call: parsed.call };
}

/**
 * The model-facing description of the tools (names and arguments only). Money tools are
 * listed only when available, so a model is never told about a tool it cannot use.
 */
export function describeTools(tools: readonly AssistantToolName[]): string {
  const lines: Record<AssistantToolName, string> = {
    get_quote: 'get_quote {"service":"s1","units":1} : the price of a listed service',
    check_availability: 'check_availability {"service":"s1","date":"YYYY-MM-DD"} : real open times',
    handoff_to_person: 'handoff_to_person {} : pass the chat to a person when unsure',
    create_order: 'create_order {"service":"s1","starts_at":"<time from check_availability>"} : start the booking (price is set by the server)',
    send_pay_link: 'send_pay_link {"service":"s1"} : send the payment link for the order (amount is set by the server)',
  };
  return tools.map((t) => lines[t]).join("\n");
}
