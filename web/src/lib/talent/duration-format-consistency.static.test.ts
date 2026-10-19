import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { durationLabel } from "./duration-label";

// TUL-551: public pages printed the same 90-minute service three ways
// ("90 MIN", "1 H", "1 h 30 min"). Every public duration goes through
// `durationLabel`, so one format wins: "45 min", "2 h", "1 h 30 min".

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

test("durationLabel is the one format", () => {
  assert.equal(durationLabel(45), "45 min");
  assert.equal(durationLabel(60), "1 h");
  assert.equal(durationLabel(90), "1 h 30 min");
  assert.equal(durationLabel(120), "2 h");
});

test("public duration surfaces use durationLabel, not their own formatting", () => {
  const surfaces = [
    ["src", "app", "t", "[profileCode]", "_shared", "StorefrontBody.tsx"],
    ["src", "app", "t", "[profileCode]", "_shared", "OfferingInstantMount.tsx"],
    ["src", "app", "t", "[profileCode]", "_chat", "CardChatExtras.tsx"],
    ["src", "app", "t", "[profileCode]", "_chat", "guest-instant-answer.ts"],
    ["src", "lib", "talent-site", "service-page.ts"],
    ["src", "components", "public-booking", "CatalogBookingSheet.tsx"],
  ];
  for (const s of surfaces) {
    const src = read(...s);
    assert.match(src, /durationLabel/, `${s.join("/")} does not use durationLabel`);
    assert.doesNotMatch(
      src,
      /\$\{[^}]*(?:minutes|Minutes)\} min\b/,
      `${s.join("/")} formats minutes by hand`,
    );
  }
});
