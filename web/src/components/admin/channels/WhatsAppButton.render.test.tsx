import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { WhatsAppConnectionPublic } from "@/lib/channels/types";

import { WhatsAppDrawerHost, WhatsAppTopBarButton } from "./WhatsAppChrome";
import { ConnectionBanner } from "./ConnectionBanner";
import { WhatsAppButton } from "./WhatsAppButton";

function connection(partial: Partial<WhatsAppConnectionPublic> = {}): WhatsAppConnectionPublic {
  return {
    tenantId: "t1",
    state: "disconnected",
    phoneE164: null,
    displayName: null,
    pairingExpiresAt: null,
    pairingQr: null,
    pairingCode: null,
    pairedAt: null,
    lastSeenAt: null,
    lastError: null,
    unread: 0,
    canPair: true,
    ownerFirstName: "Oran",
    tenantName: "Casa Nube",
    webViewUrl: "http://127.0.0.1:8788/view?tenant=t1",
    ...partial,
  };
}

test("unpaired owner sees Connect WhatsApp; live state shows the unread badge", () => {
  const connect = renderToStaticMarkup(
    <WhatsAppButton connection={connection()} size={32} />,
  );
  assert.match(connect, /data-tulala-whatsapp-button/);
  assert.match(connect, /Connect WhatsApp/);

  const live = renderToStaticMarkup(
    <WhatsAppButton
      connection={connection({ state: "connected", phoneE164: "+5219981230100", unread: 4 })}
      size={40}
    />,
  );
  assert.match(live, /WhatsApp/);
  assert.match(live, />4</);
});

test("banner is empty while connected and names the phone-offline state", () => {
  assert.equal(renderToStaticMarkup(<ConnectionBanner state="connected" />), "");
  const offline = renderToStaticMarkup(<ConnectionBanner state="phone_offline" />);
  assert.match(offline, /data-tulala-whatsapp-banner="phone_offline"/);
  assert.match(offline, /offline/i);
});

test("chrome mounts are null on first paint so PosFrame tests stay isolated", () => {
  assert.equal(renderToStaticMarkup(<WhatsAppDrawerHost />), "");
  assert.equal(renderToStaticMarkup(<WhatsAppTopBarButton size={32} />), "");
});
