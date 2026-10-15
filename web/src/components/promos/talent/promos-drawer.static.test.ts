import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const here = (f: string) => readFileSync(join(__dirname, f), "utf8");
const shell = (f: string) => readFileSync(join(__dirname, "../../admin/shell/internal", f), "utf8");

test("the header tag icon is a labelled 44px button that opens the promos drawer", () => {
  const h = here("PromosHeaderButton.tsx");
  assert.match(h, /openDrawer\("promos"\)/);
  assert.match(h, /<button\b/);
  assert.doesNotMatch(h, /<Link\b/);
  assert.match(h, /title=\{copy\.t\("header\.label"\)\}/);
  assert.match(h, /aria-label=/);
  assert.match(h, /after:h-11 after:w-11/);
  assert.match(h, /getPromoAttention/, "attention dot kept");
});

test("drawer id is registered and routed in the shell", () => {
  assert.match(shell("state/drawer-ids.ts"), /\| "promos"/);
  const sw = shell("drawer-switch.tsx");
  assert.match(sw, /case "promos":\s*return <PromosDrawerHost \/>/);
});

test("the drawer reads loadPromosPage with retry, can take injected data, and links out", () => {
  const d = here("PromosDrawer.tsx");
  assert.match(d, /loadPromosPage\(\)/);
  assert.match(d, /setInterval/);
  assert.match(d, /if \(!open \|\| injected\) return/);
  assert.match(d, /data-promos-drawer-skeleton/);
  assert.match(d, /href="\/talent\/promos\?picker=1"/);
  assert.match(d, /href="\/talent\/promos"/);
  assert.match(d, /drawer\.empty/);
  assert.match(here("PromosPage.tsx"), /params\.get\("picker"\) === "1"/);
});
