import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { clientNoticeKey, noticeMessageRow, personChangedBody, sendPersonChangedNotice, stateDrift } from "./replace-client-notice.server";
import { replaceTalentOnProject, type ReplaceDeps } from "./replace-with-notice.server";

type Row = Record<string, unknown>;

function fakeAdmin(tables: Record<string, Row[]>, failTable?: string) {
  const from = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    const rows = () =>
      (tables[table] ?? []).filter((r) =>
        filters.every(([k, v]) => (k === "metadata->>notice_key" ? (r.metadata as Row | undefined)?.notice_key === v : r[k] === v)),
      );
    const err = table === failTable ? { code: "57014", message: "x" } : null;
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
      limit: () => q,
      maybeSingle: async () => ({ data: err ? null : rows()[0] ?? null, error: err }),
      then: (resolve: (v: { data: Row[]; error: unknown }) => unknown) => resolve({ data: err ? [] : rows(), error: err }),
    };
    return q;
  };
  return { from } as unknown as SupabaseClient;
}

const T = "t1"; const B = "b1"; const I = "inq1"; const KEY = "replace-12345678";
function world(preferred: string | null = "es") {
  return {
    agency_bookings: [{ id: B, tenant_id: T, source_inquiry_id: I as string | null, title: "Boda Ana" }],
    inquiries: [{ id: I, tenant_id: T, client_user_id: "c1" }],
    client_profiles: [{ user_id: "c1", preferred_locale: preferred }],
    inquiry_messages: [] as Row[],
  };
}
const posting = (tables: ReturnType<typeof world>) => async (_a: SupabaseClient, args: { inquiryId: string; body: string; key: string }) => {
  tables.inquiry_messages.push({ inquiry_id: args.inquiryId, body: args.body, metadata: { notice_key: args.key } });
};
const input = { tenantId: T, bookingId: B, operationKey: KEY, eventTitle: "Boda Ana" };

test("the body is ES or EN by locale, names the event only, no price/contact/person, no em dash", () => {
  const es = personChangedBody("es", "Boda Ana");
  const en = personChangedBody("en", "Boda Ana");
  assert.match(es, /persona asignada cambió/);
  assert.match(en, /person assigned has changed/);
  for (const t of [es, en, personChangedBody(null, "")]) {
    assert.ok(!t.includes("—"));
    assert.ok(!/[$€@]|\d{3}/.test(t));
  }
});

test("sends one note in the client's language, and a retry with the same operation key sends nothing", async () => {
  const w = world("es");
  const a = await sendPersonChangedNotice(fakeAdmin(w), input, { post: posting(w) });
  assert.deepEqual(a, { sent: true, already: false });
  assert.equal(w.inquiry_messages.length, 1);
  assert.match(String(w.inquiry_messages[0].body), /persona asignada/);
  assert.equal((w.inquiry_messages[0].metadata as Row).notice_key, clientNoticeKey(input));
  const b = await sendPersonChangedNotice(fakeAdmin(w), input, { post: posting(w) });
  assert.deepEqual(b, { sent: true, already: true });
  assert.equal(w.inquiry_messages.length, 1);
  await sendPersonChangedNotice(fakeAdmin(w), { ...input, operationKey: "replace-99999999" }, { post: posting(w) });
  assert.equal(w.inquiry_messages.length, 2);
});

test("English client gets English", async () => {
  const w = world("en");
  await sendPersonChangedNotice(fakeAdmin(w), input, { post: posting(w) });
  assert.match(String(w.inquiry_messages[0].body), /person assigned has changed/);
});

test("no inquiry behind the booking: nothing is sent", async () => {
  const w = world();
  w.agency_bookings[0].source_inquiry_id = null;
  assert.deepEqual(await sendPersonChangedNotice(fakeAdmin(w), input, { post: posting(w) }), { sent: false, reason: "no_inquiry" });
  assert.equal(w.inquiry_messages.length, 0);
});

