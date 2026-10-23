import test from "node:test";
import assert from "node:assert/strict";

import { bandSummaryLabel } from "./band-summary-label";

test("TUL-1923: a name that already holds the range gets no second range (es + en)", () => {
  assert.equal(bandSummaryLabel({ name: "Mesas de 1 a 4", partyMin: 1, partyMax: 4 }, true), "Mesas de 1 a 4");
  assert.equal(bandSummaryLabel({ name: "Tables of 1 to 4", partyMin: 1, partyMax: 4 }, false), "Tables of 1 to 4");
});

test("TUL-1923: a plain name keeps its range", () => {
  assert.equal(bandSummaryLabel({ name: "Terraza", partyMin: 2, partyMax: 6 }, true), "Terraza (2 a 6)");
  assert.equal(bandSummaryLabel({ name: "Patio", partyMin: 2, partyMax: 6 }, false), "Patio (2 to 6)");
});

test("TUL-1923: a name with only one of the numbers keeps the range", () => {
  assert.equal(bandSummaryLabel({ name: "Mesas de 4", partyMin: 1, partyMax: 4 }, true), "Mesas de 4 (1 a 4)");
});
