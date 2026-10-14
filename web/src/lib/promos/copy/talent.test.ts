import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PROMO_COPY_ES } from "./talent";

const ROOT = join(__dirname, "..", "..", "..");
const FILES = [
  ...readdirSync(join(ROOT, "components/promos/talent")).map((f) => join(ROOT, "components/promos/talent", f)),
  join(ROOT, "lib/promos/templates.ts"),
];
const PREFIX = "page|month|tab|empty|picker|free|info|tpl|holiday|status|card|offer|weekday|create|dates|spots|pct|days|more|who|unlock|paid|preview|earn|nudge|action|detail|edit|field|upgrade|gate|downgrade|header|toast|err";

test("every copy key literal used by the talent Promos UI exists", () => {
  const keys = new Set(Object.keys(PROMO_COPY_ES));
  const literal = new RegExp(`"((?:${PREFIX})\\.[A-Za-z0-9_.]+)"`, "g");
  let checked = 0;
  for (const file of FILES) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(literal)) {
      checked += 1;
      assert.ok(keys.has(m[1]!), `${file}: missing copy key ${m[1]}`);
    }
  }
  assert.ok(checked > 40, "scanned the UI sources");
});

test("every dynamic key family has members", () => {
  const keys = Object.keys(PROMO_COPY_ES);
  const families = [
    "status.", "tab.", "tab.empty.", "preview.", "dates.", "who.", "unlock.", "field.", "err.", "weekday.", "tpl.", "holiday.",
  ];
  for (const f of families) assert.ok(keys.some((k) => k.startsWith(f)), f);
  for (const d of [0, 1, 2, 3, 4, 5, 6]) assert.ok(`weekday.${d}` in PROMO_COPY_ES);
  for (const t of ["fill_week", "slow_day", "last_minute", "free_extra", "secret_code", "launch", "holiday", "come_back", "custom"]) {
    assert.ok(`tpl.${t}` in PROMO_COPY_ES && `tpl.${t}.sub` in PROMO_COPY_ES, t);
  }
  for (const s of ["draft", "archived", "paused", "scheduled", "live", "sold_out", "expired"]) assert.ok(`status.${s}` in PROMO_COPY_ES, s);
  for (const e of ["name", "value", "value_cap", "addon", "code", "dates", "max_uses", "time", "customer"]) assert.ok(`err.${e}` in PROMO_COPY_ES, e);
  for (const a of ["public", "new_clients", "returning", "lapsed"]) assert.ok(`who.${a}` in PROMO_COPY_ES, a);
  for (const f of ["offer_kind", "code", "audience"]) assert.ok(`field.${f}` in PROMO_COPY_ES, f);
});
