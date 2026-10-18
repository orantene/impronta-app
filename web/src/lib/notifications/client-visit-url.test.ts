import assert from "node:assert/strict";
import { test } from "node:test";

import { verifyThreadToken } from "@/lib/messaging/thread-token";
import { clientManageUrl, clientOfferUrl, guestSaveBookingsUrl } from "./client-visit-url";

const SITE = "https://tulala.digital";
const APP = "https://app.tulala.digital";
const TENANT = "11111111-1111-4111-8111-111111111111";
const INQ = "22222222-2222-4222-8222-222222222222";
const BOOKING = "33333333-3333-4333-8333-333333333333";
const marketing = { homeHref: SITE } as Parameters<typeof clientManageUrl>[0];
const agency = { homeHref: "https://improntamodels.com" } as Parameters<typeof clientManageUrl>[0];

function withEnv<T>(env: Record<string, string | undefined>, fn: () => T): T {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    prev[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(env)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

const BASE = { NEXT_PUBLIC_SITE_URL: SITE, NEXT_PUBLIC_APP_URL: APP, GUEST_COOKIE_SECRET: "test-secret" };

test("flag off + a known conversation: the link is a signed thread link a guest can open", () => {
  withEnv({ ...BASE, CLIENT_ACCOUNT_HOSTS: undefined }, () => {
    const url = clientManageUrl(agency, BOOKING, `/client/bookings/${BOOKING}`, "agency", { inquiryId: INQ, tenantId: TENANT });
    assert.match(url, /^https:\/\/improntamodels\.com\/c\/t\//);
    const token = decodeURIComponent(url.split("/c/t/")[1] ?? "");
    const v = verifyThreadToken(token);
    assert.equal(v.ok, true);
    if (v.ok) {
      assert.equal(v.inquiryId, INQ);
      assert.equal(v.tenantId, TENANT);
    }
  });
});

test("flag off without a conversation: unchanged legacy path (no regression)", () => {
  withEnv({ ...BASE, CLIENT_ACCOUNT_HOSTS: undefined }, () => {
    assert.equal(
      clientManageUrl(agency, BOOKING, `/client/bookings/${BOOKING}`, "agency"),
      `https://improntamodels.com/client/bookings/${BOOKING}`,
    );
  });
});

test("flag on: the visit id is the INQUIRY id when known (the loader keys on inquiries.id)", () => {
  withEnv({ ...BASE, CLIENT_ACCOUNT_HOSTS: "agency" }, () => {
    assert.equal(
      clientManageUrl(agency, BOOKING, "/x", "agency", { inquiryId: INQ, tenantId: TENANT }),
      `https://improntamodels.com/account/visits/${INQ}`,
    );
    // No inquiry known: the booking id still goes out; the loader resolves it.
    assert.equal(clientManageUrl(agency, BOOKING, "/x", "agency"), `https://improntamodels.com/account/visits/${BOOKING}`);
  });
});

test("marketing apex never gets an /account link (it 404s): falls to the app host", () => {
  withEnv({ ...BASE, CLIENT_ACCOUNT_HOSTS: "app" }, () => {
    const url = clientManageUrl(marketing, BOOKING, "/x", "app", { inquiryId: INQ, tenantId: TENANT });
    assert.ok(url.startsWith(`${APP}/account/visits/`), url);
  });
});

test("guestSaveBookingsUrl is the existing client sign-in, on a host that serves it", () => {
  withEnv(BASE, () => {
    assert.equal(guestSaveBookingsUrl(marketing), `${APP}/login?as=client&next=%2Fclient`);
    assert.equal(guestSaveBookingsUrl(agency), "https://improntamodels.com/login?as=client&next=%2Fclient");
  });
});

test("TUL-954: the offer email button is a signed thread link with ?focus=offer; unknown conversation keeps the legacy path", () => {
  withEnv({ ...BASE, CLIENT_ACCOUNT_HOSTS: undefined }, () => {
    const url = clientOfferUrl(agency, `/client/inquiries/${INQ}?tab=offer`, { inquiryId: INQ, tenantId: TENANT });
    assert.match(url, /^https:\/\/improntamodels\.com\/c\/t\/.+\?focus=offer$/);
    const token = decodeURIComponent((url.split("/c/t/")[1] ?? "").replace("?focus=offer", ""));
    const v = verifyThreadToken(token);
    assert.equal(v.ok, true);
    assert.equal(v.ok && v.inquiryId, INQ);
    assert.equal(clientOfferUrl(agency, `/client/inquiries/${INQ}?tab=offer`, {}), `https://improntamodels.com/client/inquiries/${INQ}?tab=offer`);
    assert.equal(clientOfferUrl(agency, "/x", { inquiryId: INQ, tenantId: null }), "https://improntamodels.com/x");
  });
});
