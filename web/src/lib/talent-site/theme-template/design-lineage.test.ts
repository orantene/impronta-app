import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { demosFor } from "@/lib/talent-site/demos/registry";
import type { DemoDesign } from "@/lib/talent-site/demos/types";
import { designTokenDefaults } from "@/lib/talent-site/theme-catalog/collection/design-token-defaults";

import { designLineage, lineageFromRow, resolveDesignSource } from "./design-lineage.server";

function fakeAdmin(row: Record<string, unknown> | null) {
  const q: Record<string, unknown> = {};
  q.select = () => q;
  q.eq = () => q;
  q.maybeSingle = async () => ({ data: row, error: null });
  return { from: () => q } as unknown as SupabaseClient;
}

/** Mirrors canvas.server defaultSubjectFor (that module pulls the full render stack). */
const defaultSubjectFor = (d: string) => {
  const demos = demosFor(d as DemoDesign);
  return (demos.find((x) => x.reference) ?? demos[0])?.profileCode ?? null;
};

describe("designLineage", () => {
  it("returns the source for an authored row, null for code designs", async () => {
    const authored = fakeAdmin({ source: "authored", preview: { paletteSource: "folio" } });
    assert.equal(await designLineage("folio-studio-qa", authored), "folio");
    assert.equal(await designLineage("folio", fakeAdmin({ source: "code", preview: {} })), null);
    assert.equal(await designLineage("nope", fakeAdmin(null)), null);
    assert.equal(lineageFromRow({ source: "authored", preview: {} }), null);
  });

  it("resolveDesignSource falls back to the slug itself", async () => {
    assert.equal(await resolveDesignSource("folio", fakeAdmin(null)), "folio");
    assert.equal(
      await resolveDesignSource("folio-studio-qa", fakeAdmin({ source: "authored", preview: { paletteSource: "folio" } })),
      "folio",
    );
  });

  it("canvas inputs for an authored design come from the source's demos and tokens", async () => {
    const source = await resolveDesignSource(
      "folio-studio-qa",
      fakeAdmin({ source: "authored", preview: { paletteSource: "folio" } }),
    );
    assert.ok(demosFor(source as DemoDesign).length > 0);
    assert.equal(defaultSubjectFor(source), defaultSubjectFor("folio"));
    assert.notEqual(defaultSubjectFor(source), null);
    assert.deepEqual({ ...designTokenDefaults(source) }, { ...designTokenDefaults("folio") });
    assert.ok(Object.keys(designTokenDefaults(source)).length > 0);
    assert.equal(defaultSubjectFor("folio-studio-qa"), null);
  });
});
