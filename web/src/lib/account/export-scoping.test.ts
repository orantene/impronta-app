import test from "node:test";
import assert from "node:assert/strict";

import { buildAccountExport, accountExportZip, sectionToCsv } from "./export-bundle";

type Row = Record<string, unknown>;

/**
 * A tiny in-memory database that honours `.eq` and `.in`, so a query that is
 * scoped wrongly returns somebody else's row and the test sees it.
 */
function fakeDb(tables: Record<string, Row[] | "missing">) {
  const admin = {
    from(table: string) {
      return {
        select() {
          const run = (pred: (r: Row) => boolean) => {
            const t = tables[table];
            if (t === "missing") return Promise.resolve({ data: null, error: { code: "42P01", message: "x" } });
            return Promise.resolve({ data: (t ?? []).filter(pred), error: null });
          };
          return {
            eq: (col: string, v: unknown) => run((r) => r[col] === v),
            in: (col: string, vs: unknown[]) => run((r) => vs.includes(r[col])),
          };
        },
      };
    },
    storage: {
      from: () => ({ createSignedUrl: async (p: string) => ({ data: { signedUrl: `https://signed/${p}` } }) }),
    },
  };
  return admin;
}

const ME = "u-me";
const OTHER = "u-other";

const world: Record<string, Row[]> = {
  talent_profiles: [
    { id: "t-me", user_id: ME },
    { id: "t-other", user_id: OTHER },
  ],
  inquiries: [
    { id: "i-mine", client_user_id: ME },
    { id: "i-theirs", client_user_id: OTHER },
  ],
  inquiry_participants: [
    { id: "p1", inquiry_id: "i-joined", user_id: ME, removed_at: null },
    { id: "p2", inquiry_id: "i-removed", user_id: ME, removed_at: "2026-01-01" },
    { id: "p3", inquiry_id: "i-theirs", user_id: OTHER, removed_at: null },
  ],
  inquiry_messages: [
    { id: "m-own", inquiry_id: "i-mine", sender_user_id: ME, thread_type: "private", body: "mine", deleted_at: null },
    { id: "m-group", inquiry_id: "i-mine", sender_user_id: OTHER, thread_type: "group", body: "shared", deleted_at: null },
    { id: "m-private-other", inquiry_id: "i-mine", sender_user_id: OTHER, thread_type: "private", body: "secret", deleted_at: null },
    { id: "m-joined", inquiry_id: "i-joined", sender_user_id: OTHER, thread_type: "group", body: "joined", deleted_at: null },
    { id: "m-removed", inquiry_id: "i-removed", sender_user_id: OTHER, thread_type: "group", body: "left", deleted_at: null },
    { id: "m-foreign", inquiry_id: "i-theirs", sender_user_id: OTHER, thread_type: "group", body: "foreign", deleted_at: null },
  ],
  inquiry_offers: [
    { id: "o-sent", inquiry_id: "i-mine", status: "sent" },
    { id: "o-draft", inquiry_id: "i-mine", status: "draft" },
    { id: "o-foreign", inquiry_id: "i-theirs", status: "sent" },
  ],
  booking_transactions: [
    { id: "b-mine", payer_user_id: ME },
    { id: "b-other", payer_user_id: OTHER },
  ],
  talent_reviews: [
    { id: "r1", client_user_id: ME, talent_profile_id: "t-x", status: "published" },
    { id: "r2", client_user_id: OTHER, talent_profile_id: "t-me", status: "published" },
    { id: "r3", client_user_id: OTHER, talent_profile_id: "t-me", status: "hidden" },
    { id: "r4", client_user_id: OTHER, talent_profile_id: "t-other", status: "published" },
  ],
  client_reviews: [
    { id: "c1", author_user_id: ME, client_user_id: OTHER, status: "published" },
    { id: "c2", author_user_id: OTHER, client_user_id: ME, status: "published" },
    { id: "c3", author_user_id: OTHER, client_user_id: ME, status: "hidden" },
    { id: "c4", author_user_id: OTHER, client_user_id: OTHER, status: "published" },
  ],
  media_assets: [
    { id: "a-mine", owner_talent_profile_id: "t-me", bucket_id: "b", storage_path: "me/1.jpg", deleted_at: null },
    { id: "a-del", owner_talent_profile_id: "t-me", bucket_id: "b", storage_path: "me/2.jpg", deleted_at: "x" },
    { id: "a-other", owner_talent_profile_id: "t-other", bucket_id: "b", storage_path: "o/1.jpg", deleted_at: null },
  ],
  field_values: [
    { id: "f-mine", talent_profile_id: "t-me" },
    { id: "f-other", talent_profile_id: "t-other" },
  ],
  client_profiles: [
    { id: "cp-me", user_id: ME },
    { id: "cp-other", user_id: OTHER },
  ],
  support_tickets: [
    { id: "s-me", requester_user_id: ME },
    { id: "s-other", requester_user_id: OTHER },
  ],
  marketing_subscribers: [
    { id: "n-me", email: "me@example.com" },
    { id: "n-other", email: "other@example.com" },
  ],
  terms_acceptances: "missing" as unknown as Row[],
};

