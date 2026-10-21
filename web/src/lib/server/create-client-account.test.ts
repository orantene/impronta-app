/**
 * TUL-1733 follow-ups: the client is invited (no password typed or shown), and a failure after the invite
 * deletes the auth user just created, so there is no orphan login and a retry works.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { createClientAccount, type NewClientInput } from "./create-client-account";

const input: NewClientInput = { display_name: "Ana", email: "ana@example.com", company_name: "", phone: "", whatsapp_phone: "", website_url: "", notes: "" };

function fakeAdmin(opts: { inviteError?: boolean; failTable?: "profiles" | "client_profiles"; deleteError?: boolean; existingSince?: string } = {}) {
  const calls: { invites: Array<{ email: string; options: unknown }>; deleted: string[]; writes: string[] } = { invites: [], deleted: [], writes: [] };
  const admin = {
    auth: {
      admin: {
        inviteUserByEmail: async (email: string, options: unknown) => {
          calls.invites.push({ email, options });
          return opts.inviteError ? { data: { user: null }, error: { message: "already registered" } } : { data: { user: { id: "u-new", created_at: opts.existingSince ?? new Date().toISOString() } }, error: null };
        },
        deleteUser: async (id: string) => {
          calls.deleted.push(id);
          return { error: opts.deleteError ? { message: "x" } : null };
        },
      },
    },
    from(table: string) {
      const result = () => {
        calls.writes.push(table);
        return Promise.resolve({ error: opts.failTable === table ? { message: "boom", code: "XX000" } : null });
      };
      return { update: () => ({ eq: result }), upsert: result };
    },
  };
  return { admin: admin as never, calls };
}

test("an invitation is sent to the email, with the display name, and the user id comes back", async () => {
  const { admin, calls } = fakeAdmin();
  const r = await createClientAccount({ admin, attachToTenant: async () => true, redirectTo: "https://app.example/auth/reset-password" }, input);
  assert.deepEqual(r, { ok: true, userId: "u-new" });
  assert.equal(calls.invites.length, 1);
  assert.equal(calls.invites[0].email, "ana@example.com");
  assert.deepEqual(calls.invites[0].options, { data: { display_name: "Ana" }, redirectTo: "https://app.example/auth/reset-password" });
  assert.deepEqual(calls.deleted, []);
});

test("attach to the workspace fails: the new auth user is deleted (no orphan)", async () => {
  const { admin, calls } = fakeAdmin();
  const r = await createClientAccount({ admin, attachToTenant: async () => false }, input);
  assert.deepEqual(r, { ok: false, step: "attach" });
  assert.deepEqual(calls.deleted, ["u-new"]);
});

test("attach throws: the new auth user is deleted too", async () => {
  const { admin, calls } = fakeAdmin();
  const r = await createClientAccount({ admin, attachToTenant: async () => { throw new Error("db down"); } }, input);
  assert.deepEqual(r, { ok: false, step: "attach" });
  assert.deepEqual(calls.deleted, ["u-new"]);
});

test("a profile or client_profile write fails: the new auth user is deleted and attach is never tried", async () => {
  for (const failTable of ["profiles", "client_profiles"] as const) {
    const { admin, calls } = fakeAdmin({ failTable });
    let attached = false;
    const r = await createClientAccount({ admin, attachToTenant: async () => ((attached = true), true) }, input);
    assert.deepEqual(r, { ok: false, step: failTable === "profiles" ? "profile" : "client_profile" });
    assert.deepEqual(calls.deleted, ["u-new"], failTable);
    assert.equal(attached, false, failTable);
  }
});

test("a failed invite created nothing: no delete, no writes, the reason comes back", async () => {
  const { admin, calls } = fakeAdmin({ inviteError: true });
  const r = await createClientAccount({ admin, attachToTenant: async () => true }, input);
  assert.deepEqual(r, { ok: false, step: "invite", message: "already registered" });
  assert.deepEqual(calls.deleted, []);
  assert.deepEqual(calls.writes, []);
});

test("an existing UNCONFIRMED user (re-invited, created_at long ago) is refused: no profile write, no delete, no attach", async () => {
  const { admin, calls } = fakeAdmin({ existingSince: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString() });
  let attached = false;
  const r = await createClientAccount({ admin, attachToTenant: async () => ((attached = true), true) }, input);
  assert.deepEqual(r, { ok: false, step: "exists", message: "That email already has an account." });
  assert.deepEqual(calls.deleted, []);
  assert.deepEqual(calls.writes, []);
  assert.equal(attached, false);
});

test("an invite reply with no readable created_at is treated as not-new (never written to, never deleted)", async () => {
  const { admin, calls } = fakeAdmin();
  const a = admin as unknown as { auth: { admin: { inviteUserByEmail: () => Promise<unknown> } } };
  a.auth.admin.inviteUserByEmail = async () => ({ data: { user: { id: "u-x" } }, error: null });
  const r = await createClientAccount({ admin, attachToTenant: async () => false }, input);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.step, "exists");
  assert.deepEqual(calls.deleted, []);
});

test("a failure after a FRESH invite deletes only that new id", async () => {
  const { admin, calls } = fakeAdmin();
  const r = await createClientAccount({ admin, attachToTenant: async () => false }, input);
  assert.deepEqual(r, { ok: false, step: "attach" });
  assert.deepEqual(calls.deleted, ["u-new"]);
});

test("a failing rollback delete does not hide the original failure", async () => {
  const { admin, calls } = fakeAdmin({ deleteError: true });
  const r = await createClientAccount({ admin, attachToTenant: async () => false }, input);
  assert.deepEqual(r, { ok: false, step: "attach" });
  assert.deepEqual(calls.deleted, ["u-new"]);
});

test("no password anywhere: the action, the sheet and the state carry none; copy is EN and ES without em dashes", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  const action = read("src/lib/server-actions/admin-clients.ts");
  const sheet = read("src/components/admin/forms/admin-new-client-sheet.tsx");
  assert.doesNotMatch(action, /createUser|temporaryPassword|formData\.get\("password"\)/);
  assert.doesNotMatch(sheet, /name="password"|temporaryPassword|Temporary password/);
  assert.match(sheet, /dashboard\.adminNewClientSheet\.invitedBody/);
  const en = JSON.parse(read("messages/en.json")).dashboard.adminNewClientSheet as Record<string, string>;
  const es = JSON.parse(read("messages/es.json")).dashboard.adminNewClientSheet as Record<string, string>;
  assert.deepEqual(Object.keys(en).sort(), Object.keys(es).sort());
  for (const v of [...Object.values(en), ...Object.values(es)]) assert.doesNotMatch(v, /[—–]/);
  assert.match(en.invitedBody, /\{email\}/);
  assert.match(es.invitedBody, /\{email\}/);
});
