/**
 * TUL-45 — Notion mirror payload + sync selection (pure unit tests).
 * Run: npx tsx --test src/lib/support/notion-mirror/payload.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  FORBIDDEN_MIRROR_KEYS,
  NOTION_MIRROR_PROPERTY_NAMES,
  buildNotionMirrorProperties,
  collectPropertyKeys,
  deskLinkForTicket,
  mirrorTitle,
  trimSubject,
} from "./payload";
import {
  isNotionMirrorForceDisabled,
  readNotionMirrorConfig,
} from "./config";
import {
  checkCronBearer,
  mapDbMirrorRow,
  needsNotionMirror,
  pickDueMirrorTickets,
  pushTicketToNotion,
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

test("mirrorTitle uses ticket number and short subject", () => {
  assert.equal(mirrorTitle(7, "Hello"), "#7 · Hello");
  assert.equal(mirrorTitle(7, "   "), "#7");
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
  for (const forbidden of FORBIDDEN_MIRROR_KEYS) {
    assert.equal(
      keys.includes(forbidden),
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
});

test("pushTicketToNotion creates when no page id, updates when present", async () => {
  const calls: Array<{ url: string; method: string; body: string }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? init.body : "";
    calls.push({ url, method, body });
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
  assert.equal(calls[0]?.method, "POST");
  assert.equal(JSON.parse(calls[0].body).parent.database_id, "db");
  // Auth header present but we never assert/log the secret value in failures.
  assert.match(JSON.stringify(calls[0].body), /Ticket number/);

  const updated = await pushTicketToNotion({
    config: { apiKey: "k", databaseId: "db" },
    ticket: { ...SAMPLE, notionPageId: "existing-page", notionSyncedAt: SAMPLE.createdAt },
    fetchImpl,
  });
  assert.equal(updated.ok, true);
  assert.equal(calls[1]?.method, "PATCH");
  assert.match(calls[1].url, /existing-page/);
});