function ids(rows: unknown[] | undefined): string[] {
  return (rows ?? []).map((r) => (r as Row).id as string).sort();
}

test("export contains only the requester's rows, in every section", async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = await buildAccountExport(fakeDb(world) as any, { userId: ME, email: "Me@Example.com" });
  assert.deepEqual(ids(b.data.messages_sent), ["m-own"]);
  // Group messages by others in threads I am in; never private ones, never
  // threads I left, never threads I was never in.
  assert.deepEqual(ids(b.data.messages_in_my_threads), ["m-group", "m-joined"]);
  assert.deepEqual(ids(b.data.offers_received), ["o-sent"]);
  assert.deepEqual(ids(b.data.payments_made), ["b-mine"]);
  assert.deepEqual(ids(b.data.reviews_written_about_talent), ["r1"]);
  assert.deepEqual(ids(b.data.reviews_about_me_as_talent), ["r2"]);
  assert.deepEqual(ids(b.data.reviews_written_about_clients), ["c1"]);
  assert.deepEqual(ids(b.data.reviews_about_me_as_client), ["c2"]);
  assert.deepEqual(ids(b.data.media_assets), ["a-mine"]);
  assert.deepEqual(ids(b.data.profile_field_values), ["f-mine"]);
  assert.deepEqual(ids(b.data.client_profile), ["cp-me"]);
  assert.deepEqual(ids(b.data.support_tickets), ["s-me"]);
  assert.deepEqual(ids(b.data.marketing_subscription), ["n-me"]);
  assert.equal((b.data.media_assets[0] as Row).signed_url, "https://signed/me/1.jpg");
});

test("a missing terms_acceptances table is tolerated and not reported as unavailable", async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = await buildAccountExport(fakeDb(world) as any, { userId: ME, email: null });
  assert.equal(b.unavailable.includes("terms_acceptances"), false);
  assert.equal("terms_acceptances" in b.data, false);
  // No email on the session means the newsletter row is never looked up.
  assert.equal("marketing_subscription" in b.data, false);
});

test("serialised export never mentions another user's id", async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = await buildAccountExport(fakeDb(world) as any, { userId: ME, email: "me@example.com" });
  const text = JSON.stringify(b.data);
  for (const leak of ["m-private-other", "m-foreign", "m-removed", "o-draft", "o-foreign", "b-other", "a-other", "f-other", "s-other", "n-other", "cp-other", "r4", "c3", "c4", "r3"]) {
    assert.equal(text.includes(`"${leak}"`), false, `${leak} leaked`);
  }
});

test("csv zip has one csv per section and neutralises formulas", async () => {
  assert.match(sectionToCsv([{ a: "=SUM(1)", b: 'x,"y"' }]), /'=SUM\(1\)/);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = await buildAccountExport(fakeDb(world) as any, { userId: ME, email: null });
  const zip = await accountExportZip(b);
  const { default: JSZip } = await import("jszip");
  const loaded = await JSZip.loadAsync(zip);
  assert.ok(loaded.file("messages_sent.csv"));
  assert.ok(loaded.file("README.txt"));
});
