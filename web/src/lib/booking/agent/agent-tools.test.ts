import assert from "node:assert/strict";
import { test } from "node:test";

import { signTalentOfferingIntent, verifyTalentOfferingIntent } from "@/lib/messaging/talent-offering-intent";
import type { TalentOffering } from "@/lib/talent/offerings-types";

import { toAgentServices } from "./catalog";
import {
  AGENT_HANDOFF_TTL_MS,
  AGENT_SLOTS_MAX,
  agentBookingRefusal,
  agentCatalogScope,
  agentHandoffUrl,
  agentOpenTimesView,
} from "./handoff";
import { buildTalentLlmsTxt } from "./llms-txt";
import { type AgentToolDeps, agentToolDefinitions, handleMcpMessage, parseMcpBody } from "./mcp";

const SERVICE_ID = "11111111-1111-4111-8111-111111111111";

function deps(overrides: Partial<AgentToolDeps> = {}): AgentToolDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    talentName: "Jorgelina",
    listServices: async () => {
      calls.push("list");
      return { ok: true, data: { services: [] } };
    },
    findOpenTimes: async (args) => {
      calls.push(`find:${args.service_id}:${args.days ?? ""}`);
      return { ok: true, data: { slots: [] } };
    },
    requestBooking: async (args) => {
      calls.push(`request:${args.service_id}:${args.starts_at ?? ""}`);
      return { ok: true, data: { confirm_url: "https://x/?service=t" } };
    },
    ...overrides,
  };
}

const rpc = (method: string, params?: unknown) => ({
  jsonrpc: "2.0",
  id: 1,
  method,
  ...(params === undefined ? {} : { params }),
});

test("initialize answers with tools capability and the requested known protocol", async () => {
  const res = await handleMcpMessage(rpc("initialize", { protocolVersion: "2025-03-26" }), deps());
  assert.ok(res && "result" in res);
  const r = res.result as { protocolVersion: string; capabilities: { tools: unknown }; serverInfo: { name: string } };
  assert.equal(r.protocolVersion, "2025-03-26");
  assert.ok(r.capabilities.tools);
  assert.equal(r.serverInfo.name, "tulala-booking");

  const unknown = await handleMcpMessage(rpc("initialize", { protocolVersion: "1999-01-01" }), deps());
  assert.equal((unknown as { result: { protocolVersion: string } }).result.protocolVersion, "2025-06-18");
});

test("a notification gets no reply; a bad envelope is an Invalid Request", async () => {
  assert.equal(await handleMcpMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, deps()), null);
  const bad = await handleMcpMessage([rpc("ping")], deps());
  assert.ok(bad && "error" in bad && bad.error.code === -32600);
  const parsed = parseMcpBody("{nope");
  assert.equal(parsed.ok, false);
});

test("tools/list: three tools with JSON-schema inputs; ids required, extras rejected", async () => {
  const res = await handleMcpMessage(rpc("tools/list"), deps());
  const tools = (res as { result: { tools: ReturnType<typeof agentToolDefinitions> } }).result.tools;
  assert.deepEqual(
    tools.map((t) => t.name),
    ["list_services", "find_open_times", "request_booking"],
  );
  for (const t of tools) {
    assert.equal(t.inputSchema.type, "object");
    assert.equal(t.inputSchema.$schema, undefined);
    assert.equal(t.inputSchema.additionalProperties, false);
  }
  const find = tools.find((t) => t.name === "find_open_times")!;
  assert.deepEqual(find.inputSchema.required, ["service_id"]);
  const request = tools.find((t) => t.name === "request_booking")!;
  assert.deepEqual(request.inputSchema.required, ["service_id"]);
  assert.match(request.description, /Nothing is booked until/);
});

