import test from "node:test";
import assert from "node:assert/strict";

import { checkCatalogFlip, flipCatalogToRelease } from "../release-design.server";

// F102 rule: releases apply in order; each snapshot is the FULL payload at its
// version, so Make default on 16 flips straight to 16 (15 is carried along).
// The catalog never moves backward: a release below the catalog is superseded.

test("checkCatalogFlip: forward flips, equal is a no-op, backward is refused", () => {
  assert.deepEqual(checkCatalogFlip(14, 16), { ok: true, flip: true });
  assert.deepEqual(checkCatalogFlip(14, 15), { ok: true, flip: true });
  assert.deepEqual(checkCatalogFlip(16, 16), { ok: true, flip: false });
  const back = checkCatalogFlip(16, 15);
  assert.equal(back.ok, false);
});

function flipAdmin(catalogVersion: number, snapshot: unknown) {
  const updates: unknown[] = [];
  const row = {
    id: "row-1",
    kind: "design",
    slug: "maison-v2",
    title: "t",
    summary: "s",
    version: catalogVersion,
    payload: { shellTree: [], homeTree: [], tokenDefaults: {} },
    schema_version: 1,
    status: "published",
    source: "builtin",
  };
  const admin = {
    from(table: string) {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: () =>
          Promise.resolve({ data: table === "talent_theme_catalog" ? row : snapshot ? { payload: snapshot } : null, error: null }),
        update: (arg: unknown) => {
          updates.push(arg);
          const u = { eq: () => u, select: () => Promise.resolve({ data: [{ id: "row-1" }], error: null }) };
          return u;
        },
      };
      return q;
    },
  };
  return { admin: admin as never, updates };
}

test("flipCatalogToRelease refuses a release below the catalog and writes nothing", async () => {
  const a = flipAdmin(16, { shellTree: [], homeTree: [], tokenDefaults: {} });
  const r = await flipCatalogToRelease(a.admin, { design_slug: "maison-v2", to_version: 15 });
  assert.equal(r.ok, false);
  assert.equal(a.updates.length, 0);
});
