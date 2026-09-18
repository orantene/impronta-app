import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { MESSAGING_REFUSAL_CODES } from "@/lib/messaging/refusals";

import { AlertLine, OkLine, RefusalLine } from "./RefusalLine";
import { EN_COPY, ES_COPY } from "./test-copy";

test("every refusal code renders its catalogue sentence, never the code", () => {
  for (const code of MESSAGING_REFUSAL_CODES) {
    const html = renderToStaticMarkup(<RefusalLine code={code} copy={EN_COPY} />);
    assert.match(html, new RegExp(`class="refuse" role="alert" data-refusal="${code}"`));
    assert.doesNotMatch(html, new RegExp(`<b>${code}</b>`));
    assert.doesNotMatch(html, /dashboard\.pos/);
  }
  assert.match(renderToStaticMarkup(<RefusalLine code="hold_ended" copy={ES_COPY} />), /reserva|espera/i);
});

test("refusal with one action; ok line; alert line with and without action; mobile variants", () => {
  const withFix = renderToStaticMarkup(<RefusalLine code="identity_unconfirmed" copy={EN_COPY} action={{ label: "Capture identity", onClick: () => {} }} />);
  assert.match(withFix, />Capture identity<\/button>/);
  assert.match(renderToStaticMarkup(<RefusalLine code="conflict" copy={EN_COPY} action={{ label: "Reload", onClick: () => {}, busy: true }} />), /aria-busy="true"/);
  assert.match(renderToStaticMarkup(<OkLine text="Deposit received" />), /class="okline" role="status" data-ok-line[^>]*>.*Deposit received/);
  assert.match(renderToStaticMarkup(<AlertLine text="Hold expires in 3 min" />), /class="alertline"/);
  assert.match(renderToStaticMarkup(<AlertLine text="Hold expires" action={{ label: "Extend", onClick: () => {} }} />), />Extend<\/button>/);
  assert.match(renderToStaticMarkup(<RefusalLine code="expired" copy={EN_COPY} variant="mobile" />), /mx-line err/);
  assert.match(renderToStaticMarkup(<OkLine text="ok" variant="mobile" />), /mx-line ok/);
  assert.match(renderToStaticMarkup(<AlertLine text="a" variant="mobile" />), /mx-line warn/);
});
