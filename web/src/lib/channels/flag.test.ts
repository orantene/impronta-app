import assert from "node:assert/strict";
import test from "node:test";

import { isMessagingChannelsEnabledForTenant } from "./flag";

test("TULALA_WHATSAPP_TENANTS allow-list gates by id or slug and never falls through", async () => {
  const prev = { list: process.env.TULALA_WHATSAPP_TENANTS, drawer: process.env.TULALA_WHATSAPP_DRAWER };
  try {
    process.env.TULALA_WHATSAPP_DRAWER = "1"; // global switch ON — must not leak past the list
    process.env.TULALA_WHATSAPP_TENANTS = "riviera-maya, 11111111-1111-4111-8111-111111111111";
    assert.equal(await isMessagingChannelsEnabledForTenant({ tenantId: "22222222-2222-4222-8222-222222222222", tenantSlug: "riviera-maya" }), true);
    assert.equal(await isMessagingChannelsEnabledForTenant({ tenantId: "11111111-1111-4111-8111-111111111111" }), true);
    assert.equal(await isMessagingChannelsEnabledForTenant({ tenantId: "33333333-3333-4333-8333-333333333333", tenantSlug: "impronta" }), false);
    // Unset list → the global switch decides (env=1 → true).
    delete process.env.TULALA_WHATSAPP_TENANTS;
    assert.equal(await isMessagingChannelsEnabledForTenant({ tenantId: "33333333-3333-4333-8333-333333333333" }), true);
  } finally {
    if (prev.list === undefined) delete process.env.TULALA_WHATSAPP_TENANTS; else process.env.TULALA_WHATSAPP_TENANTS = prev.list;
    if (prev.drawer === undefined) delete process.env.TULALA_WHATSAPP_DRAWER; else process.env.TULALA_WHATSAPP_DRAWER = prev.drawer;
  }
});
