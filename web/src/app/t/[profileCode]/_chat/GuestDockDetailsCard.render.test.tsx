import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { createTranslator } from "@/i18n/messages";

import { GuestDockDetailsCard } from "./GuestDockDetailsCard";
import { C } from "./mini-chat-styles";

const t = createTranslator("en");

test("Your details: name is an input; email and phone are read-only text", () => {
  const html = renderToStaticMarkup(
    <GuestDockDetailsCard
      name="Ana Ruiz"
      email="ana@example.com"
      phone="+15555550100"
      token="tok"
      accent="#2f6fed"
      accentInk="#f7f8fa"
      C={C}
      t={t}
    />,
  );
  assert.match(html, /data-guest-dock-details/);
  assert.match(html, /Your details/);
  assert.match(html, /id="guest-dock-details-name"/);
  assert.match(html, /value="Ana Ruiz"/);
  assert.match(html, /ana@example.com/);
  assert.match(html, /\+15555550100/);
  assert.doesNotMatch(html, /type="email"|type="tel"/);
  assert.doesNotMatch(html, /#0f4f3e|#000\b/);
});

test("without a token the name field is disabled and Save is hidden", () => {
  const html = renderToStaticMarkup(
    <GuestDockDetailsCard name="Ana" email={null} phone={null} token={null} accent="#2f6fed" accentInk="#f7f8fa" C={C} t={t} />,
  );
  assert.match(html, /disabled/);
  assert.doesNotMatch(html, />Save</);
  assert.match(html, /Not added yet/);
});
