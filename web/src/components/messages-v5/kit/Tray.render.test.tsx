import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { Tray, defaultTrayGroups } from "./Tray";
import { EN_COPY } from "./test-copy";

test("desktop tray: two groups, six + four rows, Template greyed as coming and disabled", () => {
  const html = renderToStaticMarkup(<Tray groups={defaultTrayGroups(EN_COPY)} onPick={() => {}} floating />);
  assert.match(html, /class="tray floating" role="menu"/);
  assert.match(html, /class="th">Send to the client</);
  assert.match(html, /class="th">This conversation</);
  assert.equal((html.match(/data-tray-item=/g) ?? []).length, 10);
  assert.match(html, /class="grid">/);
  assert.match(html, /class="list">/);
  assert.match(html, /class="ti off" disabled="" aria-disabled="true"[^>]*data-tray-item="template"/);
  assert.match(html, /coming · canned replies/);
  assert.match(html, /<b>Add items<\/b><span>talent, packages, tickets, tables<\/span>/);
  assert.doesNotMatch(html, /style=/);
});

test("mobile tray: mx-act rows under mx-gh headers, coming rows greyed", () => {
  const html = renderToStaticMarkup(<Tray groups={defaultTrayGroups(EN_COPY)} variant="mobile" onPick={() => {}} />);
  assert.match(html, /data-tray="mobile"/);
  assert.match(html, /class="mx-gh">Send to the client</);
  assert.match(html, /class="mx-act off" disabled=""/);
  assert.equal((html.match(/class="mx-act/g) ?? []).length, 10);
});
