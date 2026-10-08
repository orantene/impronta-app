import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { localiseMobileHealthMessage } from "./mobile-health-message-es";

const SAMPLES = [
  "Text node has 9px effective font-size on mobile (minimum: 12px). Increase the base or mobile font-size override.",
  "Button has width 20px — below the 44px minimum tap target. Increase size or remove the explicit dimension.",
  "Row container with buttons/icons has no gap on mobile — tap targets will touch. Add a gap token (s/m/l) or set a mobile stack layout.",
  'Container has 3-column grid with no mobile stack override — likely horizontal overflow on phones. Set mobile layout to "stack" or add flex-wrap.',
  'Container has 4-item row with no mobile stack override — likely horizontal overflow on phones. Set mobile layout to "stack" or add flex-wrap.',
  'Split block has "collapseOnMobile: false" — both columns will stay side-by-side on phones, likely causing content squeeze or overflow.',
  "Node has fixed width 800px, which exceeds the narrowest mobile viewport (390px). It forces a horizontal scrollbar on phones. Use a relative width (%, 100%) or a mobile width override.",
  "This menu opens off-canvas, but an ancestor block uses a backdrop blur or filter, which pins the panel to that block instead of the screen. Clear the blur on the mobile breakpoint so the menu can cover the full screen.",
  "This block is set to Fixed, but an ancestor block uses a blur, filter or transform, which pins it to that block instead of the browser window. Clear that effect on the ancestor, or move this block higher up the page.",
];

test("every dynamic mobile-health message has an ES template", () => {
  for (const s of SAMPLES) {
    const es = localiseMobileHealthMessage(s, "es");
    assert.notEqual(es, s, s.slice(0, 40));
    assert.equal(localiseMobileHealthMessage(s, "en"), s);
  }
  assert.match(localiseMobileHealthMessage(SAMPLES[6]!, "es"), /800px.*390px/);
});

test("samples mirror the messages in mobile-health.ts", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/site-admin/builder-node/mobile-health.ts"), "utf8");
  for (const frag of ["effective font-size on mobile", "minimum tap target", "has no gap on mobile", "no mobile stack override", "collapseOnMobile", "exceeds the narrowest mobile viewport", "opens off-canvas", "is set to Fixed"]) {
    assert.ok(src.includes(frag), frag);
  }
});

test("unknown message passes through", () => {
  assert.equal(localiseMobileHealthMessage("Something new", "es"), "Something new");
});
