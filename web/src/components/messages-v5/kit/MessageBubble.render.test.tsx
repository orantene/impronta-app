import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { DaySeparator, MessageBubble, SystemLine, UnreadDivider } from "./MessageBubble";
import { EN_COPY } from "./test-copy";
import { message } from "./test-fixtures";

test("client bubble: left, meta under it; staff bubble: `me`, delivery state in the meta", () => {
  const theirs = renderToStaticMarkup(<MessageBubble message={message()} mine={false} copy={EN_COPY} meta="Valentina · 10:41 AM · web chat" />);
  assert.match(theirs, /class="msg single" data-message="m-1"/);
  assert.match(theirs, /class="m">Valentina · 10:41 AM · web chat</);
  const mine = renderToStaticMarkup(<MessageBubble message={message({ id: "m-2", body: "Sending you a proposal now." })} mine copy={EN_COPY} meta="You · 4:20 PM" delivery="delivered" />);
  assert.match(mine, /class="msg me single"/);
  assert.match(mine, /You · 4:20 PM · Delivered/);
  assert.doesNotMatch(mine, /style=/);
});

test("grouping: first shows no meta, last shows it; middle is `grouped`", () => {
  const first = renderToStaticMarkup(<MessageBubble message={message()} mine={false} copy={EN_COPY} meta="Valentina · 10:41" position="first" />);
  assert.doesNotMatch(first, /class="m"/);
  const middle = renderToStaticMarkup(<MessageBubble message={message()} mine={false} copy={EN_COPY} meta="x" position="middle" />);
  assert.match(middle, /msg middle grouped/);
  const last = renderToStaticMarkup(<MessageBubble message={message()} mine={false} copy={EN_COPY} meta="Valentina · 10:42" position="last" />);
  assert.match(last, /class="m">Valentina · 10:42</);
});

test("internal note: tinted, locked, labelled; sending / failed with retry", () => {
  const note = renderToStaticMarkup(<MessageBubble message={message({ kind: "internal_note", internal: true, body: "Bride prefers Spanish." })} mine copy={EN_COPY} meta="Sofía · Jul 26" />);
  assert.match(note, /class="msg me note single"/);
  assert.match(note, /Internal note · Sofía · Jul 26/);
  const sending = renderToStaticMarkup(<MessageBubble message={message()} mine copy={EN_COPY} delivery="sending" />);
  assert.match(sending, /data-delivery="sending"/);
  assert.match(sending, />Sending</);
  const failed = renderToStaticMarkup(<MessageBubble message={message()} mine copy={EN_COPY} delivery="failed" onRetry={() => {}} />);
  assert.match(failed, /class="m failed">Not sent/);
  assert.match(failed, />Retry<\/button>/);
});

test("quote, voice, deleted", () => {
  const quoted = renderToStaticMarkup(<MessageBubble message={message()} mine={false} copy={EN_COPY} quote={{ author: "You", text: "Sending you a proposal now." }} />);
  assert.match(quoted, /class="q">Replying to You: Sending you a proposal now\./);
  const voice = renderToStaticMarkup(<MessageBubble message={message({ body: "" })} mine={false} copy={EN_COPY} voice={{ durationLabel: "0:42", transcript: "same hostesses as last year" }} />);
  assert.match(voice, /class="voice"/);
  assert.match(voice, /0:42/);
  assert.match(voice, /same hostesses/);
  const gone = renderToStaticMarkup(<MessageBubble message={message({ deletedAt: "2026-09-17T10:50:00Z" })} mine={false} copy={EN_COPY} />);
  assert.match(gone, /<i>Message removed<\/i>/);
});

test("mobile variant, system line, day separator, unread divider (hidden at zero)", () => {
  assert.match(renderToStaticMarkup(<MessageBubble message={message()} mine copy={EN_COPY} variant="mobile" position="first" />), /class="mx-msg me first"/);
  assert.match(renderToStaticMarkup(<SystemLine text="Sofía took this conversation" />), /class="sys"[^>]*>.*Sofía took this conversation/);
  assert.match(renderToStaticMarkup(<DaySeparator label="Jul 26" variant="mobile" />), /class="mx-day"[^>]*>Jul 26/);
  assert.match(renderToStaticMarkup(<UnreadDivider count={2} copy={EN_COPY} />), /class="unread-div"[^>]*>2 new/);
  assert.equal(renderToStaticMarkup(<UnreadDivider count={0} copy={EN_COPY} />), "");
});
