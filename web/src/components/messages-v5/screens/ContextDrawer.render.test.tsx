import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ESSENTIALS, STATE_NEEDS } from "../kit/test-fixtures";
import { EN_COPY } from "../kit/test-copy";

import { ContextDrawer } from "./ContextDrawer";

const noop = () => {};

test("closed renders nothing", () => {
  const html = renderToStaticMarkup(
    <ContextDrawer open={false} essentials={ESSENTIALS} state={STATE_NEEDS} chips={[]} tasks={[]} itemsLabel="Items" loading={false} copy={EN_COPY} variant="desktop" onAction={noop} onClose={noop} />,
  );
  assert.equal(html, "");
});

test("open: a desktop sheet titled with the client's name, wrapping the context panel", () => {
  const html = renderToStaticMarkup(
    <ContextDrawer open essentials={ESSENTIALS} state={STATE_NEEDS} chips={[]} tasks={[]} itemsLabel="Items" loading={false} copy={EN_COPY} variant="desktop" onAction={noop} onClose={noop} />,
  );
  assert.match(html, /data-sheet="desktop"/);
  assert.match(html, /Valentina Ruiz/);
  assert.match(html, /data-context-panel/);
  assert.doesNotMatch(html, /style=/);
});
