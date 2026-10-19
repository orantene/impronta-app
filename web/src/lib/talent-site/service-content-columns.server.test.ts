import test from "node:test";
import assert from "node:assert/strict";

import {
  isMissingColumnError,
  loadServiceContentFields,
  resetServiceContentProbeForTests,
  serviceContentColumnsAvailable,
  type ServiceContentDb,
} from "./service-content-columns.server";
import { EMPTY_SERVICE_CONTENT } from "./service-content-fields";

type Result = { data: unknown; error: { code?: string; message?: string } | null };

/** Fake of the one PostgREST chain these helpers use; records every select string. */
function fakeDb(answer: (cols: string, ids: readonly string[] | null) => Result) {
  const selects: string[] = [];
  const db: ServiceContentDb = {
    from(table) {
      assert.equal(table, "talent_offerings");
      return {
        select(cols: string) {
          selects.push(cols);
          return {
            limit: () => Promise.resolve(answer(cols, null)),
            in: (_col: string, ids: readonly string[]) => Promise.resolve(answer(cols, ids)),
          };
        },
      };
    },
  };
  return { db, selects };
}

const MISSING = { data: null, error: { code: "42703", message: 'column talent_offerings.slug does not exist' } };
const ID = "3fa91c2b-1111-4222-8333-444455556666";

test("missing-column errors are recognised (Postgres and PostgREST shapes)", () => {
  assert.equal(isMissingColumnError({ code: "42703", message: "x" }), true);
  assert.equal(isMissingColumnError({ code: "PGRST204", message: "x" }), true);
  assert.equal(isMissingColumnError({ message: "column talent_offerings.slug does not exist" }), true);
  assert.equal(isMissingColumnError({ code: "57014", message: "statement timeout" }), false);
  assert.equal(isMissingColumnError(null), false);
});

test("columns absent: probe says false, loader returns no rows and never selects the content columns twice", async () => {
  resetServiceContentProbeForTests();
  const { db, selects } = fakeDb(() => MISSING);
  assert.equal(await serviceContentColumnsAvailable(db, { now: 0 }), false);
  const map = await loadServiceContentFields([ID], db, { now: 1 });
  assert.equal(map.size, 0);
  assert.equal(selects.length, 1, "negative probe is cached");
});

test("negative probe expires so applying the migration takes effect without a deploy", async () => {
  resetServiceContentProbeForTests();
  let applied = false;
  const { db } = fakeDb(() => (applied ? { data: [], error: null } : MISSING));
  assert.equal(await serviceContentColumnsAvailable(db, { now: 0 }), false);
  applied = true;
  assert.equal(await serviceContentColumnsAvailable(db, { now: 60_000 }), false);
  assert.equal(await serviceContentColumnsAvailable(db, { now: 10 * 60_000 }), true);
});

test("a transient error is not cached as 'absent'", async () => {
  resetServiceContentProbeForTests();
  let fail = true;
  const { db } = fakeDb(() => (fail ? { data: null, error: { code: "57014", message: "timeout" } } : { data: [], error: null }));
  assert.equal(await serviceContentColumnsAvailable(db, { now: 0 }), false);
  fail = false;
  assert.equal(await serviceContentColumnsAvailable(db, { now: 1 }), true);
});

test("columns present: loader maps rows by id through the tolerant parser", async () => {
  resetServiceContentProbeForTests();
  const { db, selects } = fakeDb((_cols, ids) =>
    ids ? { data: [{ id: ID, slug: "corte-clasico", slug_history: ["corte-viejo"], tags: null }], error: null } : { data: [], error: null },
  );
  const map = await loadServiceContentFields([ID, ID], db, { now: 0 });
  assert.deepEqual(map.get(ID), { ...EMPTY_SERVICE_CONTENT, slug: "corte-clasico", slugHistory: ["corte-viejo"] });
  assert.match(selects.at(-1) ?? "", /^id, slug, slug_history,/);
});

test("columns dropped after a positive probe: loader falls back to defaults and re-probes later", async () => {
  resetServiceContentProbeForTests();
  let present = true;
  const { db } = fakeDb(() => (present ? { data: [], error: null } : MISSING));
  assert.equal(await serviceContentColumnsAvailable(db, { now: 0 }), true);
  present = false;
  const map = await loadServiceContentFields([ID], db, { now: 1 });
  assert.equal(map.size, 0);
  assert.equal(await serviceContentColumnsAvailable(db, { now: 2 }), false);
});

test("no ids or no client: empty map, no query", async () => {
  resetServiceContentProbeForTests();
  const { db, selects } = fakeDb(() => ({ data: [], error: null }));
  assert.equal((await loadServiceContentFields([], db)).size, 0);
  assert.equal((await loadServiceContentFields([ID], null)).size, 0);
  assert.equal(selects.length, 0);
});
