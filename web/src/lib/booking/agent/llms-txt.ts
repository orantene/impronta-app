/**
 * TUL-21: `/llms.txt` for a talent's own site (https://llmstxt.org). Tells an
 * AI assistant what the talent offers and where the machine-readable booking
 * endpoints are. Pure.
 */

import type { AgentService } from "./catalog";

export const AGENT_CATALOG_PATH = "/api/public/booking/catalog";
export const AGENT_SLOTS_PATH = "/api/public/booking/slots";
export const AGENT_MCP_PATH = "/api/public/booking/mcp";

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function buildTalentLlmsTxt(input: {
  origin: string;
  name: string;
  services: readonly AgentService[];
  agentBookingEnabled: boolean;
}): string {
  const name = oneLine(input.name) || "This talent";
  const lines: string[] = [
    `# ${name}`,
    "",
    `> ${name}'s booking site, powered by Tulala. Services, prices and open times below are live.`,
    "",
    "## Services",
    "",
  ];
  if (input.services.length === 0) {
    lines.push("No public services are listed right now.");
  }
  for (const s of input.services) {
    const parts = [s.price];
    if (s.duration_minutes) parts.push(`${s.duration_minutes} min`);
    lines.push(`- ${oneLine(s.title)}: ${parts.join(", ")} (service_id: ${s.id})`);
  }
  lines.push(
    "",
    "## For AI assistants",
    "",
    `- [Service list (JSON)](${input.origin}${AGENT_CATALOG_PATH})`,
    `- [Open times (JSON)](${input.origin}${AGENT_SLOTS_PATH}?offering=<service_id>&days=7): free start times, ISO 8601 UTC`,
    `- [MCP server](${input.origin}${AGENT_MCP_PATH}): streamable HTTP, tools list_services, find_open_times, request_booking, get_request_status`,
    "",
    input.agentBookingEnabled
      ? "request_booking does not book anything. It returns a link the person opens to confirm in the talent's chat. get_request_status takes the returned handoff_id and answers link_not_used, sent, accepted, declined or expired, with no personal details."
      : `${name} has not turned on booking through AI assistants. You can read services and open times; send the person to this site to book.`,
    "",
  );
  return lines.join("\n");
}
