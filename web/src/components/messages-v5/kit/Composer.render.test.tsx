import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { Composer, type ComposerState } from "./Composer";
import { EN_COPY } from "./test-copy";

const base = { mode: "reply" as const, channel: "web_chat" as const, fallbackChannel: "email" as const, copy: EN_COPY, onSend: () => {}, onRetry: () => {}, onReopen: () => {} };

test("idle: Reply on, Send via Web chat · fallback, placeholder, send off", () => {
  const html = renderToStaticMarkup(<Composer {...base} value="" state="idle" suggestions={["Yes, a second set is $450"]} />);
  assert.match(html, /class="composer" data-composer="idle" data-composer-mode="reply"/);
  assert.match(html, /aria-selected="true" class="on"[^>]*>Reply</);
  assert.match(html, /data-composer-via[^>]*><span class="lb">Send via<\/span>Web chat/);
  assert.match(html, /class="fb">fallback: Email if away/);
  assert.match(html, /placeholder="Write a reply"/);
  assert.match(html, /class="send off"[^>]*disabled=""/);
  assert.match(html, /class="chip soft"[^>]*>Yes, a second set is \$450/);
  assert.doesNotMatch(html, /style=/);
});

test("typing turns send on; sending is aria-busy and disables the input", () => {
  const typing = renderToStaticMarkup(<Composer {...base} value="See you Saturday" state="typing" />);
  assert.match(typing, /class="send" [^>]*data-composer-send/);
  assert.doesNotMatch(typing, /class="send off"/);
  const sending = renderToStaticMarkup(<Composer {...base} value="See you Saturday" state="sending" />);
  assert.match(sending, /data-composer="sending"/);
  assert.match(sending, /aria-busy="true"/);
  assert.match(sending, /<textarea[^>]*disabled=""/);
});

test("failed shows Retry; offline shows the warning; resolved locks with Reopen; refused reads the sentence with one fix", () => {
  const failed = renderToStaticMarkup(<Composer {...base} value="Yes" state="failed" />);
  assert.match(failed, /data-composer-failed/);
  assert.match(failed, /Not sent · no connection/);
  assert.match(failed, />Retry<\/button>/);
  const offline = renderToStaticMarkup(<Composer {...base} value="" state="offline" />);
  assert.match(offline, /data-composer-offline/);
  assert.match(offline, /You are offline · replies send when back/);
  const resolved = renderToStaticMarkup(<Composer {...base} value="" state="resolved" />);
  assert.match(resolved, /data-composer-locked/);
  assert.match(resolved, /This conversation is resolved\./);
  assert.match(resolved, />Reopen<\/button>/);
  assert.match(resolved, /box locked/);
  const refused = renderToStaticMarkup(<Composer {...base} value="" state="refused" refusal="identity_unconfirmed" refusalAction={{ label: "Capture identity", onClick: () => {} }} />);
  assert.match(refused, /data-refusal="identity_unconfirmed"/);
  assert.match(refused, /identity is not confirmed/i);
  assert.match(refused, />Capture identity<\/button>/);
});

test("internal note tints the box and says only your team sees this; ok line; mobile grammar", () => {
  const note = renderToStaticMarkup(<Composer {...base} mode="note" value="" state="idle" okText="Note saved" />);
  assert.match(note, /data-composer-mode="note"/);
  assert.match(note, /box note/);
  assert.match(note, /Only your team sees this/);
  assert.match(note, /placeholder="Write a note for the team"/);
  assert.match(note, /data-ok-line[^>]*>.*Note saved/);
  assert.doesNotMatch(note, /data-composer-via/);
  const mobile = renderToStaticMarkup(<Composer {...base} value="" state="idle" variant="mobile" />);
  assert.match(mobile, /class="mx-cmp" data-composer="idle"/);
  assert.match(mobile, /mx-seg small/);
  assert.match(mobile, /<span class="lb">Via<\/span>Web chat/);
  for (const state of ["failed", "offline", "resolved"] as ComposerState[]) {
    assert.match(renderToStaticMarkup(<Composer {...base} value="" state={state} variant="mobile" />), /mx-line (err|warn|lock)/);
  }
});
