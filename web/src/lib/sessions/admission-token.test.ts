/**
 * UNIT TEST — admission-token.ts.
 *
 * Runs in `test:sessions` (glob lane, no package.json edit).
 * Run: cd web && npm run test:sessions
 *
 * NOTE ON WHAT A PASS HERE MEANS: `tsx --test` EXECUTES, it does not TYPECHECK.
 * A green lane is not a green branch, and this file says so where the next
 * person will read it.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

const SECRET = "test-secret-for-admission-tokens";
const ID = "3f2a1c9e-5b7d-4e21-9a86-0c1d2e3f4a5b";
const OTHER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

/** Import fresh so `getSecret()` sees whatever this test set. */
async function load(secret: string | undefined) {
  if (secret === undefined) delete process.env.GUEST_COOKIE_SECRET;
  else process.env.GUEST_COOKIE_SECRET = secret;
  return import(`./admission-token?${Math.random()}`);
}

test("a signed token round-trips to its admission and version", async () => {
  const m = await load(SECRET);
  const token = m.signAdmissionToken(ID, 1);
  assert.ok(token, "signing returned null with a secret set");
  const r = m.verifyAdmissionToken(token);
  assert.equal(r.ok, true);
  assert.equal(r.admissionId, ID);
  assert.equal(r.tokenVersion, 1);
});

test("BUMPING token_version kills the old QR and keeps the seat", async () => {
  // The case the column exists for: a transfer needs the old code dead and a
  // new one live FOR THE SAME ADMISSION. Void-and-remint would detach the row
  // from its allocation and lose what was sold.
  const m = await load(SECRET);
  const v1 = m.signAdmissionToken(ID, 1)!;
  const v2 = m.signAdmissionToken(ID, 2)!;
  assert.notEqual(v1, v2);

  // v1 still VERIFIES — it is a real signature — but it reports version 1, and
  // check_in is what compares that against the row. The verifier answers
  // identity; entitlement is the row's business.
  const r1 = m.verifyAdmissionToken(v1);
  assert.equal(r1.ok, true);
  assert.equal(r1.tokenVersion, 1);
  const r2 = m.verifyAdmissionToken(v2);
  assert.equal(r2.tokenVersion, 2);
});

test("a token for one admission does not verify as another", async () => {
  const m = await load(SECRET);
  const a = m.signAdmissionToken(ID, 1)!;
  const b = m.signAdmissionToken(OTHER_ID, 1)!;
  assert.notEqual(a, b);
  assert.equal(m.verifyAdmissionToken(a).admissionId, ID);
  assert.equal(m.verifyAdmissionToken(b).admissionId, OTHER_ID);
});

test("a tampered payload is refused as bad_signature, not accepted", async () => {
  const m = await load(SECRET);
  const token = m.signAdmissionToken(ID, 1)!;
  const [v, , sig] = token.split(".");
  const forged = Buffer.from(`${OTHER_ID}:1`, "utf8").toString("base64url");
  const r = m.verifyAdmissionToken(`${v}.${forged}.${sig}`);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "bad_signature");
});

test("a tampered VERSION is refused — the version is inside the signature", async () => {
  // If the version rode alongside the signature rather than inside it, anyone
  // could downgrade a re-issued ticket back to a version the row still accepts.
  const m = await load(SECRET);
  const token = m.signAdmissionToken(ID, 2)!;
  const [v, , sig] = token.split(".");
  const downgraded = Buffer.from(`${ID}:1`, "utf8").toString("base64url");
  const r = m.verifyAdmissionToken(`${v}.${downgraded}.${sig}`);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "bad_signature");
});

test("a token signed with a DIFFERENT secret is refused", async () => {
  const a = await load(SECRET);
  const token = a.signAdmissionToken(ID, 1)!;
  const b = await load("a-completely-different-secret");
  const r = b.verifyAdmissionToken(token);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "bad_signature");
});

