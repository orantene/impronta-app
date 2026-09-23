import assert from "node:assert/strict";
import { test } from "node:test";
import { customerThreadUrl, threadLinkUrl } from "./thread-link";

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

test("a talent-host conversation's link is hub-absolute", () => {
  assert.equal(
    threadLinkUrl({
      token: "v1.abc.def",
      requestOrigin: "https://jor-beauty.tulala.digital",
      conversationHostKind: "talent_site",
    }),
    "https://tulala.digital/c/t/v1.abc.def",
  );
});

test("a tenant-host conversation's link stays on the request origin", () => {
  assert.equal(
    threadLinkUrl({
      token: "v1.abc.def",
      requestOrigin: "https://impronta.tulala.digital",
      conversationHostKind: "agency",
    }),
    "https://impronta.tulala.digital/c/t/v1.abc.def",
  );
  assert.equal(
    threadLinkUrl({
      token: "v1.abc.def",
      requestOrigin: "https://app.tulala.digital",
      conversationHostKind: null,
    }),
    "https://app.tulala.digital/c/t/v1.abc.def",
  );
});
