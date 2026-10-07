import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// TUL-109: React #418 on /talent/today and /talent/services. Render code must
// not read the clock, localStorage, or format dates in the host timezone,
// because the server (UTC) and the browser (talent's zone) disagree.

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("Today and Services page components format no dates and read no clock in render", () => {
  for (const f of ["./TodayPage.tsx", "./ServicesPage.tsx"]) {
    const src = strip(read(f));
    assert.doesNotMatch(src, /\.toLocale\w*\(/, `${f}: unpinned toLocale*`);
    assert.doesNotMatch(src, /Date\.now\(\)|Math\.random\(\)/, `${f}: nondeterministic render`);
    // The only new Date() allowed is the one behind the hydration gate.
    const gate = src.indexOf("!hydrated");
    for (const m of src.matchAll(/new Date\(\)/g)) {
      assert.ok(gate >= 0 && m.index! > gate, `${f}: new Date() before the hydration gate`);
    }
  }
});

test("AgendaTodayPage only receives its clock from the gated TodayPage", () => {
  const today = strip(read("./TodayPage.tsx"));
  assert.ok(today.indexOf("!hydrated") < today.indexOf("<AgendaTodayPage"));
});

test("the always-mounted notifications bell does not read localStorage during render", () => {
  const src = strip(read("../../notifications-hub.tsx"));
  assert.doesNotMatch(src, /useState<[^>]*>\(\(\) => readSet\(/);
  assert.doesNotMatch(src, /useState\(\(\) => readSet\(/);
});