test("a write that silently fails, or a throwing writer, reports not sent and never throws", async () => {
  const w = world();
  assert.deepEqual(await sendPersonChangedNotice(fakeAdmin(w), input, { post: async () => {} }), { sent: false, reason: "failed" });
  assert.deepEqual(
    await sendPersonChangedNotice(fakeAdmin(w), input, { post: async () => { throw new Error("boom"); } }),
    { sent: false, reason: "failed" },
  );
  assert.deepEqual(await sendPersonChangedNotice(fakeAdmin(w, "inquiry_messages"), input, { post: posting(w) }), { sent: false, reason: "failed" });
});

const FROM = "p-from"; const TO = "p-to";
const replaceTables = (showWho: string): Record<string, Row[]> => ({
  workspace_service_listings: [{ tenant_id: T, talent_profile_id: FROM, status: "accepted", show_who: showWho }],
  agency_bookings: [{ id: B, tenant_id: T, title: "Boda Ana", starts_at: null, timezone: "UTC", currency_code: "USD" }],
  booking_talent: [{ id: "seat1", booking_id: B, tenant_id: T, talent_profile_id: TO, role_label: "Waiter", talent_cost_total: 150, units: 1 }],
});
const rin = { tenantId: T, bookingId: B, fromTalentId: FROM, toTalentId: TO, operationKey: KEY };
const base = (over: Partial<ReplaceDeps> = {}): ReplaceDeps => ({ replace: async () => ({ ok: true, bookingId: B }), notify: async () => true, ...over });

test("replace: the client is messaged only for person_changed; a failed send never undoes the swap", async () => {
  const calls: unknown[] = [];
  const send = async (i: unknown) => { calls.push(i); return { sent: true as const, already: false }; };
  const ok = await replaceTalentOnProject(fakeAdmin(replaceTables("name")), rin, base({ sendClientNotice: send }));
  assert.ok(ok.ok && ok.clientNotice === "person_changed" && ok.clientNoticeSent === true);
  assert.equal(calls.length, 1);
  assert.equal((calls[0] as { eventTitle: string }).eventTitle, "Boda Ana");

  const quiet = await replaceTalentOnProject(fakeAdmin(replaceTables("hidden")), rin, base({ sendClientNotice: send }));
  assert.ok(quiet.ok && quiet.clientNotice === "none" && quiet.clientNoticeSent === false);
  assert.equal(calls.length, 1);

  const failed = await replaceTalentOnProject(fakeAdmin(replaceTables("name")), rin, base({ sendClientNotice: async () => { throw new Error("boom"); } }));
  assert.ok(failed.ok && failed.clientNotice === "person_changed" && failed.clientNoticeSent === false);
  const refused = await replaceTalentOnProject(fakeAdmin(replaceTables("name")), rin, base({ sendClientNotice: async () => ({ sent: false, reason: "failed" }) }));
  assert.ok(refused.ok && refused.clientNoticeSent === false);
});

test("TUL-1606: the note is a system line with no author, not a client message", () => {
  const row = noticeMessageRow({ inquiryId: "i1", body: "x", key: "k" });
  assert.equal(row.sender_user_id, null);
  assert.equal(row.guest_session_id, null);
  assert.equal(row.message_kind, "system_event");
  assert.equal((row.metadata as Row).system_event_type, "roster_talent_swapped");
  assert.equal((row.metadata as Row).notice_key, "k");
});

test("TUL-1606: stateDrift names exactly what a write moved, so the note can be undone to 'nobody's turn'", () => {
  const before = { conversation_state: "awaiting_customer", last_customer_message_at: null, last_staff_message_at: "t1" };
  assert.deepEqual(stateDrift(before, before), {});
  assert.deepEqual(
    stateDrift(before, { conversation_state: "needs_reply", last_customer_message_at: "t2", last_staff_message_at: "t1" }),
    { conversation_state: "awaiting_customer", last_customer_message_at: null },
  );
});
