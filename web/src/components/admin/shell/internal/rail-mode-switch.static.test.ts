import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), "utf8");

// A dual owner (talent + business workspace) must be able to switch hats from
// BOTH rails. One shared component keeps the labels and the position identical.
test("the talent rail renders the shared Talent | Admin switch for dual owners only", () => {
  const talent = read("talent.tsx");
  assert.match(talent, /import \{ RailModeSwitch \} from "\.\/page-modules\/RailModeSwitch"/);
  assert.match(talent, /state\.alsoTalent && \(\s*<RailModeSwitch\s+active="talent"/);
  assert.match(talent, /onSwitch=\{flipMode\}/);
  // The switch sits ABOVE the section nav (top of the rail), as on the admin rail.
  assert.ok(talent.indexOf("<RailModeSwitch") < talent.indexOf('aria-label={copy.t("Talent sections")}'));
});

test("the admin rail uses the same component, no private copy of the markup", () => {
  const ws = read("page-modules/WorkspaceShell.tsx");
  assert.match(ws, /import \{ RailModeSwitch \} from "\.\/RailModeSwitch"/);
  assert.match(ws, /<RailModeSwitch\s+active="admin"/);
  assert.doesNotMatch(ws, /function RailModeSwitch/);
});

test("both halves carry en labels from the catalog and a link on the other hat", () => {
  const sw = read("page-modules/RailModeSwitch.tsx");
  for (const k of ["Switch between Talent and Admin", "Switch to talent", "Switch to admin", "Talent", "Admin"]) {
    assert.ok(sw.includes(`copy.t("${k}")`), k);
  }
  const i18n = read("dashboard-i18n.ts") + read("dashboard-i18n-rail.ts");
  for (const k of ["Switch to admin", "Go to your admin workspace", "Switch to talent"]) {
    assert.match(i18n, new RegExp(`"${k}": "`), k);
  }
});
