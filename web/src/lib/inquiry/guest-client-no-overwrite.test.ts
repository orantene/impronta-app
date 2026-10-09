import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

import { ensureGuestClientByEmail } from "./guest-client";

/**
 * SECURITY (2026-10-09): ensureGuestClientByEmail is called from PUBLIC unauthenticated paths with an
 * email the visitor typed. It used to overwrite the matching account's profile, auth metadata and
 * client profile, and attach the stranger's inquiry to it. These tests pin that it never does.
 */

type Match = { user_id: string; app_role: string | null; display_name: string | null; account_status: string | null };

/** A service-role client that records EVERY write surface and answers only the identity lookup. */
function fakeAdmin(match: Match | null) {
  const writes: string[] = [];
  const trap = (name: string) => () => {
    writes.push(name);
    throw new Error(`unexpected admin.${name}`);
  };
  return {
    writes,
    admin: {
      rpc: async (fn: string) => ({ data: fn === "find_auth_user_identity_by_email" && match ? [match] : [], error: null }),
      from: trap("from"),
      auth: { admin: { updateUserById: trap("auth.admin.updateUserById"), createUser: trap("auth.admin.createUser") } },
    },
  };
}

const VICTIM: Match = { user_id: "victim-1", app_role: "client", display_name: "Real Name", account_status: "active" };
const ARGS = { email: "Victim@Example.com ", name: "Attacker Name", company: "", phone: "" };

test("a stranger typing an existing client's email changes NOTHING and is not linked", async () => {
  const { admin, writes } = fakeAdmin(VICTIM);
  const r = await ensureGuestClientByEmail(ARGS, { __admin: admin as never });
  assert.deepEqual(r, { status: "unlinked", clientUserId: null });
  assert.deepEqual(writes, [], "no profiles / client_profiles / auth metadata write");
});

test("an unclaimed or onboarding account is also untouched (no role or status flip)", async () => {
  for (const m of [{ ...VICTIM, app_role: null, account_status: "onboarding" }, { ...VICTIM, account_status: "onboarding" }]) {
    const { admin, writes } = fakeAdmin(m);
    const r = await ensureGuestClientByEmail({ ...ARGS, company: "Evil Corp", phone: "123" }, { __admin: admin as never });
    assert.equal(r.clientUserId, null);
    assert.deepEqual(writes, []);
  }
});

test("staff, talent and super admin accounts are never linked, trusted or not", async () => {
  for (const role of ["super_admin", "agency_staff", "talent"]) {
    for (const trustedLink of [false, true]) {
      const { admin, writes } = fakeAdmin({ ...VICTIM, app_role: role });
      const r = await ensureGuestClientByEmail(ARGS, { __admin: admin as never, trustedLink });
      assert.equal(r.clientUserId, null);
      assert.deepEqual(writes, []);
    }
  }
});

test("a trusted caller (staff logging an inquiry) links the account but still writes nothing to it", async () => {
  const { admin, writes } = fakeAdmin(VICTIM);
  const r = await ensureGuestClientByEmail(ARGS, { __admin: admin as never, trustedLink: true });
  assert.deepEqual(r, { status: "matched", clientUserId: "victim-1" });
  assert.deepEqual(writes, []);
});

test("an email with no account stays unlinked and no auth user is minted", async () => {
  const { admin, writes } = fakeAdmin(null);
  const r = await ensureGuestClientByEmail(ARGS, { __admin: admin as never });
  assert.deepEqual(r, { status: "unlinked", clientUserId: null });
  assert.deepEqual(writes, []);
});

test("the source writes to no account table and no public caller opts into trustedLink", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/inquiry/guest-client.ts"), "utf8");
  const matched = src.slice(src.indexOf("export async function ensureGuestClientByEmail"), src.indexOf("export async function resolveStaffCreatedInquiryClient"));
  const code = matched.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /\.from\("profiles"\)|\.from\("client_profiles"\)|updateUserById|createUser|\.upsert\(|\.update\(/);

  // The public callers (contact form, directory, CMS form, /t guest chat x2, review tokens, intent drawer, promotion)
  // must not pass trustedLink. Only guest-client.ts itself (staff path) may.
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) {
        const rel = relative(process.cwd(), p).split("\\").join("/");
        if (rel === "src/lib/inquiry/guest-client.ts") continue;
        if (/trustedLink/.test(readFileSync(p, "utf8"))) offenders.push(rel);
      }
    }
  };
  walk(join(process.cwd(), "src"));
  assert.deepEqual(offenders, [], "trustedLink must only be set by resolveStaffCreatedInquiryClient");
  assert.match(src, /\{ trustedLink: true \}/);
});
