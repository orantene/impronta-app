import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canPairWhatsApp,
  isLiveWhatsAppState,
  isWhatsAppConnectionState,
  needsPairingWhatsApp,
} from "./types";
import { mapPublicRow } from "./whatsapp-connection";

test("pairing is owner, admin, or manager only", () => {
  assert.equal(canPairWhatsApp("owner"), true);
  assert.equal(canPairWhatsApp("admin"), true);
  assert.equal(canPairWhatsApp("manager"), true);
  assert.equal(canPairWhatsApp("editor"), false);
  assert.equal(canPairWhatsApp("viewer"), false);
  assert.equal(canPairWhatsApp(null), false);
});

test("live vs pairing-needed session states match WD04", () => {
  assert.equal(isLiveWhatsAppState("connected"), true);
  assert.equal(isLiveWhatsAppState("phone_offline"), true);
  assert.equal(isLiveWhatsAppState("reconnecting"), true);
  assert.equal(needsPairingWhatsApp("disconnected"), true);
  assert.equal(needsPairingWhatsApp("unlinked"), true);
  assert.equal(needsPairingWhatsApp("blocked"), true);
  assert.equal(needsPairingWhatsApp("pairing"), false);
  assert.equal(isWhatsAppConnectionState("connected"), true);
  assert.equal(isWhatsAppConnectionState("unknown"), false);
});

test("mapPublicRow never exposes ciphertext and defaults a missing row", () => {
  const empty = mapPublicRow(null, {
    tenantId: "t1",
    unread: 0,
    canPair: true,
    ownerFirstName: "Oran",
  });
  assert.equal(empty.state, "disconnected");
  assert.equal(empty.pairingQr, null);
  assert.equal(empty.ownerFirstName, "Oran");
  assert.equal("session_ciphertext" in empty, false);

  const live = mapPublicRow(
    {
      tenant_id: "t1",
      state: "connected",
      phone_e164: "+5219981230100",
      display_name: "Casa Nube",
      pairing_expires_at: null,
      paired_at: "2026-09-10T18:00:00Z",
      last_seen_at: "2026-09-10T18:41:00Z",
      last_error: null,
    },
    { tenantId: "t1", unread: 3, canPair: false, ownerFirstName: "Oran" },
  );
  assert.equal(live.state, "connected");
  assert.equal(live.phoneE164, "+5219981230100");
  assert.equal(live.unread, 3);
  assert.equal(live.canPair, false);
  assert.equal(live.webViewUrl.endsWith("/view?tenant=t1"), true);
});
