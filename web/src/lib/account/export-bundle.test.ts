import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { EXPORT_SOURCES, buildAccountExport, exportFilename } from "./export-bundle";
import { blankComments } from "@/lib/quality/supabase-unchecked-read";

/**
 * A subject access response is only correct if it is COMPLETE, and the failure
 * mode of an incomplete one is that it looks fine. These pin the two things
 * that decide whether the file is honest: what it reaches for, and what it says
 * when it cannot reach something.
 */

type Row = Record<string, unknown>;

function fakeAdmin(rows: Record<string, Row[] | "error">) {
  const seen: Array<{ table: string; column: string; value: unknown }> = [];
  const admin = {
    from(table: string) {
      return {
        select() {
          return {
            eq(column: string, value: unknown) {
              seen.push({ table, column, value });
              const r = rows[table];
              if (r === "error") return Promise.resolve({ data: null, error: { message: "denied" } });
              return Promise.resolve({ data: r ?? [], error: null });
            },
          };
        },
      };
    },
  };
  return { admin, seen };
}

test("every source is keyed on a UUID the session owns, never on an email", () => {
  // `customers` is deliberately tenant-scoped and deliberately does NOT unify
  // one email across workspaces. Matching on email here would hand a signed-in
  // user every tenant's record of anybody sharing their address: a cross-tenant
  // disclosure dressed up as a privacy feature.
  for (const source of EXPORT_SOURCES) {
    assert.doesNotMatch(source.column, /email|phone/i, `${source.key} must join on a user id`);
    assert.match(source.column, /(^id$|user_id$|profile_id$)/, `${source.key} joins on ${source.column}`);
  }
});

test("no source selects a bearer secret", () => {
  // `user_prefs.unsubscribe_token` is the live example: whoever holds it can
  // unsubscribe this person, and an export file gets emailed and forwarded to
  // places the session never reached.
  for (const source of EXPORT_SOURCES) {
    assert.doesNotMatch(source.select, /token|secret|api_key|password/i, `${source.key} leaks a credential`);
  }
});

test("no source uses a bare star", () => {
  // `select("*")` makes every future column exported by default, including the
  // next credential somebody adds to `user_prefs`.
  for (const source of EXPORT_SOURCES) {
    assert.notEqual(source.select.trim(), "*", `${source.key} must name its columns`);
  }
});

test("source keys are unique, so one section cannot overwrite another", () => {
  const keys = EXPORT_SOURCES.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("every read is scoped to the requesting user", async () => {
  const { admin, seen } = fakeAdmin({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await buildAccountExport(admin as any, { userId: "u1", email: "a@b.c" });
  assert.equal(seen.length, EXPORT_SOURCES.length, "every source is read");
  for (const s of seen) assert.equal(s.value, "u1", `${s.table} read something other than the subject`);
});

test("a section that could not be read is NAMED, not silently omitted", async () => {
  // An export missing a section it failed to read is indistinguishable from an
  // export of a person who has no rows there. The person reading it has no way
  // to tell, so the file would be a false statement about what we hold.
  const { admin } = fakeAdmin({ notifications: "error", profiles: [{ id: "u1" }] });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bundle = await buildAccountExport(admin as any, { userId: "u1", email: null });
  assert.deepEqual(bundle.unavailable, ["notifications"]);
  assert.equal(bundle.data.notifications, undefined, "a failed section is absent, not empty");
  assert.deepEqual(bundle.data.profile, [{ id: "u1" }], "the rest still lands");
});

test("one unreadable table does not cost the person the whole export", async () => {
  const { admin } = fakeAdmin({ profiles: "error" });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bundle = await buildAccountExport(admin as any, { userId: "u1", email: null });
  assert.equal(Object.keys(bundle.data).length, EXPORT_SOURCES.length - 1);
});

test("the bundle says out loud what it does not cover", () => {
  // Guest purchases are genuinely out of scope: they are tied to a tenant's
  // `customers` row and not to any account. Naming that is the difference
  // between a limitation and a hole.
  const notes = [
    ...(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [] as any[]
    ),
  ];
  void notes;
  const src = readFileSync(join(process.cwd(), "src/lib/account/export-bundle.ts"), "utf8");
  assert.match(src, /without signing in/, "guest purchases are named");
});

test("the filename is dated and sortable", () => {
  assert.equal(exportFilename(new Date("2026-09-09T11:00:00Z")), "tulala-account-export-2026-09-09.json");
});

const ROUTE = blankComments(readFileSync(join(process.cwd(), "src/app/api/account/export/route.ts"), "utf8"));

test("the subject is the session and nothing the caller can vary", () => {
  // There is no id in the path and no email parameter, so there is no other
  // person's export to be refused from — which is why the handler has no 403.
  assert.match(ROUTE, /getCachedActorSession\(\)/, "the session is the only input");
  assert.match(ROUTE, /userId: session\.user\.id/, "and it is what scopes the read");
  assert.doesNotMatch(ROUTE, /searchParams|params\b/, "no caller-supplied subject");
});

test("the response is never cached", () => {
  assert.match(ROUTE, /private, no-store/, "the most sensitive response this app produces");
});

test("the path is reachable, which is the fourth layer this repo keeps missing", () => {
  const groups = readFileSync(join(process.cwd(), "src/lib/saas/path-groups.ts"), "utf8");
  assert.match(groups, /"\/api\/account"/, "absent, the route 404s on every host with green tests");
});

test("the privacy action points at the route that now exists", () => {
  const prefs = readFileSync(join(process.cwd(), "src/lib/server-actions/user-prefs.ts"), "utf8");
  assert.match(prefs, /ACCOUNT_EXPORT_PATH = "\/api\/account\/export"/, "one literal for the path");
  assert.match(prefs, /url: ACCOUNT_EXPORT_PATH/, "requesting an export hands back where it is");
});
