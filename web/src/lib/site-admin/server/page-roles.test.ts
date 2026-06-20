import assert from "node:assert/strict";
import test from "node:test";

import { readTenantPageRoles, writeTenantPageRole } from "./page-roles";
import { EMPTY_PAGE_ROLES } from "./page-roles-shape";

/**
 * Deterministic coverage for the DB read/write layer of page roles, using a
 * fake Supabase client (these functions take an injected client). The pure
 * parse/merge is covered separately in page-roles-shape.test.ts; this asserts
 * the I/O wiring: reads parse settings, writes merge without clobbering other
 * settings keys, and neither throws on a Supabase error (read → EMPTY, write →
 * {ok:false}). resolveRolePageSlug/resolve*Slug create their own service client
 * + hit cms_pages, so they stay covered by live route QA, not this unit.
 */

type FakeOpts = {
  /** present ⇒ the agencies row exists with this `settings` value. */
  settings?: unknown;
  readError?: { message: string } | null;
  writeError?: { message: string } | null;
};

function fakeClient(opts: FakeOpts = {}) {
  const calls: { update?: Record<string, unknown> } = {};
  // One chainable, thenable builder: the read chain ends at `.maybeSingle()`,
  // the write chain is awaited at `.eq()` (resolves via `.then`).
  const builder = {
    select: () => builder,
    update: (payload: Record<string, unknown>) => {
      calls.update = payload;
      return builder;
    },
    eq: () => builder,
    maybeSingle: async () => ({
      data: "settings" in opts ? { settings: opts.settings } : null,
      error: opts.readError ?? null,
    }),
    then: (resolve: (v: { error: unknown }) => void) =>
      resolve({ error: opts.writeError ?? null }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: { from: () => builder } as any, calls };
}

// ── readTenantPageRoles ───────────────────────────────────────────────────────

test("readTenantPageRoles: parses pageRoles out of settings", async () => {
  const { client } = fakeClient({
    settings: { pageRoles: { home: "welcome", directory: "dir", notFound: null } },
  });
  assert.deepEqual(await readTenantPageRoles(client, "t1"), {
    home: "welcome",
    directory: "dir",
    notFound: null,
  });
});

test("readTenantPageRoles: empty tenantId ⇒ EMPTY (no query)", async () => {
  const { client } = fakeClient({ settings: { pageRoles: { home: "x" } } });
  assert.deepEqual(await readTenantPageRoles(client, ""), EMPTY_PAGE_ROLES);
});

test("readTenantPageRoles: read error ⇒ EMPTY (never throws)", async () => {
  const { client } = fakeClient({ readError: { message: "boom" } });
  assert.deepEqual(await readTenantPageRoles(client, "t1"), EMPTY_PAGE_ROLES);
});

test("readTenantPageRoles: no row ⇒ EMPTY", async () => {
  const { client } = fakeClient({});
  assert.deepEqual(await readTenantPageRoles(client, "t1"), EMPTY_PAGE_ROLES);
});

// ── writeTenantPageRole ───────────────────────────────────────────────────────

test("writeTenantPageRole: sets a role + preserves other settings keys", async () => {
  const { client, calls } = fakeClient({
    settings: { locales: ["en", "es"], pageRoles: { home: "old" } },
  });
  const res = await writeTenantPageRole(client, "t1", "home", "new");
  assert.deepEqual(res, { ok: true });
  const written = calls.update!.settings as { locales: unknown; pageRoles: unknown };
  assert.deepEqual(written.locales, ["en", "es"]); // untouched
  assert.deepEqual(written.pageRoles, { home: "new", directory: null, notFound: null });
});

test("writeTenantPageRole: clears one role, leaves the others", async () => {
  const { client, calls } = fakeClient({
    settings: { pageRoles: { home: "h", directory: "d" } },
  });
  await writeTenantPageRole(client, "t1", "directory", null);
  const roles = (calls.update!.settings as { pageRoles: Record<string, unknown> }).pageRoles;
  assert.equal(roles.directory, null);
  assert.equal(roles.home, "h");
});

test("writeTenantPageRole: empty tenantId ⇒ error, no write attempted", async () => {
  const { client, calls } = fakeClient({});
  const res = await writeTenantPageRole(client, "", "home", "x");
  assert.equal(res.ok, false);
  assert.equal(calls.update, undefined);
});

test("writeTenantPageRole: read failure ⇒ {ok:false}, no write", async () => {
  const { client, calls } = fakeClient({ readError: { message: "boom" } });
  const res = await writeTenantPageRole(client, "t1", "home", "x");
  assert.equal(res.ok, false);
  assert.equal(calls.update, undefined);
});

test("writeTenantPageRole: write failure ⇒ {ok:false}", async () => {
  const { client } = fakeClient({ settings: {}, writeError: { message: "boom" } });
  const res = await writeTenantPageRole(client, "t1", "home", "x");
  assert.equal(res.ok, false);
});
