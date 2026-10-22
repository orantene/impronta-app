import assert from "node:assert/strict";
import { test } from "node:test";

import { deriveAuthorRole } from "./guest-author-role";

const GID = "guest-session-1";
const CLIENT = "user-client";
const TALENT = "user-talent";
const ids = new Map<string, { role: "client" | "coordinator" | "talent" }>([[TALENT, { role: "talent" }]]);
const base = { message_kind: "text", metadata: null };

test("TUL-1852: the guest's own line stays the guest after the claim stamps a user id on it", () => {
  const stamped = { ...base, sender_user_id: CLIENT, guest_session_id: GID };
  assert.equal(deriveAuthorRole(stamped, GID, ids, CLIENT), "guest");
  // Claimed on a later visit: the session id no longer matches, the inquiry's client does.
  assert.equal(deriveAuthorRole({ ...stamped, guest_session_id: "old" }, "new-session", ids, CLIENT), "guest");
  // Even if the claimant also appears in the participant map with a talent role.
  const both = new Map(ids).set(CLIENT, { role: "talent" });
  assert.equal(deriveAuthorRole(stamped, GID, both, CLIENT), "guest");
});

test("talent, staff and system lines are unchanged", () => {
  assert.equal(deriveAuthorRole({ ...base, sender_user_id: TALENT, guest_session_id: null }, GID, ids, CLIENT), "talent");
  assert.equal(deriveAuthorRole({ ...base, sender_user_id: null, guest_session_id: null }, GID, ids, CLIENT), "system");
  assert.equal(deriveAuthorRole({ ...base, sender_user_id: TALENT, guest_session_id: null, metadata: { system_event_type: "offer_sent" } }, GID, ids, CLIENT), "system");
  assert.equal(deriveAuthorRole({ ...base, sender_user_id: "stranger", guest_session_id: null }, GID, ids, CLIENT), "other");
});
