/**
 * Login-link CSV: same guards as --remove, owner-only file outside the repo,
 * escaping, and counts-only reporting. Run:
 *   npx tsx --test scripts/demo-talents/foundation-login-links.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { LOGIN_LINK_COLUMNS, LOGIN_LINK_TTL_SECONDS, buildLoginLinks, csvField, toCsv, writeLoginLinksCsv } from "./foundation-login-links";
import { seedDemo } from "./foundation-seed-core";
import { harness, makeDemo } from "./test-fixtures";

const NOW = new Date("2026-09-29T20:00:00.000Z");

async function seeded() {
  const h = await harness();
  await seedDemo(h.ctx, makeDemo());
  await seedDemo(h.ctx, makeDemo({ demoId: "DEMO004", profileCode: "TAL-93104", email: "demo-nails-004@demo.tulala.digital", firstName: "Leo", lastName: "Haddad", displayName: "Leo Haddad" }));
  return h;
}

test("one row per demo in the manifest: demo id, code, email, link, generated and expiry times", async () => {
  const h = await seeded();
  const ids = new Map([["TAL-93103", "DEMO003"], ["TAL-93104", "DEMO004"]]);
  const { rows, skipped } = await buildLoginLinks(h.admin, h.manifest, ids, NOW);
  assert.equal(skipped.length, 0);
  assert.deepEqual(rows.map((r) => [r.demo_id, r.code, r.email]), [
    ["DEMO003", "TAL-93103", "demo-nails-003@demo.tulala.digital"],
    ["DEMO004", "TAL-93104", "demo-nails-004@demo.tulala.digital"],
  ]);
  assert.ok(rows.every((r) => r.action_link.startsWith("https://")));
  assert.ok(rows.every((r) => r.generated_at === "2026-09-29T20:00:00.000Z"));
  assert.ok(rows.every((r) => r.expires_at === new Date(NOW.getTime() + LOGIN_LINK_TTL_SECONDS * 1000).toISOString()));
  const calls = h.db.authCalls.filter((c) => c.method === "generateLink");
  assert.equal(calls.length, 2);
  assert.ok(calls.every((c) => (c.args as { type: string }).type === "magiclink"));
});

test("a code the workbook does not know still gets a row with a blank demo id; --only filters", async () => {
  const h = await seeded();
  const { rows } = await buildLoginLinks(h.admin, h.manifest, new Map(), NOW, ["TAL-93104"]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].demo_id, "");
});

test("refuses an entry whose auth user is not a demo user, or whose email does not match", async () => {
  const h = await seeded();
  h.db.users[0].app_metadata = {};
  await assert.rejects(() => buildLoginLinks(h.admin, h.manifest, new Map(), NOW), /REFUSE.*not a demo user/);

  const h2 = await seeded();
  h2.manifest.entries["TAL-93103"].email = "someone@gmail.com";
  await assert.rejects(() => buildLoginLinks(h2.admin, h2.manifest, new Map(), NOW), /not a demo email/);

  const h3 = await seeded();
  h3.db.table("talent_profiles")[0].user_id = "someone-else";
  await assert.rejects(() => buildLoginLinks(h3.admin, h3.manifest, new Map(), NOW), /does not match manifest/);
});

test("an account that no longer exists is skipped, not fatal", async () => {
  const h = await seeded();
  h.db.users = h.db.users.filter((u) => u.email !== "demo-nails-004@demo.tulala.digital");
  const { rows, skipped } = await buildLoginLinks(h.admin, h.manifest, new Map(), NOW);
  assert.equal(rows.length, 1);
  assert.deepEqual(skipped, [{ code: "TAL-93104", reason: "auth user not found" }]);
});

test("CSV: header order, RFC 4180 quoting, trailing newline", () => {
  assert.equal(csvField("plain"), "plain");
  assert.equal(csvField('a,"b"'), '"a,""b"""');
  assert.equal(csvField("line\nbreak"), '"line\nbreak"');
  const csv = toCsv([{ demo_id: "DEMO003", code: "TAL-93103", email: "a@demo.tulala.digital", action_link: "https://x.test/v?token=a&type=magiclink", generated_at: "g", expires_at: "e" }]);
  const lines = csv.split("\n");
  assert.equal(lines[0], LOGIN_LINK_COLUMNS.join(","));
  assert.equal(lines[0], "demo_id,code,email,action_link,generated_at,expires_at");
  assert.equal(lines[1], "DEMO003,TAL-93103,a@demo.tulala.digital,https://x.test/v?token=a&type=magiclink,g,e");
  assert.equal(lines[2], "");
});

test("the CSV is written owner-only and only outside the repo", async () => {
  const h = await seeded();
  const { rows } = await buildLoginLinks(h.admin, h.manifest, new Map(), NOW);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "links-"));
  const file = path.join(dir, "login-links.csv");
  writeLoginLinksCsv(file, rows);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const lines = fs.readFileSync(file, "utf8").trim().split("\n");
  assert.equal(lines.length, 3);
  // Overwritten, not appended, on the next run.
  writeLoginLinksCsv(file, rows.slice(0, 1));
  assert.equal(fs.readFileSync(file, "utf8").trim().split("\n").length, 2);
  // A path inside the repo is refused.
  assert.throws(() => writeLoginLinksCsv(path.join(process.cwd(), "links.csv"), rows), /outside the repo/);
});
