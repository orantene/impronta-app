import assert from "node:assert/strict";
import test from "node:test";

import { planOfferingSlugRename, type SlugRow } from "./offering-slug-rename";

const row = (over: Partial<SlugRow> = {}): SlugRow => ({ id: "r1", locale: "es", slug: "masaje-relajante", isCurrent: true, ...over });
const base = { oldTitle: "Masaje relajante", newTitle: "Masaje profundo", rows: [row()], takenByLocale: new Map<string, ReadonlySet<string>>() };

test("a slug that followed the title follows the rename; the old one becomes history", () => {
  const plan = planOfferingSlugRename(base);
  assert.deepEqual(plan, [{ kind: "retire", rowId: "r1" }, { kind: "insert", locale: "es", slug: "masaje-profundo" }]);
});

test("a custom slug the owner chose is never changed by a rename", () => {
  assert.deepEqual(planOfferingSlugRename({ ...base, rows: [row({ slug: "mi-masaje" })] }), []);
});

test("a numbered derived slug (-2) still counts as derived and gets a fresh numbered slug if taken", () => {
  const plan = planOfferingSlugRename({
    ...base,
    rows: [row({ slug: "masaje-relajante-2" })],
    takenByLocale: new Map([["es", new Set(["masaje-profundo"])]]),
  });
  assert.deepEqual(plan, [{ kind: "retire", rowId: "r1" }, { kind: "insert", locale: "es", slug: "masaje-profundo-2" }]);
});

test("a title that does not change the slug, or an unusable new title, changes nothing", () => {
  assert.deepEqual(planOfferingSlugRename({ ...base, newTitle: "Masaje   Relajante!" }), []);
  assert.deepEqual(planOfferingSlugRename({ ...base, newTitle: "???" }), []);
  assert.deepEqual(planOfferingSlugRename({ ...base, newTitle: "Services" }), []);
  assert.deepEqual(planOfferingSlugRename({ ...base, newTitle: "1a2b3c4d" }), []);
});

test("going back to a title this service already used re-promotes the history row instead of inserting a duplicate", () => {
  const plan = planOfferingSlugRename({
    ...base,
    rows: [row(), row({ id: "r0", slug: "masaje-profundo", isCurrent: false })],
    takenByLocale: new Map([["es", new Set(["masaje-relajante", "masaje-profundo"])]]),
  });
  assert.deepEqual(plan, [{ kind: "retire", rowId: "r1" }, { kind: "promote", rowId: "r0" }]);
});

test("another service's slug is never taken or stolen", () => {
  const plan = planOfferingSlugRename({ ...base, takenByLocale: new Map([["es", new Set(["masaje-profundo"])]]) });
  assert.deepEqual(plan, [{ kind: "retire", rowId: "r1" }, { kind: "insert", locale: "es", slug: "masaje-profundo-2" }]);
});

test("each locale is planned on its own; history rows are never retired again; locales without a current row are skipped", () => {
  const plan = planOfferingSlugRename({
    ...base,
    oldTitle: "Relaxing massage",
    newTitle: "Deep massage",
    rows: [
      row({ id: "e1", locale: "en", slug: "relaxing-massage" }),
      row({ id: "s1", locale: "es", slug: "masaje-relajante" }),
      row({ id: "h1", locale: "en", slug: "old-thing", isCurrent: false }),
    ],
  });
  assert.deepEqual(plan, [{ kind: "retire", rowId: "e1" }, { kind: "insert", locale: "en", slug: "deep-massage" }]);
});

test("only the first 20 locales are planned (bounded)", () => {
  const rows = Array.from({ length: 40 }, (_, i) => row({ id: `r${i}`, locale: `l${String(i).padStart(2, "a")}`.slice(0, 3), slug: "masaje-relajante" }));
  const plan = planOfferingSlugRename({ ...base, rows });
  assert.ok(plan.length <= 40);
});
