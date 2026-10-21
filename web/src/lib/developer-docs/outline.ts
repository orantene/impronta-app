/**
 * Developer docs outline (TUL-1401). Facts are taken from the route files under
 * src/app/api; anything not read from code is a TODO, never invented.
 */

export type DocEndpoint = {
  method: "GET" | "POST" | "OPTIONS";
  /** Path under src/app/api, as served. */
  path: string;
  purpose: string;
  auth: string;
  request: string[];
  response: string[];
  errors: string[];
};

export type DocPage = { slug: string; title: string; summary: string; body: string[] };

export const DOC_ENDPOINTS: readonly DocEndpoint[] = [
  {
    method: "GET",
    path: "/api/public/booking/slots",
    purpose: "Free appointment start times for one offering. Never returns holds, bookings or blocks.",
    auth: "None. The host decides the business or talent.",
    request: [
      "offering (required): offering UUID",
      "from (optional): start date",
      "days (optional): window length, clamped by the server",
      "duration (optional): minutes, base plus selected extras",
      "workspace (optional): workspace slug",
    ],
    response: ["200 { slots: string[], timezone?, placeCity?, reason? } (reason only when slots is empty)"],
    errors: ["400 invalid_offering", "404 not_found (host kind cannot book)", "429 rate_limited", "500 query_failed", "503 service_unavailable"],
  },
  {
    method: "GET",
    path: "/api/public/booking/catalog",
    purpose: "One talent's public services as JSON (or markdown), for AI assistants.",
    auth: "None. Talent comes from the host, or ?talent=<profile code> on a shared host.",
    request: ["talent (optional): profile code", "format=md or Accept: text/markdown (optional): markdown contracts"],
    response: ["200 { talent, page, services, open_times, mcp }"],
    errors: ["403 ai_access_off (AI bot while the talent's switch is off)", "404 not_found", "429 rate_limited", "500 query_failed", "503 service_unavailable"],
  },
  {
    method: "GET",
    path: "/api/public/booking/business-catalog",
    purpose: "A business's guest-sellable services, read-only, for assistants and other sites.",
    auth: "None. Agency or hub host only; CORS open (GET, OPTIONS).",
    request: ["limit, offset (optional): paging", "lang=en|es (optional, default es)", "talent (required on the shared hub host): public profile code"],
    response: ["200 { business, site, talent?, total, offset, next_offset, services, ai }"],
    errors: ["400 talent_required", "403 ai_access_off", "404 not_found", "429 rate_limited", "500 query_failed", "503 service_unavailable"],
  },
  {
    method: "POST",
    path: "/api/public/booking/mcp",
    purpose: "MCP server (streamable HTTP, stateless, JSON responses) for one talent's booking site.",
    auth: "None. Talent from the host or ?talent=<profile code>.",
    request: ["JSON-RPC body, max 64 KB", "TODO: list the tools from src/lib/booking/agent/mcp"],
    response: ["200 JSON-RPC response", "202 no body for a notification"],
    errors: ["400 parse error", "404 no bookable talent", "413 request too large", "429 rate limited", "500 internal error", "503 unavailable", "GET returns 405 (Allow: POST)"],
  },
  {
    method: "GET",
    path: "/api/public/talent-policy",
    purpose: "The published booking or privacy policy text of one talent.",
    auth: "None.",
    request: ["talent (required): profile UUID", "doc=booking|privacy (optional, default booking)", "locale=es|en (optional)"],
    response: ["200 { model } (cache: public, s-maxage=30)"],
    errors: ["400 bad_request", "503 unavailable"],
  },
  {
    method: "GET",
    path: "/api/llms",
    purpose: "llms.txt for the marketing host or a published talent site (reached through the /llms.txt rewrite).",
    auth: "None.",
    request: ["none"],
    response: ["200 text/plain"],
    errors: ["404 Not found (any other host)"],
  },
  {
    method: "GET",
    path: "/api/health",
    purpose: "Connectivity probe. No database, no auth.",
    auth: "None.",
    request: ["none"],
    response: ["200 { ok: true } (also HEAD)"],
    errors: ["none"],
  },
];

export const DOC_WEBHOOKS: readonly { path: string; direction: string; auth: string; note: string }[] = [
  { path: "/api/webhooks/stripe", direction: "Inbound from Stripe", auth: "Stripe signature (STRIPE_WEBHOOK_SECRET)", note: "Platform-internal receiver. TODO: decide if documented for outside developers." },
  { path: "/api/webhooks/messaging/{channel}", direction: "Inbound, channel whatsapp|sms|email", auth: "HMAC SHA-256 hex in x-messaging-signature", note: "401 bad signature, 404 unknown channel. TODO: confirm audience." },
  { path: "/api/webhooks/resend", direction: "Inbound from Resend (Svix)", auth: "Svix signature", note: "Provider receiver. Not for outside developers." },
  { path: "TODO", direction: "Outbound webhooks to developers", auth: "TODO", note: "No outbound webhook product found in code. Do not document until it exists." },
];

export const DOC_PAGES: readonly DocPage[] = [
  { slug: "overview", title: "Overview", summary: "What the public API is for.", body: ["Read-only public endpoints for booking availability, service catalogs and policies. Which business or talent you read is decided by the host you call.", "TODO: base URLs per environment, versioning policy (none found in code)."] },
  { slug: "auth", title: "Authentication", summary: "How requests are authorised.", body: ["Public endpoints need no credentials. Webhook receivers verify a signature instead.", "TODO: API keys for outside developers (none found in code)."] },
  { slug: "endpoints", title: "Endpoints", summary: "Every documented public endpoint.", body: [] },
  { slug: "webhooks", title: "Webhooks", summary: "Receivers and signatures.", body: [] },
  { slug: "errors", title: "Errors", summary: "Error shape and codes.", body: ["Errors are JSON { error: <code> } with an HTTP status. The MCP endpoint uses JSON-RPC errors.", "TODO: one error catalog across endpoints."] },
  { slug: "rate-limits", title: "Rate limits", summary: "Per-IP limits.", body: ["booking/slots, booking/catalog and booking/mcp: 60 requests per minute per client IP.", "booking/business-catalog: 30 per minute per client IP, its own bucket.", "Limited calls get 429 with a Retry-After header (seconds).", "TODO: limits for talent-policy (none found)."] },
];
