import assert from "node:assert/strict";
import { test } from "node:test";

import {
  resolveGuestSupportAudience,
  shouldEmitGuestAgentReply,
} from "./guest-notification-audience";

test("pure guest ticket with contact_email resolves a non-empty audience", () => {
  const audience = resolveGuestSupportAudience({
    requesterUserId: null,
    contactEmail: "prospect@example.com",
    contactName: "Maya",
  });
  assert.ok(audience.length > 0, "Oran replies into the void if this is empty");
  assert.equal(audience[0]?.kind, "guest");
  if (audience[0]?.kind === "guest") {
    assert.equal(audience[0].email, "prospect@example.com");
    assert.equal(audience[0].displayName, "Maya");
  }
});

test("shouldEmitGuestAgentReply is true only for pure guests with email", () => {
  assert.equal(
    shouldEmitGuestAgentReply({
      surface: "guest",
      requesterUserId: null,
      contactEmail: "a@b.com",
    }),
    true,
  );
  assert.equal(
    shouldEmitGuestAgentReply({
      surface: "guest",
      requesterUserId: null,
      contactEmail: null,
    }),
    false,
  );
  assert.equal(
    shouldEmitGuestAgentReply({
      surface: "client",
      requesterUserId: null,
      contactEmail: "a@b.com",
    }),
    false,
  );
});
