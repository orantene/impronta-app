import assert from "node:assert/strict";
import { test } from "node:test";
import { customerThreadUrl } from "./thread-link";

// D-145: `messagingStartConversation` mints a token for a new conversation
// and `MessagesShell` used to drop it. This is the pure half of the fix —
// the URL a "Copy link" button hands the customer.
test("builds the customer's own thread link from the origin and token", () => {
  assert.equal(
    customerThreadUrl("https://staging-qa-app.tulala.digital", "v1.abc.def"),
    "https://staging-qa-app.tulala.digital/c/t/v1.abc.def",
  );
});

test("encodes a token that carries separator-shaped characters", () => {
  assert.equal(
    customerThreadUrl("https://tulala.digital", "v1.a/b c.def"),
    "https://tulala.digital/c/t/v1.a%2Fb%20c.def",
  );
});

test("no token (no GUEST_COOKIE_SECRET on the server) is no link, not a broken one", () => {
  assert.equal(customerThreadUrl("https://tulala.digital", null), null);
});
