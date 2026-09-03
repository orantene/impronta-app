import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import AgentReply from "./AgentReply";
import { SupportMail } from "./_shared";

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

// ─── Every support email says where a reply actually goes ────────────────────
//
// These emails carry no Reply-To header, so a reply goes to the From address —
// noreply@tulala.digital, on a domain with no MX record. The reply bounces and
// nobody learns it existed. "noreply@" is a convention, not a mechanism; people
// reply to it anyway. The button in each mail is the path that works, so the
// mail has to say so.

function renderShared(locale?: string): string {
  return renderToStaticMarkup(
    createElement(SupportMail, {
      preview: "p",
      heading: "h",
      intro: "i",
      ctaUrl: "https://example.com/t/1",
      ...(locale ? { brand: { locale } } : {}),
    }),
  );
}

test("a support email tells the reader replies here are not read", () => {
  assert.match(renderShared(), /Replies to this email are not read/);
});

test("a Spanish reader is told in Spanish", () => {
  const html = renderShared("es");
  assert.match(html, /no se leen/);
  assert.doesNotMatch(html, /Replies to this email are not read/);
});

test("an unknown locale falls back to English rather than rendering nothing", () => {
  assert.match(renderShared("pt"), /Replies to this email are not read/);
});