test("no secret: signing returns null and verifying says no_secret, never true", async () => {
  // Degrading to an unsigned token would turn a missing env var into a door
  // that admits anyone. And `no_secret` must be distinguishable from
  // `bad_signature`: one is an outage, the other is a forgery.
  const m = await load(undefined);
  assert.equal(m.signAdmissionToken(ID, 1), null);
  const r = m.verifyAdmissionToken("adm1.abc.def");
  assert.equal(r.ok, false);
  assert.equal(r.reason, "no_secret");
});

test("malformed input is refused without throwing, whatever the shape", async () => {
  // Every one of these is a string an attacker chooses. An exception at a door
  // is a 500 on a scan.
  const m = await load(SECRET);
  for (const bad of [
    "",
    "   ",
    "adm1",
    "adm1.only-two-parts",
    "adm1..sig",
    "adm1.payload.",
    "wrongprefix.payload.sig",
    "adm1.!!!not-base64url!!!.sig",
    ".".repeat(50),
    "adm1." + "A".repeat(5000) + ".sig",
  ]) {
    const r = m.verifyAdmissionToken(bad);
    assert.equal(r.ok, false, `accepted: ${bad.slice(0, 30)}`);
  }
  assert.equal(m.verifyAdmissionToken(null).ok, false);
  assert.equal(m.verifyAdmissionToken(undefined).ok, false);
});

test("a well-signed token whose payload is not an admission id is malformed", async () => {
  // Signed by us, so the signature passes — and it still must not verify,
  // because the payload is not a thing check_in can look up.
  const m = await load(SECRET);
  const junkPayload = Buffer.from("not-a-uuid:1", "utf8").toString("base64url");
  const { createHmac } = await import("node:crypto");
  const sig = createHmac("sha256", SECRET)
    .update(`admission-qr:adm1:${junkPayload}`)
    .digest("base64url");
  const r = m.verifyAdmissionToken(`adm1.${junkPayload}.${sig}`);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "malformed");
});

test("a version that does not re-serialise to what was signed is refused", async () => {
  // `Number(" 1 ")` is 1 and `Number("1e0")` is 1, and neither is the string we
  // signed. Round-trip, do not range-check.
  const m = await load(SECRET);
  const { createHmac } = await import("node:crypto");
  for (const sneaky of [" 1", "1 ", "1e0", "01", "+1", "1.0"]) {
    const payload = Buffer.from(`${ID}:${sneaky}`, "utf8").toString("base64url");
    const sig = createHmac("sha256", SECRET)
      .update(`admission-qr:adm1:${payload}`)
      .digest("base64url");
    const r = m.verifyAdmissionToken(`adm1.${payload}.${sig}`);
    assert.equal(r.ok, false, `accepted version "${sneaky}"`);
    assert.equal(r.reason, "malformed");
  }
});

test("signing refuses a bad admission id or a bad version rather than minting junk", async () => {
  const m = await load(SECRET);
  assert.equal(m.signAdmissionToken("not-a-uuid", 1), null);
  assert.equal(m.signAdmissionToken("", 1), null);
  assert.equal(m.signAdmissionToken(ID, 0), null);
  assert.equal(m.signAdmissionToken(ID, -1), null);
  assert.equal(m.signAdmissionToken(ID, 1.5), null);
  assert.equal(m.signAdmissionToken(ID, Number.NaN), null);
});

test("an admission token cannot be replayed as a guest-unsubscribe token", async () => {
  // Domain separation, proven rather than asserted in a comment: the prefix is
  // inside the signed message, so identical payload bytes under the same secret
  // produce different signatures for different purposes.
  const m = await load(SECRET);
  const { createHmac } = await import("node:crypto");
  const payload = Buffer.from(`${ID}:1`, "utf8").toString("base64url");
  const ours = createHmac("sha256", SECRET)
    .update(`admission-qr:adm1:${payload}`)
    .digest("base64url");
  const theirs = createHmac("sha256", SECRET)
    .update(`guest-email-unsub:ge1:${payload}`)
    .digest("base64url");
  assert.notEqual(ours, theirs);
  assert.equal(m.verifyAdmissionToken(`adm1.${payload}.${theirs}`).reason, "bad_signature");
});
