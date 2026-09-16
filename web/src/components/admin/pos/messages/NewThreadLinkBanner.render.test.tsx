/**
 * NewThreadLinkBanner render tests — D-145: `MessagesShell` used to drop
 * the `token` a new conversation mints, so no screen on main ever handed a
 * customer their own `/c/t/<token>` link. This pins the banner that now
 * shows it: the link itself, a Copy button, a WhatsApp door, and the one
 * sentence when the server had no secret to sign a token with.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { NewThreadLinkBanner, type NewThreadLinkBannerCopy } from "./NewThreadLinkBanner";

const COPY: NewThreadLinkBannerCopy = {
  title: "Customer link",
  copyLink: "Copy link",
  copied: "Copied",
  send: "Send via WhatsApp",
  dismiss: "Dismiss",
  unavailable: "This conversation was created, but its link could not be signed.",
};

const noop = () => {};

test("shows the customer's thread link, Copy, and a WhatsApp door", () => {
  const markup = renderToStaticMarkup(
    <NewThreadLinkBanner
      url="https://tulala.digital/c/t/v1.abc.def"
      copied={false}
      onCopy={noop}
      onDismiss={noop}
      copy={COPY}
    />,
  );
  assert.match(markup, /data-pos-new-thread-link-url/);
  assert.match(markup, /https:\/\/tulala\.digital\/c\/t\/v1\.abc\.def/);
  assert.match(markup, /Copy link/);
  assert.match(markup, /data-pos-new-thread-link-send/);
  // The WhatsApp door carries the link so it can be sent as-is.
  assert.match(markup, /wa\.me\/\?text=https%3A%2F%2Ftulala\.digital/);
});

test("copied flips the button's own label", () => {
  const markup = renderToStaticMarkup(
    <NewThreadLinkBanner
      url="https://tulala.digital/c/t/v1.abc.def"
      copied
      onCopy={noop}
      onDismiss={noop}
      copy={COPY}
    />,
  );
  const button = markup.match(/<button[^>]*data-pos-new-thread-link-copy[^>]*>([^<]*)<\/button>/);
  assert.ok(button, "the Copy button must carry data-pos-new-thread-link-copy");
  assert.equal(button?.[1], "Copied");
});

test("no token, because the server had no secret, reads a sentence, not a broken link", () => {
  const markup = renderToStaticMarkup(
    <NewThreadLinkBanner url={null} copied={false} onCopy={noop} onDismiss={noop} copy={COPY} />,
  );
  assert.doesNotMatch(markup, /data-pos-new-thread-link-url/);
  assert.doesNotMatch(markup, /data-pos-new-thread-link-copy/);
  assert.match(markup, /could not be signed/);
});

test("Dismiss is always offered, whether or not the link resolved", () => {
  const markup = renderToStaticMarkup(
    <NewThreadLinkBanner url={null} copied={false} onCopy={noop} onDismiss={noop} copy={COPY} />,
  );
  assert.match(markup, /data-pos-new-thread-link-dismiss/);
});
