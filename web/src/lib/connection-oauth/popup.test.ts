import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CONNECTION_POPUP_MESSAGE_TYPE,
  isConnectionPopupMessage,
} from "./popup";
import { AUTH_POPUP_MESSAGE_TYPE } from "@/lib/auth-popup";

test("the connection channel is NOT the sign-in channel", () => {
  // If these ever collide, a finished connection would trigger the sign-in
  // listeners, which NAVIGATE the opener — throwing the operator off Settings
  // in the middle of connecting.
  assert.notEqual(CONNECTION_POPUP_MESSAGE_TYPE, AUTH_POPUP_MESSAGE_TYPE);
});

test("only our own message shape is accepted", () => {
  assert.equal(
    isConnectionPopupMessage({ type: CONNECTION_POPUP_MESSAGE_TYPE, success: true }),
    true,
  );
  // A sign-in result must not be mistaken for a connection result.
  assert.equal(
    isConnectionPopupMessage({ type: AUTH_POPUP_MESSAGE_TYPE, success: true }),
    false,
  );
  for (const junk of [null, undefined, "string", 42, {}, { type: CONNECTION_POPUP_MESSAGE_TYPE }]) {
    assert.equal(isConnectionPopupMessage(junk), false, `${JSON.stringify(junk)} must be refused`);
  }
});

test("shape is not provenance: the caller still has to check the origin", () => {
  // A hostile page CAN postMessage this exact shape to an opener. The guard is
  // `event.origin === window.location.origin` at the call site, so this test
  // exists to state that the predicate alone is deliberately not sufficient.
  const forged = { type: CONNECTION_POPUP_MESSAGE_TYPE, success: true, provider: "instagram" };
  assert.equal(isConnectionPopupMessage(forged), true);
});