test("tools/call routes valid arguments and refuses bad ones without calling the loader", async () => {
  const d = deps();
  const ok = await handleMcpMessage(
    rpc("tools/call", { name: "find_open_times", arguments: { service_id: SERVICE_ID, days: 3 } }),
    d,
  );
  const okResult = (ok as { result: { isError?: boolean; content: { text: string }[] } }).result;
  assert.equal(okResult.isError, undefined);
  assert.deepEqual(JSON.parse(okResult.content[0]!.text), { slots: [] });
  assert.deepEqual(d.calls, [`find:${SERVICE_ID}:3`]);

  const bad = await handleMcpMessage(
    rpc("tools/call", { name: "request_booking", arguments: { service_id: "not-a-uuid", email: "x@y.z" } }),
    d,
  );
  assert.equal((bad as { result: { isError?: boolean } }).result.isError, true);
  assert.deepEqual(d.calls, [`find:${SERVICE_ID}:3`]);

  const unknown = await handleMcpMessage(rpc("tools/call", { name: "book_now", arguments: {} }), d);
  assert.ok(unknown && "error" in unknown && unknown.error.code === -32602);
});

test("a tool-level refusal comes back as isError with the code", async () => {
  const d = deps({
    requestBooking: async () => ({ ok: false, error: "agent_booking_off", message: "off" }),
  });
  const res = await handleMcpMessage(
    rpc("tools/call", { name: "request_booking", arguments: { service_id: SERVICE_ID } }),
    d,
  );
  const r = (res as { result: { isError?: boolean; structuredContent: { error: string } } }).result;
  assert.equal(r.isError, true);
  assert.equal(r.structuredContent.error, "agent_booking_off");
});

test("paused or opted-out talent: request_booking refuses", () => {
  const on = { serviceBookable: true, agentBookingEnabled: true, acceptingBookings: true };
  assert.equal(agentBookingRefusal(on), null);
  assert.equal(agentBookingRefusal({ ...on, agentBookingEnabled: false }), "agent_booking_off");
  assert.equal(agentBookingRefusal({ ...on, acceptingBookings: false }), "not_accepting_bookings");
  assert.equal(agentBookingRefusal({ ...on, serviceBookable: false }), "not_bookable");
});

test("an agency host ignores the talent's own pause, like its open times", () => {
  const paused = { serviceBookable: true, agentBookingEnabled: true, acceptingBookings: false };
  assert.equal(agentBookingRefusal({ ...paused, agencyHost: true }), null);
  assert.equal(agentBookingRefusal({ ...paused, agencyHost: false }), "not_accepting_bookings");
  assert.equal(agentBookingRefusal({ ...paused, agentBookingEnabled: false, agencyHost: true }), "agent_booking_off");
});

test("services come only from the tenant the hand-off chat lands in", () => {
  assert.deepEqual(agentCatalogScope("agency", "t-agency"), { tenantId: "t-agency", channel: "agency" });
  assert.deepEqual(agentCatalogScope("talent_site", "t-hub"), { tenantId: "t-hub", channel: "direct" });
  assert.deepEqual(agentCatalogScope("app", "t-hub"), { tenantId: "t-hub", channel: "direct" });
  assert.equal(agentCatalogScope("talent_site", null), null);
  assert.equal(agentCatalogScope("marketing", null), null);
});

