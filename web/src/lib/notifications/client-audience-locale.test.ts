import test from "node:test";
import assert from "node:assert/strict";

import { clientOrGuest, loadInquiryView } from "./catalog-audiences";
import type { AudienceContext, NotificationEvent } from "./types";

function ev(payload: Record<string, unknown>): NotificationEvent {
  return { payload } as unknown as NotificationEvent;
}

test("guest client gets the inquiry language as an explicit locale", async () => {
  const m = await clientOrGuest(ev({ contactEmail: "a@b.co", locale: "es" }));
  assert.deepEqual(m, [{ kind: "guest", email: "a@b.co", displayName: null, role: "client", locale: "es" }]);
});

test("client account member carries the locale; unknown locale leaves it unset (tenant default applies)", async () => {
  const es = await clientOrGuest(ev({ clientUserId: "u1", locale: "es-MX" }));
  assert.deepEqual(es, [{ kind: "user", userId: "u1", role: "client", locale: "es" }]);
  const none = await clientOrGuest(ev({ clientUserId: "u1" }));
  assert.deepEqual(none, [{ kind: "user", userId: "u1", role: "client" }]);
  const junk = await clientOrGuest(ev({ clientUserId: "u1", locale: "fr" }));
  assert.deepEqual(junk, [{ kind: "user", userId: "u1", role: "client" }]);
});

type Row = Record<string, unknown>;
function fakeAdmin(row: Row): AudienceContext {
  const q = {
    select: () => q,
    eq: () => q,
    maybeSingle: async () => ({ data: row, error: null }),
  };
  return { admin: { from: () => q } } as unknown as AudienceContext;
}

test("loadInquiryView surfaces guest_locale from a guest-chat inquiry", async () => {
  const view = await loadInquiryView(
    { inquiryId: "i1", payload: {} } as unknown as NotificationEvent,
    fakeAdmin({
      contact_name: "Ana",
      contact_email: "a@b.co",
      event_date: null,
      event_location: null,
      client_user_id: null,
      coordinator_id: null,
      current_offer_id: null,
      source_context: { guest_locale: "es" },
    }),
  );
  assert.equal(view.locale, "es");
});
