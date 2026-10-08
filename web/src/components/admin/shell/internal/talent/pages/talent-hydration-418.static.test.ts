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

// TUL-303: the legacy Today page (TALENT_AGENDA_V2 off, the default) renders
// server-side, so everything it mounts must be clock/locale stable.
test("legacy Today children do not format with the host locale or read the clock before hydration", () => {
  for (const f of ["../shared/today-1.tsx", "../shared/today-2.tsx", "../shared/earnings-tile-1.tsx"]) {
    const src = strip(read(f));
    assert.doesNotMatch(src, /\.toLocaleString\(\)/, `${f}: toLocaleString() uses the host locale`);
  }
  const week = strip(read("../shared/week-rhythm-1.tsx"));
  assert.match(week, /useHydrated\(\)/);
  assert.ok(week.indexOf("if (!hydrated)") > week.indexOf("useMemo(() => todayLocal()"));
  assert.ok(week.indexOf("if (!hydrated)") < week.indexOf("todayDate.getDay()"), "week math must sit behind the gate");
  const age = read("../shared/today-3.tsx");
  assert.equal((age.match(/<span suppressHydrationWarning/g) ?? []).length, 2, "only the two age leaf spans");
});

test("pinned number formatting is identical across process locale and timezone", async () => {
  const { execFileSync } = await import("node:child_process");
  const run = (env: Record<string, string>) =>
    execFileSync(
      process.execPath,
      ["-e", 'process.stdout.write((6800).toLocaleString("en-US") + "|" + (1234567).toLocaleString("en-US"))'],
      { env: { ...process.env, ...env }, encoding: "utf8" },
    );
  const utc = run({ TZ: "UTC", LC_ALL: "en_US.UTF-8", LANG: "en_US.UTF-8" });
  const cancun = run({ TZ: "America/Cancun", LC_ALL: "es_ES.UTF-8", LANG: "es_ES.UTF-8" });
  assert.equal(utc, "6,800|1,234,567");
  assert.equal(cancun, utc);
});