test("hand-off link carries the signed choice; tampered and expired tokens fail", () => {
  const prev = process.env.GUEST_COOKIE_SECRET;
  process.env.GUEST_COOKIE_SECRET = "test-secret-tul-21";
  try {
    const now = Date.parse("2026-10-10T12:00:00.000Z");
    const token = signTalentOfferingIntent(
      { profileId: "22222222-2222-4222-8222-222222222222", offeringId: SERVICE_ID, intent: "reserve" },
      now,
    );
    assert.ok(token);
    const url = new URL(agentHandoffUrl("https://jorg.example/", "/", token));
    assert.equal(url.pathname, "/");
    assert.equal(url.searchParams.get("service"), token);
    assert.equal(new URL(agentHandoffUrl("http://localhost:3000", "/t/TAL-1", token)).pathname, "/t/TAL-1");

    const fresh = verifyTalentOfferingIntent(token, now + AGENT_HANDOFF_TTL_MS - 1000);
    assert.equal(fresh.ok, true);
    assert.equal(fresh.ok && fresh.payload.offering, SERVICE_ID);
    assert.equal(fresh.ok && fresh.payload.intent, "reserve");

    const expired = verifyTalentOfferingIntent(token, now + AGENT_HANDOFF_TTL_MS + 1000);
    assert.deepEqual(expired, { ok: false, reason: "expired" });

    const [v, body, sig] = token.split(".");
    const tamperedBody = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body!, "base64url").toString("utf8")), offering: "x" }),
    ).toString("base64url");
    assert.deepEqual(verifyTalentOfferingIntent(`${v}.${tamperedBody}.${sig}`, now), {
      ok: false,
      reason: "bad_signature",
    });
  } finally {
    if (prev === undefined) delete process.env.GUEST_COOKIE_SECRET;
    else process.env.GUEST_COOKIE_SECRET = prev;
  }
});

test("open-times view: capped list, local labels, reason only when empty", () => {
  const slots = Array.from({ length: AGENT_SLOTS_MAX + 5 }, (_, i) =>
    new Date(Date.parse("2026-10-12T15:00:00.000Z") + i * 3600_000).toISOString(),
  );
  const full = agentOpenTimesView(
    { ok: true, slots, timezone: "America/Mexico_City", reason: null, mode: "instant" },
    "es",
  );
  assert.equal(full.slots.length, AGENT_SLOTS_MAX);
  assert.equal(full.more, true);
  assert.equal(full.mode, "instant");
  assert.equal(full.reason, null);
  assert.match(full.slots[0]!.local ?? "", /09:00/);

  const empty = agentOpenTimesView({ ok: true, slots: [], reason: "not_accepting_bookings" }, "en");
  assert.deepEqual(empty.slots, []);
  assert.equal(empty.reason, "not_accepting_bookings");
});

function offering(partial: Partial<TalentOffering>): TalentOffering {
  return {
    id: SERVICE_ID,
    title: "Gel manicure",
    description: "  Long\n description  ",
    kind: "service",
    visibility: "public",
    priceType: "flat_package",
    priceDisplay: "exact",
    amountCents: 55000,
    currency: "MXN",
    durationMinutes: 60,
    ...partial,
  } as TalentOffering;
}

test("catalog: public non-product services only, storefront price label, bookable flag", () => {
  const services = toAgentServices(
    [
      offering({}),
      offering({ id: "p", kind: "product" }),
      offering({ id: "r", visibility: "on_request" }),
      offering({ id: "h", publicCtaHidden: true }),
    ],
    "en",
  );
  assert.deepEqual(
    services.map((s) => s.id),
    [SERVICE_ID, "h"],
  );
  assert.equal(services[0]!.description, "Long description");
  assert.equal(services[0]!.duration_minutes, 60);
  assert.match(services[0]!.price, /550/);
  assert.equal(services[0]!.bookable, true);
  assert.equal(services[1]!.bookable, false);
});

test("llms.txt names the services and the three endpoints; says when booking is off", () => {
  const services = toAgentServices([offering({})], "en");
  const on = buildTalentLlmsTxt({ origin: "https://jorg.example", name: "Jorgelina", services, agentBookingEnabled: true });
  assert.match(on, /^# Jorgelina\n/);
  assert.ok(on.includes(`service_id: ${SERVICE_ID}`));
  assert.ok(on.includes("https://jorg.example/api/public/booking/catalog"));
  assert.ok(on.includes("https://jorg.example/api/public/booking/slots?offering=<service_id>"));
  assert.ok(on.includes("https://jorg.example/api/public/booking/mcp"));
  assert.match(on, /does not book anything/);

  const off = buildTalentLlmsTxt({ origin: "https://jorg.example", name: "Jorgelina", services: [], agentBookingEnabled: false });
  assert.match(off, /No public services/);
  assert.match(off, /has not turned on booking through AI assistants/);
});
