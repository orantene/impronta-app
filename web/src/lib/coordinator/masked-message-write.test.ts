import assert from "node:assert/strict";
import test from "node:test";

import { CONTACT_MASKING_FLAG } from "./contact-masking";
import { insertInquiryMessage, maskEditedBody } from "./masked-message-write.server";

type Tbl = Record<string, { data?: unknown[]; error?: { code?: string; message: string } | null }>;

function fakeClient(opts: { insertError?: boolean } = {}) {
  const inserted: Array<Record<string, unknown>> = [];
  const client = {
    from: (table: string) => {
      assert.equal(table, "inquiry_messages");
      return {
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              if (opts.insertError) return { data: null, error: { message: "insert failed" } };
              inserted.push(row);
              return { data: { id: row.id ?? "generated" }, error: null };
            },
          }),
        }),
      };
    },
  };
  return { client: client as never, inserted };
}

function fakeAdmin(rows: Tbl, originalsError = false) {
  const originals: Array<Record<string, unknown>> = [];
  const deleted: Array<unknown> = [];
  const admin = {
    from: (table: string) => {
      if (table === "inquiry_message_originals") {
        return {
          insert: async (row: Record<string, unknown>) => {
            if (originalsError) return { error: { message: "no space" } };
            originals.push(row);
            return { error: null };
          },
          delete: () => ({ eq: () => ({ eq: async (...a: unknown[]) => { deleted.push(a); return { error: null }; } }) }),
        };
      }
      const b: Record<string, unknown> = {};
      const chain = () => b;
      b.select = chain; b.eq = chain; b.neq = chain; b.in = chain; b.limit = chain;
      b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows[table]?.data ?? [], error: rows[table]?.error ?? null }).then(ok);
      return b;
    },
  };
  return { admin: admin as never, originals, deleted };
}

const maskingTerms: Tbl = {
  inquiry_participants: { data: [{ talent_profile_id: "p1" }] },
  workspace_talent_terms: { data: [{ talent_profile_id: "p1", version: 1, show_contact: false, client_contact: "workspace" }] },
};
const row = { inquiry_id: "i", tenant_id: "t", thread_type: "private", body: "call me 984 123 4567", sender_user_id: "u" };

async function withFlag<T>(v: string | undefined, run: () => Promise<T>) {
  const prev = process.env[CONTACT_MASKING_FLAG];
  if (v === undefined) delete process.env[CONTACT_MASKING_FLAG];
  else process.env[CONTACT_MASKING_FLAG] = v;
  try {
    return await run();
  } finally {
    if (prev === undefined) delete process.env[CONTACT_MASKING_FLAG];
    else process.env[CONTACT_MASKING_FLAG] = prev;
  }
}

test("flag off: a plain insert of the typed text, no service client, no original", async () => {
  const c = fakeClient();
  const r = await withFlag(undefined, () => insertInquiryMessage(c.client, row, {}, { admin: null }));
  assert.equal(r.error, null);
  assert.equal(c.inserted[0].body, "call me 984 123 4567");
  assert.equal(r.storedBody, "call me 984 123 4567");
  assert.equal(r.maskedCount, 0);
});

test("masking active: the stored body is masked, the ORIGINAL is kept, written first, with the same message id", async () => {
  const c = fakeClient();
  const a = fakeAdmin(maskingTerms);
  const r = await withFlag("true", () => insertInquiryMessage(c.client, row, {}, { admin: a.admin, newId: () => "msg-1" }));
  assert.equal(r.error, null);
  assert.equal(c.inserted[0].body, "call me [phone hidden]");
  assert.equal(c.inserted[0].id, "msg-1");
  assert.deepEqual(c.inserted[0].metadata, { contact_masked: 1 });
  assert.deepEqual(a.originals, [{ message_id: "msg-1", inquiry_id: "i", tenant_id: "t", kind: "insert", original_body: "call me 984 123 4567", masked_count: 1 }]);
  assert.equal(r.storedBody, "call me [phone hidden]");
});

test("if the original cannot be saved the message is NOT sent", async () => {
  const c = fakeClient();
  const a = fakeAdmin(maskingTerms, true);
  const r = await withFlag("true", () => insertInquiryMessage(c.client, row, {}, { admin: a.admin }));
  assert.equal(r.error?.message, "original_not_saved");
  assert.equal(c.inserted.length, 0);
});

test("if the message insert fails the saved original is removed again", async () => {
  const c = fakeClient({ insertError: true });
  const a = fakeAdmin(maskingTerms);
  const r = await withFlag("true", () => insertInquiryMessage(c.client, row, {}, { admin: a.admin, newId: () => "msg-2" }));
  assert.ok(r.error);
  assert.equal(a.deleted.length, 1);
});

test("nothing to hide, a staff group thread, or no terms: plain insert and no original", async () => {
  for (const [r0, tables] of [
    [{ ...row, body: "see you at 15:30" }, maskingTerms],
    [{ ...row, thread_type: "group" }, maskingTerms],
    [row, { inquiry_participants: { data: [{ talent_profile_id: "p1" }] }, workspace_talent_terms: { data: [] } } as Tbl],
  ] as const) {
    const c = fakeClient();
    const a = fakeAdmin(tables as Tbl);
    const r = await withFlag("true", () => insertInquiryMessage(c.client, r0, {}, { admin: a.admin }));
    assert.equal(r.error, null);
    assert.equal(a.originals.length, 0);
    assert.equal(c.inserted[0].body, r0.body);
  }
});

test("masking on without a service client fails closed (the message is not sent)", async () => {
  const c = fakeClient();
  const r = await withFlag("true", () => insertInquiryMessage(c.client, row, {}, { admin: null }));
  assert.equal(r.error?.message, "masking_unavailable");
  assert.equal(c.inserted.length, 0);
});

test("an edit of a client-chat message is masked and its original kept; a failed save refuses the edit", async () => {
  const a = fakeAdmin(maskingTerms);
  const body = await withFlag("true", () => maskEditedBody({ messageId: "m", inquiryId: "i", tenantId: "t", threadType: "private", body: "mail ana@x.com" }, { admin: a.admin }));
  assert.equal(body, "mail [email hidden]");
  assert.equal(a.originals[0].kind, "edit");
  const failing = fakeAdmin(maskingTerms, true);
  assert.equal(await withFlag("true", () => maskEditedBody({ messageId: "m", inquiryId: "i", tenantId: "t", threadType: "private", body: "mail ana@x.com" }, { admin: failing.admin })), null);
  assert.equal(await withFlag(undefined, () => maskEditedBody({ messageId: "m", inquiryId: "i", tenantId: "t", threadType: "private", body: "mail ana@x.com" })), "mail ana@x.com");
});
