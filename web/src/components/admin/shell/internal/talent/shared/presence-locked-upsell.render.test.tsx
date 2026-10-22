import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { PresenceLockedUpsell } from "./presence-locked-upsell";

test("locked state (es): benefit line and the primary 'Ver planes Pro' link to /talent/plan", () => {
  const html = renderToStaticMarkup(<PresenceLockedUpsell es />);
  assert.match(html, /Mira cuántas personas visitan tu perfil, de dónde llegan y cuántas reservan\./);
  assert.match(html, /<a [^>]*href="\/talent\/plan"[^>]*>Ver planes Pro<\/a>/);
  assert.match(html, /aria-hidden="true"/, "sample numbers are decorative only");
});

test("locked state (en): benefit line and 'See Pro plans' link, no em dashes", () => {
  const html = renderToStaticMarkup(<PresenceLockedUpsell es={false} />);
  assert.match(html, /See how many people visit your profile, where they come from and how many book\./);
  assert.match(html, /<a [^>]*href="\/talent\/plan"[^>]*>See Pro plans<\/a>/);
  assert.equal(html.includes("—"), false);
});
