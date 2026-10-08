import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { FreeformHubBookBar } from "./freeform-hub-book";
import { HubProfileCta } from "./hub-profile-book-cta";
import type { HubProfileCtaSlot } from "@/lib/talent-site/hub-profile-book-cta";
import type { TalentAskEntry } from "@/lib/talent/chat-entry";

const count = (html: string, needle: string) => html.split(needle).length - 1;
const SITE = "https://jorgelina.example.com";

const slot = (s: HubProfileCtaSlot, askEntry: TalentAskEntry = "chat", maxSiteUrl: string | null = SITE) =>
  renderToStaticMarkup(
    createElement(
      HubProfileCta,
      { platformHost: true, maxSiteUrl, askEntry, locale: "en", className: "btn", slot: s },
      createElement("button", { "data-inquire": "" }, "Inquire"),
    ),
  );

test("header, sidebar and footer each render exactly one Book, no ids, no Inquire stacked under it", () => {
  for (const s of ["header", "sidebar", "footer"] as const) {
    const html = slot(s);
    assert.equal(count(html, "data-hub-book-cta"), 1, s);
    assert.equal(count(html, `data-hub-book-slot="${s}"`), 1, s);
    assert.equal(count(html, " id="), 0, `${s} must not carry an id (several slots share a page)`);
    assert.equal(count(html, "data-inquire"), 0, s);
  }
});

test("all three slots together never repeat an id", () => {
  const html = ["header", "sidebar", "footer"].map((s) => slot(s as HubProfileCtaSlot)).join("");
  assert.equal(count(html, "data-hub-book-cta"), 3);
  assert.equal(count(html, " id="), 0);
});

test("no site keeps Inquire in every slot", () => {
  for (const s of ["header", "sidebar", "footer"] as const) {
    const html = slot(s, "chat", null);
    assert.equal(count(html, "data-hub-book-cta"), 0);
    assert.equal(count(html, "data-inquire"), 1);
  }
});

test("freeform hub shows Book when the talent has a site and intake is open", () => {
  const html = renderToStaticMarkup(
    createElement(FreeformHubBookBar, { maxSiteUrl: SITE, askEntry: "chat", locale: "en" }),
  );
  assert.equal(count(html, "data-hub-book-cta"), 1);
  assert.equal(count(html, 'data-hub-book-slot="freeform"'), 1);
  assert.ok(html.includes(`${SITE}#book`));
});

test("freeform hub shows nothing without a site or when intake is closed", () => {
  const none = renderToStaticMarkup(
    createElement(FreeformHubBookBar, { maxSiteUrl: null, askEntry: "chat", locale: "en" }),
  );
  assert.equal(none, "");
  for (const askEntry of ["unavailable", "hidden", "closed_notice", "existing_client"] as TalentAskEntry[]) {
    const html = renderToStaticMarkup(
      createElement(FreeformHubBookBar, { maxSiteUrl: SITE, askEntry, locale: "en" }),
    );
    assert.equal(html, "", askEntry);
  }
});
