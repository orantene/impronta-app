import assert from "node:assert/strict";
import { test } from "node:test";

import { conversationSaveUrl } from "./client-save-to-email";

test("conversationSaveUrl: talent_site hosts mint on the hub with from=email", () => {
  const url = conversationSaveUrl({
    token: "v1.abc.def",
    sourceContext: { host_kind: "talent_site" },
    requestOrigin: "https://book-jorgelina.tulala.digital",
  });
  assert.equal(url, "https://tulala.digital/c/t/v1.abc.def?from=email");
});

test("conversationSaveUrl: other hosts keep the request origin", () => {
  const url = conversationSaveUrl({
    token: "v1.abc.def",
    sourceContext: { host_kind: "agency" },
    requestOrigin: "https://impronta.tulala.digital",
  });
  assert.equal(url, "https://impronta.tulala.digital/c/t/v1.abc.def?from=email");
});

test("conversationSaveUrl: missing origin falls back to the hub", () => {
  const url = conversationSaveUrl({
    token: "v1.xyz",
    sourceContext: null,
    requestOrigin: null,
  });
  assert.equal(url, "https://tulala.digital/c/t/v1.xyz?from=email");
});
