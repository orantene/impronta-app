import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { IdentityCaptureCard } from "./IdentityCaptureCard";
import { EN_COPY } from "./test-copy";
import { MATCH } from "./test-fixtures";

const base = { name: "Marco Salinas", phone: "+52 998 771 0033", email: "", matches: [MATCH], copy: EN_COPY, onChange: () => {}, onSelect: () => {}, onSave: () => {} };

test("idle: fields prefilled, match offered and selected, Create new explicit, Save and link", () => {
  const html = renderToStaticMarkup(<IdentityCaptureCard {...base} selected="c-77" state="idle" />);
  assert.match(html, /card k-id me wide/);
  assert.match(html, /class="cat">Identity</);
  assert.match(html, /pill due">Needed before a hold/);
  assert.match(html, /value="Marco Salinas"/);
  assert.match(html, /value="\+52 998 771 0033"/);
  assert.match(html, /placeholder="name@email"/);
  assert.match(html, /role="radio" aria-checked="true"[^>]*>.*Marco Salinas · existing client/);
  assert.match(html, /Same phone/);
  assert.match(html, /pill done">match/);
  assert.match(html, /role="radio" aria-checked="false"[^>]*>.*Create a new client/);
  assert.match(html, /data-identity-save[^>]*>Save and link/);
  assert.match(html, /replaces &quot;Visitor&quot; in this thread/);
});

test("matching and saving are busy; refused shows the refusal sentence; done reads Linked and hides the form choices", () => {
  const matching = renderToStaticMarkup(<IdentityCaptureCard {...base} selected="new" state="matching" />);
  assert.match(matching, /aria-busy="true"/);
  assert.match(matching, /Looking for a match/);
  const saving = renderToStaticMarkup(<IdentityCaptureCard {...base} selected="c-77" state="saving" />);
  assert.match(saving, />Saving</);
  const refused = renderToStaticMarkup(<IdentityCaptureCard {...base} selected="new" state="refused" refusal="identity_unconfirmed" />);
  assert.match(refused, /data-refusal="identity_unconfirmed"/);
  assert.match(refused, /identity is not confirmed/i);
  const done = renderToStaticMarkup(<IdentityCaptureCard {...base} selected="c-77" state="done" linkedName="Marco Salinas" />);
  assert.match(done, /pill done">Linked to Marco Salinas/);
  assert.doesNotMatch(done, /data-identity-save/);
  assert.doesNotMatch(done, /Create a new client/);
});

test("empty matches offers only Create new", () => {
  const html = renderToStaticMarkup(<IdentityCaptureCard {...base} matches={[]} selected="new" state="idle" />);
  assert.doesNotMatch(html, /existing client/);
  assert.match(html, /aria-checked="true"[^>]*>.*Create a new client/);
});
