import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { EN_COPY } from "../kit/test-copy";
import { TASKS } from "../kit/test-fixtures";
import { TasksTray } from "./TasksTray";

const noop = () => {};

test("closed renders nothing", () => {
  assert.equal(renderToStaticMarkup(<TasksTray tasks={TASKS} open={false} onClose={noop} onPick={noop} copy={EN_COPY} variant="desktop" />), "");
});

test("desktop: every task listed in order, the primary one marked, titles and why sentences shown", () => {
  const html = renderToStaticMarkup(<TasksTray tasks={TASKS} open onClose={noop} onPick={noop} copy={EN_COPY} variant="desktop" />);
  assert.match(html, /data-tasks-tray="desktop"/);
  assert.match(html, /Other tasks/);
  const keys = [...html.matchAll(/data-task="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(keys, ["reply", "await_offer", "confirm_talent"]);
  assert.match(html, /data-task="reply" data-task-primary="true"/);
  assert.doesNotMatch(html, /data-task="await_offer"[^>]*data-task-primary/);
  assert.match(html, /Reply to the client/);
  assert.match(html, /The client is waiting on a reply\./);
  assert.match(html, /Follow up on the offer/);
  assert.doesNotMatch(html, /style=/);
});

test("empty tasks shows the empty state, not a blank list", () => {
  const html = renderToStaticMarkup(<TasksTray tasks={[]} open onClose={noop} onPick={noop} copy={EN_COPY} variant="desktop" />);
  assert.match(html, /data-empty-state/);
  assert.match(html, /Nothing else to do/);
  assert.doesNotMatch(html, /data-tasks-list/);
});

test("mobile: rendered as a bottom sheet with a drag handle and close button", () => {
  const html = renderToStaticMarkup(<TasksTray tasks={TASKS} open onClose={noop} onPick={noop} copy={EN_COPY} variant="mobile" />);
  assert.match(html, /data-tasks-tray="mobile"/);
  assert.match(html, /class="grab"/);
  assert.match(html, /class="close"/);
  assert.match(html, /class="mx-act-list"/);
});
