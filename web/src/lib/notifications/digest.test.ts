import { test } from "node:test";
import assert from "node:assert/strict";
import {
  categoryForRow,
  digestHeading,
  digestSummaryLine,
  digestTimeLabel,
  digestWindowMinutes,
  groupDigestRows,
  isBatchReady,
  type DigestRow,
} from "./digest";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function row(over: Partial<DigestRow>): DigestRow {
  return {
    id: over.id ?? "row-1",
    tenant_id: over.tenant_id ?? null,
    recipient_user_id: over.recipient_user_id ?? null,
    recipient_email: over.recipient_email ?? null,
    catalog_entry_id: over.catalog_entry_id ?? null,
    event_kind: over.event_kind ?? "x",
    locale: over.locale ?? "en",
    payload: over.payload ?? {},
    created_at: over.created_at ?? new Date().toISOString(),
  };
}

// ─── Window policy (§7) ─────────────────────────────────────────────────────

test("digestWindowMinutes: messages 30, roster_activity 60, else daily", () => {
  assert.equal(digestWindowMinutes("messages"), 30);
  assert.equal(digestWindowMinutes("roster_activity"), 60);
  assert.equal(digestWindowMinutes("offers"), 24 * 60);
  assert.equal(digestWindowMinutes(null), 24 * 60);
});

// ─── Category resolution ──────────────────────────────────────────────────────

test("categoryForRow: resolves via catalog_entry_id", () => {
  assert.equal(categoryForRow({ catalog_entry_id: "offer.sent.client", payload: {} }), "offers");
  assert.equal(
    categoryForRow({ catalog_entry_id: "inquiry.submitted.talent", payload: {} }),
    "roster_activity",
  );
});

test("categoryForRow: falls back to payload.category, validated", () => {
  assert.equal(categoryForRow({ catalog_entry_id: null, payload: { category: "messages" } }), "messages");
  // Unknown entry id + bogus payload category → null.
  assert.equal(categoryForRow({ catalog_entry_id: "nope.unknown", payload: { category: "garbage" } }), null);
  assert.equal(categoryForRow({ catalog_entry_id: null, payload: {} }), null);
});

// ─── Summary line ─────────────────────────────────────────────────────────────

test("digestSummaryLine: prefers explicit producer fields", () => {
  assert.equal(digestSummaryLine({ payload: { digestSummary: "Giulia replied" } }, "messages"), "Giulia replied");
  assert.equal(digestSummaryLine({ payload: { preview: "New rate submitted" } }, "offers"), "New rate submitted");
});

test("digestSummaryLine: category fallback when no producer field", () => {
  assert.equal(digestSummaryLine({ payload: {} }, "messages"), "You have a new message");
  assert.equal(digestSummaryLine({ payload: {} }, "roster_activity"), "New roster activity");
  assert.equal(digestSummaryLine({ payload: {} }, null), "You have a new notification");
});

test("digestSummaryLine: truncates long summaries", () => {
  const long = "x".repeat(500);
  const out = digestSummaryLine({ payload: { summary: long } }, "messages");
  assert.equal(out.length, 200);
  assert.ok(out.endsWith("…"));
});

// ─── Time label ───────────────────────────────────────────────────────────────

test("digestTimeLabel: HH:MM UTC, null on garbage", () => {
  assert.equal(digestTimeLabel("2026-05-28T14:32:09.000Z"), "14:32 UTC");
  assert.equal(digestTimeLabel("not-a-date"), null);
});

// ─── Grouping ─────────────────────────────────────────────────────────────────

test("groupDigestRows: groups by (recipient, category) and preserves order", () => {
  const rows: DigestRow[] = [
    row({ id: "a", recipient_user_id: "u1", catalog_entry_id: "offer.sent.client", created_at: "2026-05-28T10:00:00Z" }),
    row({ id: "b", recipient_user_id: "u1", catalog_entry_id: "offer.sent.client", created_at: "2026-05-28T10:05:00Z" }),
    row({ id: "c", recipient_user_id: "u1", catalog_entry_id: "inquiry.submitted.talent", created_at: "2026-05-28T10:02:00Z" }),
    row({ id: "d", recipient_user_id: "u2", catalog_entry_id: "offer.sent.client", created_at: "2026-05-28T10:01:00Z" }),
  ];
  const batches = groupDigestRows(rows);
  assert.equal(batches.length, 3); // (u1,offers), (u1,roster_activity), (u2,offers)
  const u1Offers = batches.find((b) => b.key === "u1::offers");
  assert.ok(u1Offers);
  assert.deepEqual(
    u1Offers!.rows.map((r) => r.id),
    ["a", "b"],
  );
});

test("groupDigestRows: guests keyed by email, identity-less rows dropped", () => {
  const rows: DigestRow[] = [
    row({ id: "g", recipient_user_id: null, recipient_email: "Guest@Example.com", catalog_entry_id: "offer.sent.client" }),
    row({ id: "x", recipient_user_id: null, recipient_email: null, catalog_entry_id: "offer.sent.client" }),
  ];
  const batches = groupDigestRows(rows);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].key, "guest:guest@example.com::offers");
  assert.equal(batches[0].email, "Guest@Example.com");
});

// ─── Window readiness ─────────────────────────────────────────────────────────

test("isBatchReady: flushes only once oldest row passes the window", () => {
  const now = new Date("2026-05-28T12:00:00Z");
  const fresh = groupDigestRows([
    row({ recipient_user_id: "u1", catalog_entry_id: "offer.sent.client", created_at: "2026-05-28T11:50:00Z" }),
  ])[0]; // offers → 1440 min window, only 10 min old
  assert.equal(isBatchReady(fresh, now), false);

  const ripeMessages = groupDigestRows([
    row({ recipient_user_id: "u1", payload: { category: "messages" }, created_at: "2026-05-28T11:00:00Z" }),
  ])[0]; // messages → 30 min window, 60 min old
  assert.equal(isBatchReady(ripeMessages, now), true);
});

// ─── Heading copy ─────────────────────────────────────────────────────────────

test("digestHeading: singular/plural per category", () => {
  assert.equal(digestHeading("messages", 1), "You have 1 new message");
  assert.equal(digestHeading("messages", 5), "You have 5 new messages");
  assert.equal(digestHeading("roster_activity", 1), "1 roster update");
  assert.equal(digestHeading(null, 3), "You have 3 new notifications");
});
