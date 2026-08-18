/**
 * WAVE1-1.5 — generic revision-then-version commit.
 *
 * DoD:
 *   1. injected revision-write failure → ZERO cms_pages UPDATEs
 *   2. happy path writes the revision at the version it claims, then UPDATEs
 *   3. CAS miss deletes the minted revision
 *
 * Run:
 *   NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' \
 *     npx tsx --test src/lib/site-admin/server/page-revision-commit.test.ts
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { commitPageRevisionThenVersion } from "./page-revision-commit";

const TENANT = "11111111-1111-4111-8111-111111111111";
const PAGE_ID = "22222222-2222-4222-8222-222222222222";

interface RecordedCall {
  table: string;
  method: "select" | "insert" | "update" | "delete";
  payload?: unknown;
  eqs: Array<[string, unknown]>;
}

function makeSupabase(cfg: {
  failRevisionInsert?: boolean;
  casMiss?: boolean;
  casError?: boolean;
}) {
  const calls: RecordedCall[] = [];

  function from(table: string) {
    const rec: RecordedCall = { table, method: "select", eqs: [] };
    calls.push(rec);
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    Object.assign(chain, {
      insert(payload: unknown) {
        rec.method = "insert";
        rec.payload = payload;
        return self();
      },
      update(payload: unknown) {
        rec.method = "update";
        rec.payload = payload;
        return self();
      },
      delete() {
        rec.method = "delete";
        return self();
      },
      select() {
        return self();
      },
      eq(col: string, val: unknown) {
        rec.eqs.push([col, val]);
        return self();
      },
      maybeSingle() {
        if (rec.table === "cms_pages" && rec.method === "update") {
          if (cfg.casError) {
            return Promise.resolve({
              data: null,
              error: { message: "cas blew up" },
            });
          }
          if (cfg.casMiss) {
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: { id: PAGE_ID }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      then(
        resolve: (v: { data: unknown; error: { message: string } | null }) => unknown,
      ) {
        if (rec.table === "cms_page_revisions" && rec.method === "insert") {
          if (cfg.failRevisionInsert) {
            return Promise.resolve(
              resolve({ data: null, error: { message: "revision denied" } }),
            );
          }
          return Promise.resolve(resolve({ data: { id: "rev" }, error: null }));
        }
        if (rec.table === "cms_page_revisions" && rec.method === "delete") {
          return Promise.resolve(resolve({ data: null, error: null }));
        }
        return Promise.resolve(resolve({ data: null, error: null }));
      },
    });
    return chain;
  }

  return { client: { from } as unknown as SupabaseClient, calls };
}

function commitArgs() {
  return {
    tenantId: TENANT,
    pageId: PAGE_ID,
    beforeVersion: 5,
    update: { version: 6, title: "About" },
    revision: {
      kind: "draft" as const,
      version: 6,
      templateSchemaVersion: 1,
      snapshot: { title: "About", version: 6 },
    },
    actorProfileId: "actor",
  };
}

describe("commitPageRevisionThenVersion", () => {
  test("injected revision failure performs zero cms_pages UPDATEs", async () => {
    const { client, calls } = makeSupabase({ failRevisionInsert: true });
    const result = await commitPageRevisionThenVersion(client, commitArgs());
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "revision_insert");
    assert.equal(
      calls.filter((c) => c.table === "cms_pages" && c.method === "update").length,
      0,
    );
  });

  test("happy path inserts the revision at the claimed version, then UPDATEs", async () => {
    const { client, calls } = makeSupabase({});
    const result = await commitPageRevisionThenVersion(client, commitArgs());
    assert.equal(result.ok, true);
    const methods = calls.map((c) => `${c.table}:${c.method}`);
    assert.deepEqual(methods.slice(0, 2), [
      "cms_page_revisions:insert",
      "cms_pages:update",
    ]);
    const insert = calls.find(
      (c) => c.table === "cms_page_revisions" && c.method === "insert",
    );
    assert.ok(insert);
    const payload = insert.payload as { version: number; kind: string };
    assert.equal(payload.version, 6);
    assert.equal(payload.kind, "draft");
  });

  test("CAS miss deletes the minted revision", async () => {
    const { client, calls } = makeSupabase({ casMiss: true });
    const result = await commitPageRevisionThenVersion(client, commitArgs());
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "cas_conflict");
    const del = calls.find(
      (c) => c.table === "cms_page_revisions" && c.method === "delete",
    );
    assert.ok(del, "orphan revision must be compensated");
  });
});
