import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createPrintAdapter,
  buildPrintComposition,
  type PrintAdapterActions,
  type PrintDesignRow,
} from "./print-adapter-core";

const ROW: PrintDesignRow = {
  id: "pd1",
  name: "Table tent",
  size: "table_tent",
  builder_tree: [],
  version: 3,
};

function spy(over: Partial<PrintAdapterActions> = {}): PrintAdapterActions {
  return {
    async loadPrintDesign() {
      return ROW;
    },
    async savePrintDesign({ expectedVersion }) {
      return { ok: true, version: expectedVersion + 1 };
    },
    ...over,
  };
}

const ctx = { locale: "en", pageId: "pd1" };

test("buildPrintComposition maps a row to the editor envelope", () => {
  const data = buildPrintComposition(ROW, "en");
  assert.equal(data.pageId, "pd1");
  assert.equal(data.pageVersion, 3);
  assert.equal(data.metadata.title, "Table tent");
  assert.deepEqual(data.builderTree, []);
  // A print piece is not a public page.
  assert.equal(data.metadata.noindex, true);
});

test("buildPrintComposition derives the fixed mm artboard from size (bleed included)", () => {
  // table_tent = 100×150 mm; bleed is 3 mm per the ruled model (2).
  const data = buildPrintComposition(ROW, "en");
  assert.deepEqual(data.printArtboard, {
    widthMm: 100,
    heightMm: 150,
    bleedMm: 3,
  });
});

test("buildPrintComposition falls back to table_tent for an unknown size (never throws)", () => {
  const data = buildPrintComposition({ ...ROW, size: "bogus" }, "en");
  assert.deepEqual(data.printArtboard, {
    widthMm: 100,
    heightMm: 150,
    bleedMm: 3,
  });
});

test("load returns the composition for the open design", async () => {
  const a = createPrintAdapter(spy());
  const res = await a.load(ctx);
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.data.pageVersion, 3);
});

test("load refuses when no design is open", async () => {
  const a = createPrintAdapter(spy());
  const res = await a.load({ locale: "en" });
  assert.equal(res.ok, false);
});

test("save advances the version (OCC) and returns it", async () => {
  const a = createPrintAdapter(spy());
  const res = await a.save(ctx, { builderTree: [], expectedVersion: 3 } as never);
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.pageVersion, 4);
});

test("save surfaces a concurrent-edit refusal, never a silent clobber", async () => {
  const a = createPrintAdapter(
    spy({
      async savePrintDesign() {
        return { ok: false, error: "changed in another tab" };
      },
    }),
  );
  const res = await a.save(ctx, { builderTree: [], expectedVersion: 3 } as never);
  assert.equal(res.ok, false);
});

test("publish refuses — a print design exports to a PDF, it does not go live", async () => {
  const a = createPrintAdapter(spy());
  const res = await a.publish(ctx, { expectedVersion: 3 } as never);
  assert.equal(res.ok, false);
});
