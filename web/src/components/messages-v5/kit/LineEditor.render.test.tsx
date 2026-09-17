import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { LineEditorRow } from "./LineEditor";
import { EN_COPY } from "./test-copy";

const base = { avatarName: "Sofía Herrera", name: "Sofía Herrera · hostess", sub: "2 days", units: "2", price: "$1,400", copy: EN_COPY, onUnits: () => {}, onPrice: () => {}, onMore: () => {} };

test("ready: avatar, name, sub, units, price, more; proposed-by and confirmed flags", () => {
  const html = renderToStaticMarkup(<LineEditorRow {...base} proposedBy="client" proposedByName="Diego" confirmed />);
  assert.match(html, /class="line-ed" data-line-row=/);
  assert.match(html, />SH</);
  assert.match(html, /<b>Sofía Herrera · hostess<span class="lineflag client">Diego chose<\/span><span class="lineflag ok">confirmed<\/span><\/b><span>2 days<\/span>/);
  assert.match(html, /<input[^>]*class="in"[^>]*value="2"/);
  assert.match(html, /<input[^>]*class="in"[^>]*value="\$1,400"/);
  assert.match(html, /aria-label="More"/);
  assert.doesNotMatch(html, /style=/);
  const staff = renderToStaticMarkup(<LineEditorRow {...base} proposedBy="staff" priceSnapshot="$1,300" edited />);
  assert.match(staff, /lineflag">you added/);
  assert.match(staff, /lineflag warn">was \$1,300/);
  assert.match(staff, /lineflag">edited/);
});

test("removed: struck, kept in history, Restore; unavailable: busy pill, cannot be added; read-only and busy; mobile", () => {
  const removed = renderToStaticMarkup(<LineEditorRow {...base} removed={{ by: "you" }} onRestore={() => {}} />);
  assert.match(removed, /line-ed removed/);
  assert.match(removed, /removed by you · kept in history/);
  assert.match(removed, /aria-label="Restore"/);
  assert.match(removed, /<input[^>]*disabled=""/);
  const busyDay = renderToStaticMarkup(<LineEditorRow {...base} name="Lucía M. · hostess" unavailable={{ date: "Aug 14" }} />);
  assert.match(busyDay, /line-ed unavailable/);
  assert.match(busyDay, /pill lost">busy Aug 14/);
  assert.match(busyDay, /cannot be added/);
  const ro = renderToStaticMarkup(<LineEditorRow {...base} readOnly />);
  assert.match(ro, /in ro" readOnly=""/);
  assert.match(renderToStaticMarkup(<LineEditorRow {...base} busy />), /aria-busy="true"/);
  assert.match(renderToStaticMarkup(<LineEditorRow {...base} variant="mobile" icon="pkg" />), /class="mx-line-ed"/);
});
