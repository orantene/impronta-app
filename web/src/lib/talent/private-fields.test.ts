import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_TALENT_PRIVATE_FIELDS,
  PRIVATE_IDENTITY_PAYLOAD_KEYS,
  TALENT_PRIVATE_COLUMNS,
  loadTalentPrivateFields,
  omitUnlessLoaded,
  privateFieldOrNull,
  privateFieldsLoaded,
} from "./private-fields";
import { buildTalentIdentityProfilePatch } from "./talent-profile-shell-persistence";
import { buildBasicsSavePayload } from "../../app/(workspace)/talent/onboarding/basics-save-payload";

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

const TID = "11111111-1111-4111-8111-111111111111";

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

test("calls talent_private_fields with p_talent_id and returns a loaded state", async () => {
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
  assert.equal(out.status, "loaded");
  if (out.status !== "loaded") return;
  assert.equal(out.fields.phone, "+5215511111111");
  assert.equal(out.fields.date_of_birth, "1990-01-02");
  assert.equal(out.fields.gp_recipient_account_id, null);
  assert.equal("extra" in out.fields, false);
});

test("accepts a single-object RPC result", async () => {
  const out = await loadTalentPrivateFields(fake({ data: { phone: "1" }, error: null }).client, "t");
  assert.equal(out.status, "loaded");
  assert.equal(privateFieldOrNull(out, "phone"), "1");
  assert.equal(privateFieldOrNull(out, "legal_name"), null);
});

test("no row (not owner or staff) is the explicit unavailable state, not a blank", async () => {
  for (const data of [[], null, undefined]) {
    const out = await loadTalentPrivateFields(fake({ data, error: null }).client, "t");
    assert.deepEqual(out, { status: "unavailable", reason: "no_row" });
    assert.equal(privateFieldsLoaded(out), false);
  }
});

test("an RPC error is the explicit unavailable state", async () => {
  const out = await loadTalentPrivateFields(fake({ data: null, error: { message: "boom" } }).client, "t");
  assert.deepEqual(out, { status: "unavailable", reason: "rpc_error" });
});

test("unavailable is distinguished from a loaded-but-empty value", async () => {
  const loadedEmpty = await loadTalentPrivateFields(fake({ data: [{ phone: null }], error: null }).client, "t");
  const unavailable = await loadTalentPrivateFields(fake({ data: null, error: { message: "x" } }).client, "t");
  assert.equal(loadedEmpty.status, "loaded");
  assert.equal(unavailable.status, "unavailable");
  assert.equal(privateFieldsLoaded(loadedEmpty), true);
  assert.equal(privateFieldsLoaded(unavailable), false);
  // Display helper collapses both to null, which is why writes must key off the status.
  assert.equal(privateFieldOrNull(loadedEmpty, "phone"), null);
  assert.equal(privateFieldOrNull(unavailable, "phone"), null);
});

test("empty constant has every column null", () => {
  for (const c of TALENT_PRIVATE_COLUMNS) assert.equal(EMPTY_TALENT_PRIVATE_FIELDS[c], null);
});

// ─── No blank write-back ─────────────────────────────────────────────────────

test("omitUnlessLoaded: unavailable drops exactly the named keys, loaded keeps the payload unchanged", () => {
  const payload = { a: 1, phone: "", dob: "" };
  assert.deepEqual(omitUnlessLoaded(payload, false, ["phone", "dob"]), { a: 1 });
  assert.equal(omitUnlessLoaded(payload, true, ["phone", "dob"]), payload);
  assert.deepEqual(payload, { a: 1, phone: "", dob: "" }, "input not mutated");
});

const identityBase = {
  talent_profile_id: TID,
  stage_name: "Mara",
  first_name: "Mara",
  last_name: "Lopez",
  legal_name: "Mara Lopez Ruiz",
  gender: "female",
  date_of_birth: "1991-05-06",
  contact_email: "m@example.test",
  contact_phone: "55 1234 5678",
  contact_phone_prefix: "+52",
};

test("identity save (drawer): load failed -> patch has no legal_name / date_of_birth / phone", () => {
  const gated = omitUnlessLoaded(identityBase, false, PRIVATE_IDENTITY_PAYLOAD_KEYS);
  const res = buildTalentIdentityProfilePatch(gated);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  for (const k of ["legal_name", "date_of_birth", "phone"]) assert.equal(k in res.patch, false, k);
  // Non-private fields still save.
  assert.equal(res.patch.display_name, "Mara");
  assert.equal(res.patch.invitation_email, "m@example.test");
});

test("identity save (drawer): load failed with BLANK hydrated values still cannot write blanks", () => {
  const blank = { ...identityBase, legal_name: "", date_of_birth: "", contact_phone: "", contact_phone_prefix: "+1" };
  const res = buildTalentIdentityProfilePatch(omitUnlessLoaded(blank, false, PRIVATE_IDENTITY_PAYLOAD_KEYS));
  assert.equal(res.ok, true);
  if (!res.ok) return;
  for (const k of ["legal_name", "date_of_birth", "phone"]) assert.equal(k in res.patch, false, k);
});

test("identity save (drawer): load succeeded -> unchanged behaviour", () => {
  const res = buildTalentIdentityProfilePatch(omitUnlessLoaded(identityBase, true, PRIVATE_IDENTITY_PAYLOAD_KEYS));
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.patch.legal_name, "Mara Lopez Ruiz");
  assert.equal(res.patch.date_of_birth, "1991-05-06");
  assert.equal(res.patch.phone, "+52 55 1234 5678");
});

test("identity save (drawer): a loaded null phone stays writable (clearing / setting)", () => {
  const cleared = { ...identityBase, contact_phone: "", contact_phone_prefix: "" };
  const res = buildTalentIdentityProfilePatch(omitUnlessLoaded(cleared, true, PRIVATE_IDENTITY_PAYLOAD_KEYS));
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.ok("phone" in res.patch);
  assert.equal(res.patch.phone, null);
});

test("onboarding basics save: unavailable omits phone and date_of_birth, keeps name and gender", () => {
  const p = buildBasicsSavePayload({
    talentProfileId: TID,
    name: " Mara ",
    phone: "",
    gender: "female",
    dob: "",
    privateFieldsAvailable: false,
  });
  assert.equal("contact_phone" in p, false);
  assert.equal("date_of_birth" in p, false);
  assert.equal(p.stage_name, "Mara");
  assert.equal(p.gender, "female");
});

test("onboarding basics save: available keeps current behaviour, including a cleared phone", () => {
  const p = buildBasicsSavePayload({
    talentProfileId: TID,
    name: "Mara",
    phone: " 555 ",
    gender: "female",
    dob: "1991-05-06",
    privateFieldsAvailable: true,
  });
  assert.equal(p.contact_phone, "555");
  assert.equal(p.date_of_birth, "1991-05-06");
  const cleared = buildBasicsSavePayload({
    talentProfileId: TID,
    name: "Mara",
    phone: "",
    gender: "",
    dob: "",
    privateFieldsAvailable: true,
  });
  assert.equal(cleared.contact_phone, "");
  assert.equal("date_of_birth" in cleared, true);
  assert.equal(cleared.date_of_birth, undefined);
});
