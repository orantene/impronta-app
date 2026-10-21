import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_TALENT_PRIVATE_FIELDS,
  TALENT_PRIVATE_COLUMNS,
  loadTalentPrivateFields,
} from "./private-fields";

type RpcResult = { data: unknown; error: { message: string } | null };
function fake(result: RpcResult) {
  const calls: Array<{ fn: string; args: unknown }> = [];
  return {
    calls,
    client: {
      rpc: (fn: string, args: unknown) => {
        calls.push({ fn, args });
        return Promise.resolve(result);
      },
    } as never,
  };
}

test("the private column list is exactly the seven audited columns", () => {
  assert.deepEqual([...TALENT_PRIVATE_COLUMNS].sort(), [
    "ai_search_document",
    "date_of_birth",
    "gp_recipient_account_id",
    "legal_name",
    "phone",
    "phone_e164",
    "stripe_account_id",
  ]);
});

test("calls talent_private_fields with p_talent_id and maps a returned row", async () => {
  const f = fake({
    data: [
      {
        phone: "+5215511111111",
        phone_e164: "+5215511111111",
        date_of_birth: "1990-01-02",
        legal_name: "A B",
        stripe_account_id: "acct_1",
        gp_recipient_account_id: null,
        ai_search_document: "doc",
        extra: "ignored",
      },
    ],
    error: null,
  });
  const out = await loadTalentPrivateFields(f.client, "tal-1");
  assert.deepEqual(f.calls, [{ fn: "talent_private_fields", args: { p_talent_id: "tal-1" } }]);
  assert.equal(out?.phone, "+5215511111111");
  assert.equal(out?.date_of_birth, "1990-01-02");
  assert.equal(out?.gp_recipient_account_id, null);
  assert.equal("extra" in (out ?? {}), false);
});

test("accepts a single-object RPC result", async () => {
  const f = fake({ data: { phone: "1" }, error: null });
  const out = await loadTalentPrivateFields(f.client, "t");
  assert.equal(out?.phone, "1");
  assert.equal(out?.legal_name, null);
});

test("no row (not owner or staff) returns null", async () => {
  assert.equal(await loadTalentPrivateFields(fake({ data: [], error: null }).client, "t"), null);
  assert.equal(await loadTalentPrivateFields(fake({ data: null, error: null }).client, "t"), null);
});

test("an RPC error fails closed to null", async () => {
  assert.equal(await loadTalentPrivateFields(fake({ data: null, error: { message: "boom" } }).client, "t"), null);
});

test("empty constant has every column null", () => {
  for (const c of TALENT_PRIVATE_COLUMNS) assert.equal(EMPTY_TALENT_PRIVATE_FIELDS[c], null);
});
