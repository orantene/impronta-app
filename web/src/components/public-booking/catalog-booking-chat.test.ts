import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
g.HTMLElement = dom.window.HTMLElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.Event = dom.window.Event;
g.CustomEvent = dom.window.CustomEvent;

/* eslint-disable import/first -- jsdom globals must exist before modules that touch window */
import {
  catalogBookingDraftPrefix,
  openCatalogBookingChat,
  type CatalogBookingChatHandoff,
} from "./catalog-booking-chat";
import {
  clearPendingOffering,
  peekPendingOffering,
  pendingOfferingPayload,
} from "@/app/t/[profileCode]/_chat/pending-offering-store";
import {
  clearPendingGuestContact,
  peekPendingGuestContact,
} from "@/app/t/[profileCode]/_chat/pending-guest-contact-store";
/* eslint-enable import/first */

const baseDetail = {
  offeringId: "off-1",
  talentProfileId: "talent-1",
  title: "Soft Gel",
  kind: "service",
  priceType: "flat_package",
  amountCents: 45000,
  currency: "MXN",
  durationMinutes: 90,
  allowPayInPerson: true,
  reserveMode: "free" as const,
  depositPct: null,
  imageUrl: null,
  variants: [],
  addOns: [],
  intent: "instant" as const,
};

test("draft prefix includes options, slot, and total", () => {
  const prefix = catalogBookingDraftPrefix(
    baseDetail,
    {
      variantLabel: null,
      addOnLabels: ["French"],
      slotLabel: "Martes 29 de sep, 14:30",
      totalCents: 55000,
    },
    "es",
  );
  assert.match(prefix, /Consulta sobre Soft Gel · French · Martes 29 de sep, 14:30/);
  assert.match(prefix, /550/);
});

test("openCatalogBookingChat stashes offering + visitor and fires ask-question", () => {
  clearPendingOffering();
  clearPendingGuestContact();
  const events: string[] = [];
  const onAsk = (e: Event) => {
    events.push((e as CustomEvent).type);
  };
  window.addEventListener("tulala:ask-question", onAsk);

  const handoff: CatalogBookingChatHandoff = {
    detail: baseDetail,
    selection: {
      addOnLabels: ["French"],
      slotLabel: "Martes 29 de sep, 14:30",
      totalCents: 55000,
    },
    visitor: { name: "Ana", phone: "+5215551234", email: "ana@example.com" },
    from: "sheet",
  };
  openCatalogBookingChat(handoff);

  assert.equal(events.includes("tulala:ask-question"), true);
  assert.equal(peekPendingOffering()?.offeringId, "off-1");
  assert.equal(peekPendingGuestContact()?.name, "Ana");
  assert.equal(peekPendingGuestContact()?.phone, "+5215551234");
  const payload = pendingOfferingPayload();
  assert.equal(payload?.title, "Soft Gel");
  assert.equal(payload?.total_cents, 55000);
  assert.deepEqual(payload?.add_on_labels, ["French"]);

  window.removeEventListener("tulala:ask-question", onAsk);
  clearPendingOffering();
  clearPendingGuestContact();
});

test("demo handoff fires ask-question without stashing live pending stores", () => {
  clearPendingOffering();
  clearPendingGuestContact();
  let fired = false;
  const onAsk = () => {
    fired = true;
  };
  window.addEventListener("tulala:ask-question", onAsk);
  openCatalogBookingChat({
    detail: baseDetail,
    visitor: { name: "Ana", phone: "+5215551234" },
    demo: true,
  });
  assert.equal(fired, true);
  assert.equal(peekPendingOffering(), null);
  assert.equal(peekPendingGuestContact(), null);
  window.removeEventListener("tulala:ask-question", onAsk);
});
