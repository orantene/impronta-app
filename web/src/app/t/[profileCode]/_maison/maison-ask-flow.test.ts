/**
 * Public ask entry points (WSF): hidden entry renders no ask CTA, /contact is
 * an ask link, a quote service never opens the booking sheet, and a not-ready
 * instant service reads as a request everywhere.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { askEntryPointsVisible, resolveTalentAskEntry } from "@/lib/talent/chat-entry";
import { isAskControl, isAskHref } from "@/app/%5Ftalent-site/TalentSiteContactBridge";
import { resolveSiteCtaMode } from "@/lib/talent-site/design-label-locale";
import { bookingModeLabel } from "@/lib/talent/publication-state";
import { resolveEffectiveBookingMode } from "@/lib/scheduling/instant-book-gates";
import { opensAskFlowOnly } from "@/lib/talent/offering-cta-derivation";
import { resolveOfferingCta, type TalentOffering } from "@/lib/talent/offerings-types";

import { dispatchOffering } from "./MaisonMenu";

describe("ask entry visibility", () => {
  it("chat off + inquiries off + bookings on resolves to hidden, no ask CTAs", () => {
    const entry = resolveTalentAskEntry({ chatEnabled: false, acceptingInquiries: false, acceptingBookings: true });
    assert.equal(entry, "hidden");
    assert.equal(askEntryPointsVisible(entry), false);
  });
  it("chat and form keep the ask CTAs", () => {
    assert.equal(askEntryPointsVisible("chat"), true);
    assert.equal(askEntryPointsVisible("form"), true);
  });
  it("ask labels (EN + ES) are swept when the entry is hidden", () => {
    for (const label of ["Hacer una pregunta", "Escríbeme", "Ask a question", "Inquire"]) {
      assert.equal(isAskControl("", label), true, label);
    }
    assert.equal(isAskControl("/servicios", "Servicios"), false);
  });
});

describe("/contact is an ask link", () => {
  it("recognises /contact and /contacto, with locale prefix and hash", () => {
    for (const h of ["/contact", "/contacto", "/es/contact", "/contact/", "/contact#x"]) {
      assert.equal(isAskHref(h), true, h);
    }
  });
  it("does not capture unrelated paths or mailto", () => {
    assert.equal(isAskHref("/contact-us/team"), false);
    assert.equal(isAskHref("mailto:a@b.co"), false);
  });
});

function fakeWindow() {
  const seen: string[] = [];
  const target = new EventTarget();
  const store = new Map<string, string>();
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = Object.assign(target, {
    location: { pathname: "/" },
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
  const origDispatch = target.dispatchEvent.bind(target);
  target.dispatchEvent = (e: Event) => {
    seen.push(e.type);
    return origDispatch(e);
  };
  return seen;
}

describe("quote service never opens the booking sheet", () => {
  const base = {
    id: "o1",
    title: "Boda",
    kind: "service",
    talentProfileId: "t1",
    currency: "MXN",
    imageUrls: [],
    visibility: "public",
  };
  it("ask_quote opens only the ask flow", () => {
    const o = { ...base, bookingMode: "request", priceType: "custom", priceDisplay: "quote", amountCents: null } as unknown as TalentOffering;
    assert.equal(opensAskFlowOnly(resolveOfferingCta(o)), true);
    const seen = fakeWindow();
    dispatchOffering(o, "request", "when");
    assert.ok(seen.includes("tulala:ask-question"));
    assert.ok(!seen.some((n) => n.startsWith("tulala:offering-")));
  });
  it("a priced bookable service still uses the offering rails", () => {
    const o = { ...base, bookingMode: "request", priceType: "fixed", priceDisplay: "exact", amountCents: 5000, durationMinutes: 60 } as unknown as TalentOffering;
    const seen = fakeWindow();
    dispatchOffering(o, "request", "when");
    assert.ok(seen.some((n) => n.startsWith("tulala:offering-")));
    assert.ok(!seen.includes("tulala:ask-question"));
  });
});

describe("not-ready instant reads as a request everywhere", () => {
  it("resolver, site CTA mode and the services row summary agree", () => {
    assert.equal(
      resolveEffectiveBookingMode({ offering: { bookingMode: "instant" }, defaults: {}, readiness: { instantReady: false } }).mode,
      "request",
    );
    assert.equal(
      resolveSiteCtaMode({ sellingDefaults: { bookingPosture: "instant" }, confirmsByHand: false, instantReady: false }),
      "request",
    );
    assert.equal(
      resolveSiteCtaMode({ sellingDefaults: { bookingPosture: "instant" }, confirmsByHand: false, instantReady: true }),
      "instant",
    );
    const item = { bookingMode: "instant", priceDisplay: "exact", amountCents: 5000 };
    assert.equal(bookingModeLabel({ ...item, instantReady: false }, "es"), "Pedir reserva");
    assert.equal(bookingModeLabel({ ...item, instantReady: true }, "es"), "Reserva instantánea");
    assert.equal(bookingModeLabel(item, "es"), "Reserva instantánea");
  });
});
