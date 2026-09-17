import { test } from "node:test";
import assert from "node:assert/strict";
import { ticketLookup, ticketTransfer } from "./ticket-self";
import { signAdmissionToken } from "@/lib/sessions/admission-token";

// The token modules only sign/verify when a secret is set; give the test one.
process.env.GUEST_COOKIE_SECRET = process.env.GUEST_COOKIE_SECRET ?? "test-secret-ticket-self";

const ADM_ID = "da83d55e-0000-4000-8000-000000000001";

/**
 * A fake admin that answers `loadTicketByCode`'s read with `row`, and whose
 * `.update(...).eq().eq().select()` resolves to `updateResult`. It captures
 * the values written so a test can assert the holder was set.
 */
function fakeAdmin(row: Record<string, unknown> | null, updateResult: { data: unknown; error: unknown }) {
  const captured: { values?: Record<string, unknown> } = {};
  const admin = {
    from() {
      return {
        // loadTicketByCode: .select(...).eq(...).eq(...).maybeSingle()
        select() {
          return { eq() { return this; }, maybeSingle: async () => ({ data: row, error: null }) };
        },
        // ticketTransfer: .update(...).eq(...).eq(...).select(...)
        update(values: Record<string, unknown>) {
          captured.values = values;
          const chain = {
            eq() { return chain; },
            select: async () => updateResult,
          };
          return chain;
        },
      };
    },
    rpc: async () => ({ data: null, error: null }),
  };
  return { admin, captured };
}

test("ticketTransfer refuses a nameless destination", async () => {
  const result = await ticketTransfer(
    { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }), rpc: async () => ({ data: null, error: null }) },
    { tenantId: "t1", code: "adm1.x.y", toName: "  ", toEmail: "a@b.com" },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "invalid");
});

test("D-160: a 0-row update is a conflict, not a silent success", async () => {
  const code = signAdmissionToken(ADM_ID, 1);
  assert.ok(code, "signing needs a secret");
  const row = { id: ADM_ID, token_version: 1, holder_name: null, holder_email: null, starts_at: null, session_id: null, status: "valid" };
  // The guarded update matched no rows (the version moved out from under us).
  const { admin } = fakeAdmin(row, { data: [], error: null });
  const result = await ticketTransfer(admin as never, {
    tenantId: "t1",
    code: code!,
    toName: "New Holder",
    toEmail: "new@holder.test",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "conflict");
});

test("D-160: a cash-sale admission with a null holder transfers", async () => {
  const code = signAdmissionToken(ADM_ID, 1);
  assert.ok(code, "signing needs a secret");
  // The production shape: no holder name, no holder e-mail, version 1.
  const row = { id: ADM_ID, token_version: 1, holder_name: null, holder_email: null, starts_at: null, session_id: null, status: "valid" };
  const { admin, captured } = fakeAdmin(row, { data: [{ id: ADM_ID }], error: null });
  const result = await ticketTransfer(admin as never, {
    tenantId: "t1",
    code: code!,
    toName: "  New Holder  ",
    toEmail: "New@Holder.test",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.tokenVersion, 2);
  assert.ok(result.code.startsWith("adm1."));
  // The write named the holder and normalized the e-mail.
  assert.equal(captured.values?.holder_name, "New Holder");
  assert.equal(captured.values?.holder_email, "new@holder.test");
  assert.equal(captured.values?.token_version, 2);
});

test("ticketLookup refuses a short receipt tail", async () => {
  const result = await ticketLookup(
    { from: () => { throw new Error("no"); }, rpc: async () => ({ data: null, error: null }) },
    { tenantId: "t1", email: "a@b.com", last4OfReceipt: "12" },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "invalid");
});
