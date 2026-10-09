/**
 * TUL-420: ThemeUpdateSheet shows What's new / What we keep / Decisions before Apply.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  UPDATE_COPY,
  decisionsLine,
  keptLine,
} from "../../../../lib/talent-site/theme-releases/talent-update/copy";
import { summarizeReport } from "../../../../lib/talent-site/theme-releases/talent-update/view";

const SRC = readFileSync(join(process.cwd(), "src/components/talent/site/theme-update/ThemeUpdateSheet.tsx"), "utf8");

test("TUL-420 sheet: three summary sections + (i) tips + one primary Apply", () => {
  assert.match(SRC, /data-theme-update-summary=\{?"whats-new"?\}|testId="whats-new"/);
  assert.match(SRC, /testId="we-keep"/);
  assert.match(SRC, /testId="decisions"/);
  assert.match(SRC, /InfoTip/);
  assert.match(SRC, /data-theme-update-apply/);
  assert.equal(UPDATE_COPY.sectionWhatsNew.en, "What's new");
  assert.equal(UPDATE_COPY.sectionWhatsNew.es, "Novedades");
  assert.equal(UPDATE_COPY.sectionWeKeep.es, "Lo que conservamos");
  assert.equal(UPDATE_COPY.sectionDecisions.es, "Decisiones pendientes");
  assert.ok(!UPDATE_COPY.tipWeKeep.en.includes("—"));
  assert.ok(!UPDATE_COPY.tipWeKeep.es.includes("—"));
});

test("TUL-420 decisionsLine: conflicts only; null when clean", () => {
  assert.equal(decisionsLine(summarizeReport({ applied: [], added: [], kept: [], conflicts: [] }), "en"), null);
  const withConflict = summarizeReport({
    applied: [],
    added: [],
    kept: [],
    conflicts: [{ key: "hero", change: "props", seq: 1, tree: "home" } as never],
  });
  assert.match(decisionsLine(withConflict, "en")!, /keep your version/i);
  assert.match(decisionsLine(withConflict, "es")!, /Conservamos tu versión/);
  assert.match(keptLine(withConflict, "en"), /have not changed|keep/i);
});
