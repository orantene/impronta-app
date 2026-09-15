import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { WhatsAppWebFrame } from "./WhatsAppWebFrame";

test("live WhatsApp frame is the Web viewer, not the Messages inbox", () => {
  const html = renderToStaticMarkup(
    <WhatsAppWebFrame viewUrl="http://127.0.0.1:8788/view?tenant=t1" />,
  );
  assert.match(html, /data-tulala-whatsapp-web/);
  assert.doesNotMatch(html, /data-pos-messages-empty/);
  assert.doesNotMatch(html, /MessagesShell/);
});
