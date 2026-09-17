import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { PanelSection, SummaryBlock } from "./Panel";
import { EN_COPY } from "./test-copy";

test("summary: who, identity · phone, Next / Main / Amount; loading shows skeleton bars", () => {
  const html = renderToStaticMarkup(<SummaryBlock name="Valentina Ruiz" identityLabel="identity confirmed" phone="+52 998 123 4411" next="Reply, then remind Jul 31" main="Offer v2 · awaiting acceptance" amount="$3,800 · $0 paid" copy={EN_COPY} />);
  assert.match(html, /class="summary" data-summary/);
  assert.match(html, /<b>Valentina Ruiz<\/b><span>identity confirmed · \+52 998 123 4411</);
  assert.match(html, /<dt>Next<\/dt><dd><b>Reply, then remind Jul 31<\/b>/);
  assert.match(html, /<dt>Main<\/dt><dd>Offer v2 · awaiting acceptance/);
  assert.match(html, /<dt>Amount<\/dt><dd>\$3,800 · \$0 paid/);
  const loading = renderToStaticMarkup(<SummaryBlock name="Visitor" isVisitor identityLabel="not identified" next="" main="" amount="" copy={EN_COPY} loading />);
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /avatar anon/);
  assert.match(loading, /class="sk w70"/);
});

test("section open with an action; closed with a count and a toggle; mobile accordion", () => {
  const open = renderToStaticMarkup(
    <PanelSection title="Money" open copy={EN_COPY} action={{ label: "Open", onClick: () => {} }}>
      <div className="money-line">x</div>
    </PanelSection>,
  );
  assert.match(open, /class="pn-sec" data-panel-section="Money"/);
  assert.match(open, /<h4>Money<button[^>]*class="btn xs"[^>]*>Open<\/button><\/h4>/);
  assert.match(open, /money-line/);
  const closed = renderToStaticMarkup(<PanelSection title="Files" open={false} count={3} copy={EN_COPY} onToggle={() => {}} />);
  assert.match(closed, /pn-sec closed/);
  assert.match(closed, /aria-expanded="false"/);
  assert.match(closed, /class="cnt">3</);
  const mobile = renderToStaticMarkup(<PanelSection title="Files" open={false} count={3} copy={EN_COPY} variant="mobile" onToggle={() => {}} />);
  assert.match(mobile, /mx-sec closed/);
  assert.match(mobile, /<b>Files · 3<\/b>/);
  const mobileOpen = renderToStaticMarkup(<PanelSection title="Client" open copy={EN_COPY} variant="mobile" onToggle={() => {}}>body</PanelSection>);
  assert.match(mobileOpen, /aria-expanded="true"/);
  assert.match(mobileOpen, /class="bd">body/);
});
