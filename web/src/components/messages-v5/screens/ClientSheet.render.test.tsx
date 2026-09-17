import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ESSENTIALS, MATCH } from "../kit/test-fixtures";
import { EN_COPY } from "../kit/test-copy";

import { ClientSheet } from "./ClientSheet";

const noop = () => {};

test("closed renders nothing", () => {
  const html = renderToStaticMarkup(<ClientSheet essentials={ESSENTIALS} open={false} onClose={noop} copy={EN_COPY} variant="desktop" onAction={noop} />);
  assert.equal(html, "");
});

test("no matchState (L2 minimal contract): identity pill, read-only summary, 'Edit contact' routes through onAction", () => {
  const html = renderToStaticMarkup(<ClientSheet essentials={ESSENTIALS} open onClose={noop} copy={EN_COPY} variant="desktop" onAction={noop} />);
  assert.match(html, /data-client-summary/);
  assert.match(html, /Valentina Ruiz/);
  assert.match(html, /data-edit-contact/);
  assert.doesNotMatch(html, /data-client-save/);
  assert.doesNotMatch(html, /style=/);
});

test("matchState present: editable fields, two-matches list, Save", () => {
  const html = renderToStaticMarkup(
    <ClientSheet
      essentials={ESSENTIALS}
      open
      onClose={noop}
      copy={EN_COPY}
      variant="desktop"
      onAction={noop}
      matchState={{ name: "Marco Salinas", phone: "+529987710033", email: "", matches: [MATCH], selected: "new", busy: false, refusal: null }}
      onFieldChange={noop}
      onSelectMatch={noop}
      onSave={noop}
    />,
  );
  assert.match(html, /data-two-matches/);
  assert.match(html, /Marco Salinas/);
  assert.match(html, /data-client-save/);
  assert.match(html, /Save</);
});

test("matchState with a refusal: already_linked draws the refusal line, not free text", () => {
  const html = renderToStaticMarkup(
    <ClientSheet
      essentials={ESSENTIALS}
      open
      onClose={noop}
      copy={EN_COPY}
      variant="desktop"
      onAction={noop}
      matchState={{ name: "Marco", phone: "+529987710033", email: "", matches: [], selected: "new", busy: false, refusal: "already_linked" }}
    />,
  );
  assert.match(html, /data-refusal="already_linked"/);
});

test("busy save: button shows the saving label", () => {
  const html = renderToStaticMarkup(
    <ClientSheet
      essentials={ESSENTIALS}
      open
      onClose={noop}
      copy={EN_COPY}
      variant="desktop"
      onAction={noop}
      matchState={{ name: "Marco", phone: "", email: "", matches: [], selected: "new", busy: true, refusal: null }}
      onSave={noop}
    />,
  );
  assert.match(html, /Saving/);
});
