/**
 * TUL-21: a stateless MCP server (streamable HTTP, JSON responses) for one
 * talent's booking site. Pure JSON-RPC dispatch; the route injects the loaders.
 *
 * Four tools. Two read what the public site already shows. `request_booking`
 * never books: it returns a signed link the person opens to confirm in the
 * talent's own chat, so a human always takes the last step.
 * `get_request_status` reads back one coarse status for that link, no personal data.
 */

import { z } from "zod";

export const MCP_PROTOCOL_VERSION = "2025-06-18";
const SUPPORTED_PROTOCOL_VERSIONS = new Set(["2025-06-18", "2025-03-26", "2024-11-05"]);

const listServicesArgs = z.object({}).strict();
const findOpenTimesArgs = z
  .object({
    service_id: z.string().uuid().describe("A service_id from list_services."),
    from: z
      .string()
      .max(40)
      .optional()
      .describe("First day to search, YYYY-MM-DD or ISO 8601. Defaults to now."),
    days: z.number().int().min(1).max(14).optional().describe("How many days to search (1-14). Defaults to 7."),
  })
  .strict();
const requestBookingArgs = z
  .object({
    service_id: z.string().uuid().describe("A service_id from list_services."),
    starts_at: z
      .string()
      .max(40)
      .optional()
      .describe("Optional start time from find_open_times (ISO 8601). Checked against the live calendar."),
  })
  .strict();

const getRequestStatusArgs = z
  .object({
    handoff_id: z.string().uuid().describe("The handoff_id returned by request_booking."),
  })
  .strict();

export type FindOpenTimesArgs = z.infer<typeof findOpenTimesArgs>;
export type RequestBookingArgs = z.infer<typeof requestBookingArgs>;
export type GetRequestStatusArgs = z.infer<typeof getRequestStatusArgs>;

/** Each loader returns plain JSON. `error` marks a tool-level failure. */
export type AgentToolResult = { ok: true; data: Record<string, unknown> } | { ok: false; error: string; message: string };

export type AgentToolDeps = {
  talentName: string;
  listServices: () => Promise<AgentToolResult>;
  findOpenTimes: (args: FindOpenTimesArgs) => Promise<AgentToolResult>;
  requestBooking: (args: RequestBookingArgs) => Promise<AgentToolResult>;
  getRequestStatus: (args: GetRequestStatusArgs) => Promise<AgentToolResult>;
};

function inputSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

export function agentToolDefinitions(talentName: string) {
  return [
    {
      name: "list_services",
      title: "List services",
      description: `List ${talentName}'s public services with prices and length. Use a service_id with the other tools.`,
      inputSchema: inputSchema(listServicesArgs),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    {
      name: "find_open_times",
      title: "Find open times",
      description: `Free start times for one of ${talentName}'s services, in UTC, with the talent's timezone. An empty list comes with a reason.`,
      inputSchema: inputSchema(findOpenTimesArgs),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    {
      name: "request_booking",
      title: "Request a booking",
      description:
        `Get a link for the person to request one of ${talentName}'s services. Nothing is booked until the person ` +
        "opens the link and confirms in the talent's chat. The link expires in 30 minutes.",
      inputSchema: inputSchema(requestBookingArgs),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    {
      name: "get_request_status",
      title: "Check a request",
      description:
        `Check what happened to a request_booking link for ${talentName}. Returns one of link_not_used, sent, ` +
        "accepted, declined or expired. It never returns the person's details or messages.",
      inputSchema: inputSchema(getRequestStatusArgs),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
  ];
}

type JsonRpcId = string | number | null;
export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: unknown }
  | { jsonrpc: "2.0"; id: JsonRpcId; error: { code: number; message: string } };

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

function rpcError(id: JsonRpcId, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function toolResult(result: AgentToolResult) {
  const payload = result.ok ? result.data : { error: result.error, message: result.message };
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
    ...(result.ok ? {} : { isError: true }),
  };
}

async function callTool(params: unknown, deps: AgentToolDeps) {
  const p = (params && typeof params === "object" ? params : {}) as { name?: unknown; arguments?: unknown };
  const args = p.arguments ?? {};
  switch (p.name) {
    case "list_services": {
      if (!listServicesArgs.safeParse(args).success) return null;
      return toolResult(await deps.listServices());
    }
    case "find_open_times": {
      const parsed = findOpenTimesArgs.safeParse(args);
      if (!parsed.success) return toolResult({ ok: false, error: "invalid_arguments", message: parsed.error.message });
      return toolResult(await deps.findOpenTimes(parsed.data));
    }
    case "request_booking": {
      const parsed = requestBookingArgs.safeParse(args);
      if (!parsed.success) return toolResult({ ok: false, error: "invalid_arguments", message: parsed.error.message });
      return toolResult(await deps.requestBooking(parsed.data));
    }
    case "get_request_status": {
      const parsed = getRequestStatusArgs.safeParse(args);
      if (!parsed.success) return toolResult({ ok: false, error: "invalid_arguments", message: parsed.error.message });
      return toolResult(await deps.getRequestStatus(parsed.data));
    }
    default:
      return undefined;
  }
}

/**
 * One JSON-RPC message in, one response out. `null` = a notification (no
 * reply; the route answers 202).
 */
export async function handleMcpMessage(message: unknown, deps: AgentToolDeps): Promise<JsonRpcResponse | null> {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return rpcError(null, INVALID_REQUEST, "Expected one JSON-RPC request object.");
  }
  const m = message as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
  const hasId = typeof m.id === "string" || typeof m.id === "number";
  const id: JsonRpcId = hasId ? (m.id as string | number) : null;
  if (m.jsonrpc !== "2.0" || typeof m.method !== "string") {
    return rpcError(id, INVALID_REQUEST, "Expected jsonrpc 2.0 with a method.");
  }
  if (!hasId) return null;

  switch (m.method) {
    case "initialize": {
      const requested = (m.params as { protocolVersion?: unknown } | undefined)?.protocolVersion;
      const protocolVersion =
        typeof requested === "string" && SUPPORTED_PROTOCOL_VERSIONS.has(requested) ? requested : MCP_PROTOCOL_VERSION;
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "tulala-booking", title: `Book ${deps.talentName}`, version: "1.0.0" },
          instructions:
            `Tools for booking ${deps.talentName}. Call list_services, then find_open_times for a service. ` +
            "request_booking returns a link; give it to the person so they can confirm. Never claim a booking is made. " +
            "get_request_status with the handoff_id tells you if the person sent it and how the talent answered.",
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: agentToolDefinitions(deps.talentName) } };
    case "tools/call": {
      const result = await callTool(m.params, deps);
      if (result === undefined) return rpcError(id, INVALID_PARAMS, "Unknown tool.");
      if (result === null) return rpcError(id, INVALID_PARAMS, "Invalid arguments.");
      return { jsonrpc: "2.0", id, result };
    }
    default:
      return rpcError(id, METHOD_NOT_FOUND, `Method not found: ${m.method}`);
  }
}

/** Parse a raw POST body. Batches are not part of protocol 2025-06-18. */
export function parseMcpBody(raw: string): { ok: true; message: unknown } | { ok: false; response: JsonRpcResponse } {
  try {
    return { ok: true, message: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false, response: rpcError(null, PARSE_ERROR, "Body is not valid JSON.") };
  }
}
