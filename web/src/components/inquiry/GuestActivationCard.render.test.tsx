/**
 * TUL-1994/1191: GuestActivationCard is the ONE client-signup entry point a
 * guest gets after an unauthenticated inquiry submission. It must resolve
 * the right account route for each `ensureGuestClientByEmail` outcome, carry
 * the email through so the next step doesn't ask again, and default a
 * missing/unknown activation to the safest ("unlinked" -> register) route
 * rather than silently rendering no CTA at all.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { GuestActivationCard } from "./GuestActivationCard";

function hrefOf(html: string): string {
  const tag = html.match(/<a [^>]*data-guest-activation-cta="[^>]*>/);
  assert.ok(tag, `no CTA link in: ${html}`);
  const m = tag![0].match(/href="([^"]*)"/);
  assert.ok(m, `CTA link has no href in: ${tag![0]}`);
  return m![1];
}

test("matched: links to sign-in, carrying the email", () => {
  const html = renderToStaticMarkup(
    <GuestActivationCard activation="matched" email="guest@example.com" />,
  );
  assert.equal(hrefOf(html), "/login?email=guest%40example.com");
});

test("created: links to set-password, carrying the email", () => {
  const html = renderToStaticMarkup(
    <GuestActivationCard activation="created" email="guest@example.com" />,
  );
  assert.equal(hrefOf(html), "/forgot-password?email=guest%40example.com");
});

test("unlinked: links to register, carrying the email", () => {
  const html = renderToStaticMarkup(
    <GuestActivationCard activation="unlinked" email="guest@example.com" />,
  );
  assert.equal(hrefOf(html), "/register?email=guest%40example.com");
});

test("no activation on file (e.g. a guest who gave no email) defaults to register, with no email in the query", () => {
  const html = renderToStaticMarkup(<GuestActivationCard activation={null} email={null} />);
  assert.equal(hrefOf(html), "/register");
});

test("an unknown/legacy activation value still renders a real CTA, never a blank card", () => {
  const html = renderToStaticMarkup(
    // @ts-expect-error -- exercising the defensive fallback for a value outside the union
    <GuestActivationCard activation="something-else" email={null} />,
  );
  assert.equal(hrefOf(html), "/register");
});

test("the card always renders a non-empty title, body and CTA label", () => {
  for (const activation of ["matched", "created", "unlinked"] as const) {
    const html = renderToStaticMarkup(<GuestActivationCard activation={activation} email="a@b.com" />);
    assert.match(html, /data-guest-activation-card=""/);
    // Title + body + CTA label are all real text, not empty tags.
    const text = html.replace(/<[^>]+>/g, "|");
    const segments = text.split("|").map((s) => s.trim()).filter(Boolean);
    assert.ok(segments.length >= 3, `expected title+body+cta text, got: ${JSON.stringify(segments)}`);
  }
});
