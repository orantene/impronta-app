/**
 * TUL-45 — Notion mirror payload + sync selection (pure unit tests).
 * Run: npx tsx --test src/lib/support/notion-mirror/payload.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  FORBIDDEN_MIRROR_KEYS,
  NOTION_MIRROR_PROPERTY_NAMES,
  allowListedStatus,
  buildNotionMirrorProperties,
  collectPropertyKeys,
  deskLinkForTicket,
  mirrorTitle,
  redactSubjectPii,
  trimSubject,
} from "./payload";
import {
  isNotionMirrorForceDisabled,
  readNotionMirrorConfig,
} from "./config";
import {
  NOTION_MIRROR_ELAPSED_BUDGET_MS,
  checkCronBearer,
  mapDbMirrorRow,
  needsNotionMirror,
  pickDueMirrorTickets,
  pushTicketToNotion,
  shouldStopForElapsedBudget,
} from "./sync";

const SAMPLE = {
  id: "11111111-1111-1111-1111-111111111111",
  ticketNumber: 42,
  subject: "  Booking calendar stuck on mobile  ",
  status: "open",
  category: "billing",
  createdAt: "2026-10-01T12:00:00.000Z",
  updatedAt: "2026-10-02T15:30:00.000Z",
};

test("trimSubject collapses whitespace and caps length", () => {
  assert.equal(trimSubject("  hello   world  "), "hello world");
  const long = "x".repeat(120);
  const trimmed = trimSubject(long, 80);
  assert.ok(trimmed.length <= 80);
  assert.ok(trimmed.endsWith("…"));
});

test("redactSubjectPii strips emails and phones", () => {
  assert.equal(
    redactSubjectPii("Help me at jane@example.com please"),
    "Help me at [redacted-email] please",
  );
  assert.match(redactSubjectPii("Call +1 (555) 123-4567 now"), /\[redacted-phone\]/);
});

test("allowListedStatus falls back to open", () => {
  assert.equal(allowListedStatus("resolved"), "resolved");
  assert.equal(allowListedStatus("weird"), "open");
});

test("mirrorTitle uses ticket number and short subject", () => {
  assert.equal(mirrorTitle(7, "Hello"), "#7 · Hello");
  assert.equal(mirrorTitle(7, "   "), "#7");
  assert.match(mirrorTitle(7, "x user@tulala.digital y"), /\[redacted-email\]/);
});

test("deskLinkForTicket points at Support Desk host with uuid", () => {
  assert.equal(
    deskLinkForTicket(SAMPLE.id),
    `https://support.tulala.digital/desk?ticket=${SAMPLE.id}`,
  );
});

test("buildNotionMirrorProperties only emits allow-listed keys", () => {
  const props = buildNotionMirrorProperties(SAMPLE);
  const keys = collectPropertyKeys(props).sort();
  assert.deepEqual(keys, [...NOTION_MIRROR_PROPERTY_NAMES].sort());
  // Cast: keys is allow-list-shaped at runtime; forbidden keys are a disjoint
  // string union, so a typed `===` is TS2367. Compare as plain strings.
  const keyStrings: string[] = keys;
  for (const forbidden of FORBIDDEN_MIRROR_KEYS) {
    assert.equal(
      keyStrings.includes(forbidden),
      false,
      `must not include ${forbidden}`,
    );
  }
  const json = JSON.stringify(props);
  for (const forbidden of [
    "contact_email",
    "contactEmail",
    "last_message_preview",
    "requester_user_id",
  ]) {
    assert.equal(json.includes(forbidden), false, `payload JSON must not contain ${forbidden}`);
  }
  assert.equal(props["Ticket number"].number, 42);
  assert.equal(props.Status.select.name, "open");
  assert.equal(props.Category.rich_text[0]?.text.content, "billing");
  assert.equal(props.Created.date.start, SAMPLE.createdAt);
  assert.equal(props.Updated.date.start, SAMPLE.updatedAt);
  assert.match(props.Ticket.title[0].text.content, /^#42 ·/);
});

test("needsNotionMirror: new, never-synced, or stale", () => {
  assert.equal(
    needsNotionMirror({
      notionPageId: null,
      notionSyncedAt: null,
      updatedAt: "2026-10-02T00:00:00.000Z",
    }),
    true,
  );
  assert.equal(
    needsNotionMirror({
      notionPageId: "abc",
      notionSyncedAt: null,
      updatedAt: "2026-10-02T00:00:00.000Z",
    }),
    true,
  );
  assert.equal(
    needsNotionMirror({
      notionPageId: "abc",
      notionSyncedAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-02T00:00:00.000Z",
    }),
    true,
  );
  assert.equal(
    needsNotionMirror({
      notionPageId: "abc",
      notionSyncedAt: "2026-10-03T00:00:00.000Z",
      updatedAt: "2026-10-02T00:00:00.000Z",
    }),
    false,
  );
  // Equal timestamps must not re-queue (writeback sets synced_at >= updated_at).
  assert.equal(
    needsNotionMirror({
      notionPageId: "abc",
      notionSyncedAt: "2026-10-02T00:00:00.000Z",
      updatedAt: "2026-10-02T00:00:00.000Z",
    }),
    false,
  );
});

test("pickDueMirrorTickets caps batch", () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({
    ...SAMPLE,
    id: `id-${i}`,
    ticketNumber: i + 1,
    notionPageId: null as string | null,
    notionSyncedAt: null as string | null,
  }));
  assert.equal(pickDueMirrorTickets(rows, 3).length, 3);
});

test("mapDbMirrorRow maps snake_case columns", () => {
  const row = mapDbMirrorRow({
    id: SAMPLE.id,
    ticket_number: 9,
    subject: "Hi",
    status: "resolved",
    category: null,
    created_at: SAMPLE.createdAt,
    updated_at: SAMPLE.updatedAt,
    notion_page_id: "page-1",
    notion_synced_at: SAMPLE.createdAt,
  });
  assert.ok(row);
  assert.equal(row.ticketNumber, 9);
  assert.equal(row.notionPageId, "page-1");
  assert.equal(row.category, null);
});

test("readNotionMirrorConfig reports missing env without exposing values", () => {
  const empty = readNotionMirrorConfig({});
  assert.equal(empty.configured, false);
  assert.deepEqual(empty.missing, ["NOTION_API_KEY", "NOTION_SUPPORT_DATABASE_ID"]);

  const ok = readNotionMirrorConfig({
    NOTION_API_KEY: " secret ",
    NOTION_SUPPORT_DATABASE_ID: " db-id ",
  });
  assert.equal(ok.configured, true);
  assert.equal(ok.config?.apiKey, "secret");
  assert.equal(ok.config?.databaseId, "db-id");
});

test("isNotionMirrorForceDisabled respects off flags", () => {
  assert.equal(isNotionMirrorForceDisabled({ NOTION_MIRROR_ENABLED: "0" }), true);
  assert.equal(isNotionMirrorForceDisabled({ NOTION_MIRROR_ENABLED: "false" }), true);
  assert.equal(isNotionMirrorForceDisabled({}), false);
  assert.equal(isNotionMirrorForceDisabled({ NOTION_MIRROR_ENABLED: "1" }), false);
});

test("checkCronBearer requires Bearer prefix and matching secret", () => {
  assert.equal(checkCronBearer(null, "s").authorized, false);
  assert.equal(checkCronBearer("s", "s").authorized, false);
  assert.equal(checkCronBearer("Bearer wrong", "s").authorized, false);
  assert.equal(checkCronBearer("Bearer s", "s").authorized, true);
  assert.equal(checkCronBearer("bearer s", "s").authorized, true);
  // Length mismatch must not throw (timingSafeEqual requirement).
  assert.equal(checkCronBearer("Bearer longer-secret", "s").authorized, false);
});

test("shouldStopForElapsedBudget enforces the ~45s cron wall", () => {
  assert.equal(NOTION_MIRROR_ELAPSED_BUDGET_MS, 45_000);
  const start = 1_000_000;
  assert.equal(shouldStopForElapsedBudget(start, start + 44_999), false);
  assert.equal(shouldStopForElapsedBudget(start, start + 45_000), true);
  assert.equal(shouldStopForElapsedBudget(start, start + 60_000), true);
});

test("pushTicketToNotion creates when no page id, updates when present", async () => {
  const calls: Array<{ url: string; method: string; body: string }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? init.body : "";
    calls.push({ url, method, body });
    if (url.includes("/databases/") && url.endsWith("/query")) {
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    }
    if (method === "POST") {
      return new Response(JSON.stringify({ id: "new-page" }), { status: 200 });
    }
    return new Response(JSON.stringify({ id: "existing-page" }), { status: 200 });
  };

  const created = await pushTicketToNotion({
    config: { apiKey: "k", databaseId: "db" },
    ticket: { ...SAMPLE, notionPageId: null, notionSyncedAt: null },
    fetchImpl,
  });
  assert.equal(created.ok, true);
  if (created.ok) assert.equal(created.pageId, "new-page");
  // Two queries (desk link + ticket number) then create.
  assert.equal(calls.filter((c) => c.url.includes("/query")).length, 2);
  const createCall = calls.find((c) => c.method === "POST" && c.url.endsWith("/pages"));
  assert.ok(createCall);
  assert.equal(JSON.parse(createCall.body).parent.database_id, "db");
  assert.match(JSON.stringify(createCall.body), /Ticket number/);

  const updated = await pushTicketToNotion({
    config: { apiKey: "k", databaseId: "db" },
    ticket: { ...SAMPLE, notionPageId: "existing-page", notionSyncedAt: SAMPLE.createdAt },
    fetchImpl,
  });
  assert.equal(updated.ok, true);
  const patch = calls.find((c) => c.method === "PATCH");
  assert.ok(patch);
  assert.match(patch.url, /existing-page/);
});

test("pushTicketToNotion reuses existing Notion page (idempotent create)", async () => {
  const calls: Array<{ url: string; method: string }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    if (url.includes("/query")) {
      return new Response(
        JSON.stringify({ results: [{ id: "orphan-page" }] }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ id: "orphan-page" }), { status: 200 });
  };

  const result = await pushTicketToNotion({
    config: { apiKey: "k", databaseId: "db" },
    ticket: { ...SAMPLE, notionPageId: null, notionSyncedAt: null },
    fetchImpl,
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.pageId, "orphan-page");
  assert.equal(calls.some((c) => c.method === "PATCH"), true);
  assert.equal(
    calls.some((c) => c.method === "POST" && c.url.endsWith("/pages")),
    false,
    "must not POST a second page when Desk link already matches",
  );
});

test("pushTicketToNotion surfaces 429 Retry-After without continuing create", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ message: "rate limited" }), {
      status: 429,
      headers: { "Retry-After": "7" },
    });

  const result = await pushTicketToNotion({
    config: { apiKey: "k", databaseId: "db" },
    ticket: { ...SAMPLE, notionPageId: null, notionSyncedAt: null },
    fetchImpl,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 429);
    assert.equal(result.retryAfterSec, 7);
  }
});
