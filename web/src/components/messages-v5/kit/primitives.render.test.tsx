import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { Avatar, Btn, ChannelTag, Chip, Icon, Pill, formatWhen, initials } from "./primitives";
import { EN_COPY } from "./test-copy";
import { NOW } from "./test-fixtures";

test("Btn: primary is solid green via class, busy is aria-busy, disabled reads grey", () => {
  const ready = renderToStaticMarkup(<Btn variant="primary">Send</Btn>);
  assert.match(ready, /class="btn primary"/);
  const busy = renderToStaticMarkup(<Btn variant="primary" busy>Send</Btn>);
  assert.match(busy, /aria-busy="true"/);
  assert.match(busy, /busy/);
  const off = renderToStaticMarkup(<Btn disabled>Send</Btn>);
  assert.match(off, /class="btn disabled"/);
  assert.match(off, /disabled=""/);
  const danger = renderToStaticMarkup(<Btn variant="danger" size="xl">Cancel booking</Btn>);
  assert.match(danger, /btn danger xl/);
  assert.doesNotMatch(ready, /style=/);
});

test("Avatar: initials for a name, dashed anon for a visitor, me tint for the current user", () => {
  assert.match(renderToStaticMarkup(<Avatar name="Valentina Ruiz" />), />VR</);
  assert.match(renderToStaticMarkup(<Avatar name={null} />), /avatar anon/);
  assert.match(renderToStaticMarkup(<Avatar name="Sofía H." size="sm" me />), /avatar sm me/);
  assert.equal(initials("grupo sol · andrés"), "GS");
});

test("Pill and Chip carry their family class; a chip with onClick is a button with aria-pressed", () => {
  assert.match(renderToStaticMarkup(<Pill tone="needs">Needs reply</Pill>), /pill needs/);
  const chip = renderToStaticMarkup(<Chip on onClick={() => {}}>Mine</Chip>);
  assert.match(chip, /<button[^>]*chip on/);
  assert.match(chip, /aria-pressed="true"/);
  assert.match(renderToStaticMarkup(<Chip soft>Unread</Chip>), /<span class="chip soft"/);
});

test("Icon renders one inline svg with a size class, never a colour", () => {
  const svg = renderToStaticMarkup(<Icon name="check" size={12} />);
  assert.match(svg, /class="i i-12"/);
  assert.doesNotMatch(svg, /#[0-9a-f]{3,6}/i);
  assert.match(renderToStaticMarkup(<ChannelTag channel="whatsapp" copy={EN_COPY} />), /WhatsApp/);
});

test("formatWhen is short: minutes, hours, weekday, date", () => {
  assert.equal(formatWhen("2026-09-17T11:58:00Z", NOW), "2m");
  assert.equal(formatWhen("2026-09-17T09:00:00Z", NOW), "3h");
  assert.equal(formatWhen("2026-09-15T09:00:00Z", NOW), "Tue");
  assert.equal(formatWhen("2026-08-01T09:00:00Z", NOW), "Aug 1");
  assert.equal(formatWhen(null, NOW), "");
});
