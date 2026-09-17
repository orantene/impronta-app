import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { OptionRow } from "./OptionRow";

test("radio selected / unselected, with amount, disabled, static", () => {
  const on = renderToStaticMarkup(<OptionRow selected title="Deposit 30%" sub="$1,140 · balance on the day" amount="$1,140" onSelect={() => {}} />);
  assert.match(on, /<button[^>]*class="opt on" role="radio" aria-checked="true"/);
  assert.match(on, /class="rad"/);
  assert.match(on, /<b>Deposit 30%<\/b><span>\$1,140 · balance on the day<\/span>/);
  assert.match(on, /class="amt">\$1,140/);
  const off = renderToStaticMarkup(<OptionRow selected={false} title="Full amount" onSelect={() => {}} />);
  assert.match(off, /class="opt" role="radio" aria-checked="false"/);
  const disabled = renderToStaticMarkup(<OptionRow selected={false} title="Anto" sub="Booked Sep 20" disabled onSelect={() => {}} />);
  assert.match(disabled, /opt off[^>]*disabled=""/);
  const still = renderToStaticMarkup(<OptionRow selected title="Static" />);
  assert.match(still, /<div class="opt on" data-option-row/);
});

test("check control on mobile: filled green box with a check when selected", () => {
  const on = renderToStaticMarkup(<OptionRow selected title="Sofía Herrera" sub="Hostess · evening rate" amount="$700" control="check" variant="mobile" onSelect={() => {}} />);
  assert.match(on, /mx-opt2 on" role="checkbox" aria-checked="true"/);
  assert.match(on, /class="chk"[^>]*><svg/);
  const off = renderToStaticMarkup(<OptionRow selected={false} title="Custom line" control="check" variant="mobile" onSelect={() => {}} />);
  assert.match(off, /class="chk" aria-hidden="true"><\/span>/);
});
