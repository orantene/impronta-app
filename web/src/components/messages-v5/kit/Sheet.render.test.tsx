import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { Btn } from "./primitives";
import { Sheet } from "./Sheet";
import { EN_COPY } from "./test-copy";

const noop = () => {};

test("closed renders nothing; desktop 520 / 560 / 600 with title, avatar, close, body, hint + footer", () => {
  assert.equal(renderToStaticMarkup(<Sheet open={false} title="Request payment" copy={EN_COPY} onClose={noop} />), "");
  const html = renderToStaticMarkup(
    <Sheet open title="Request payment" copy={EN_COPY} onClose={noop} avatarName="Valentina Ruiz" hint="Nothing is charged until she pays" footer={<Btn variant="primary">Send link</Btn>}>
      <p>body</p>
    </Sheet>,
  );
  assert.match(html, /<button[^>]*class="scrim" aria-label="Close"/);
  assert.match(html, /class="sheet" role="dialog" aria-modal="true" aria-labelledby="msgv5-sheet-request-payment" data-sheet="desktop"/);
  assert.match(html, /avatar sm/);
  assert.match(html, /<h3 id="msgv5-sheet-request-payment">Request payment<\/h3>/);
  assert.match(html, /class="x"[^>]*aria-label="Close"/);
  assert.match(html, /class="sb"><p>body<\/p>/);
  assert.match(html, /class="sf"><span class="hint">Nothing is charged until she pays<\/span><button[^>]*btn primary[^>]*>Send link/);
  assert.match(renderToStaticMarkup(<Sheet open title="Offer v3" copy={EN_COPY} onClose={noop} width={560} />), /class="sheet w560"/);
  assert.match(renderToStaticMarkup(<Sheet open title="Items" copy={EN_COPY} onClose={noop} width={600} />), /class="sheet w600"/);
  assert.doesNotMatch(html, /style=/);
});

test("mobile h60 / h92 have a drag handle and a sticky footer; full screen has the top close", () => {
  const h60 = renderToStaticMarkup(<Sheet open title="Filter" copy={EN_COPY} onClose={noop} variant="mobile-h60" footer={<Btn>Clear</Btn>} />);
  assert.match(h60, /class="mx-sheet h60" role="dialog"/);
  assert.match(h60, /class="grab" aria-hidden="true" title="Drag to resize"/);
  assert.match(h60, /class="sf"><button/);
  const h92 = renderToStaticMarkup(<Sheet open title="Add items" copy={EN_COPY} onClose={noop} variant="mobile-h92" tight />);
  assert.match(h92, /mx-sheet h92/);
  assert.match(h92, /class="sb tight"/);
  const full = renderToStaticMarkup(<Sheet open title="Offer v3" subtitle="Beach wedding · Aug 14" copy={EN_COPY} onClose={noop} variant="mobile-full" footer={<Btn size="xl" variant="primary" fill>Send</Btn>} />);
  assert.match(full, /class="mx-full" role="dialog"/);
  assert.match(full, /class="fh"><button[^>]*class="close"/);
  assert.match(full, /<b id="[^"]+">Offer v3<\/b><span>Beach wedding · Aug 14<\/span>/);
  assert.match(full, /class="ff"><button/);
  assert.doesNotMatch(full, /scrim/);
});
