import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  findServiceDuplicate,
  loadMaisonStarterCatalog,
  normalizeServiceMatchKey,
  plannedServiceDraftCount,
  selectionSummaryLine,
  emptyImportSelection,
} from "./maison-starter-catalog";

describe("maison-starter-catalog", () => {
  test("W44/W47: 13 items, no images group when preview-only", () => {
    const c = loadMaisonStarterCatalog();
    assert.equal(c.counts.total, 13);
    assert.equal(c.services.length, 6);
    assert.equal(c.faqs.length, 4);
    assert.equal(c.sectionText.length, 3);
    assert.equal(c.imagesLicensedForReuse, false);
  });

  test("W52: duplicate match on name+category (Vale Manicura en gel)", () => {
    const c = loadMaisonStarterCatalog();
    const manicura = c.services.find((s) => s.name === "Manicura en gel");
    assert.ok(manicura);
    const dup = findServiceDuplicate(manicura!, [
      { id: "o1", title: "Manicura en gel", category: "Uñas" },
    ]);
    assert.equal(dup?.id, "o1");
    assert.equal(
      normalizeServiceMatchKey("Manicura en gel", "Uñas"),
      normalizeServiceMatchKey("manicura en gel", "unas"),
    );
  });

  test("W53: keep_existing does not count as a draft", () => {
    const keys = ["svc:a", "svc:b"];
    const n = plannedServiceDraftCount(
      keys,
      { "svc:a": "keep_existing", "svc:b": "add_as_draft" },
      {
        "svc:a": { id: "x", title: "A", category: "Uñas" },
        "svc:b": { id: "y", title: "B", category: "Uñas" },
      },
    );
    assert.equal(n, 1);
  });

  test("W51: empty selection summary", () => {
    assert.match(selectionSummaryLine(emptyImportSelection(), "en"), /Nothing selected/);
  });
});
