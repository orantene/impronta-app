import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { guardSupportSend, supportSendErrorText } from "./support-send-error";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("a rejected send becomes a failed result with the network inline error (ES+EN)", async () => {
  const r = await guardSupportSend(async () => {
    throw new TypeError("Failed to fetch");
  });
  assert.equal(r.ok, false);
  for (const l of ["en", "es"]) {
    const m = JSON.parse(read(`messages/${l}.json`)).dashboard.adminSupport;
    const text = supportSendErrorText((k) => m[k.split(".").pop() as string], r as { code: string });
    assert.equal(text, m.sendFailedNetwork);
    assert.ok(!text.includes("—"));
  }
  assert.equal(JSON.parse(read("messages/es.json")).dashboard.adminSupport.sendFailedNetwork, "No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.");
});

test("Home ask, Message Oran and thread reply all go through the guard", () => {
  const panel = read("src/components/support/SupportPanel.tsx");
  assert.match(panel, /await guardSupportSend\(\(\) => contract\.createTicket\(\{\s*tenantSlug: contract\.tenantSlug,\s*surface: contract\.surface,\s*body,/);
  assert.match(panel, /await guardSupportSend\(\(\) => contract\.createTicket\(\{[\s\S]*messageOranDirectly/);
  assert.match(panel, /await guardSupportSend\(\(\) => contract\.sendMessage/);
  assert.ok(panel.split("\n").length <= 800);
});
