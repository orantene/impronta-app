import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import AgentReply from "./AgentReply";

test("AgentReply does not throw when unsubscribeUrl is undefined", () => {
  assert.doesNotThrow(() => {
    const html = renderToStaticMarkup(
      createElement(AgentReply, {
        ticketNumber: 12,
        subject: "Guest thread",
        replyUrl: "https://tulala.digital/contact",
        unsubscribeUrl: undefined,
      }),
    );
    assert.ok(html.length > 0);
  });
});
