import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_WHATSAPP_WEB_ORIGIN,
  loopbackWorkerOrigin,
  whatsappWebViewUrl,
} from "./web-view-url";

test("browser view URL stays on loopback and never forwards a Docker hostname", () => {
  assert.equal(loopbackWorkerOrigin(undefined), DEFAULT_WHATSAPP_WEB_ORIGIN);
  assert.equal(loopbackWorkerOrigin("http://127.0.0.1:8791"), "http://127.0.0.1:8791");
  assert.equal(loopbackWorkerOrigin("http://localhost:8788/"), "http://localhost:8788");
  assert.equal(loopbackWorkerOrigin("http://channel-worker:8788"), DEFAULT_WHATSAPP_WEB_ORIGIN);

  assert.equal(
    whatsappWebViewUrl("t1", "http://127.0.0.1:8791"),
    "http://127.0.0.1:8791/view?tenant=t1",
  );
  assert.equal(
    whatsappWebViewUrl("t1"),
    `${DEFAULT_WHATSAPP_WEB_ORIGIN}/view?tenant=t1`,
  );
});
