import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { EN_COPY } from "../kit/test-copy";
import { RenameInline, RenameInlineView } from "./RenameInline";

const noop = () => {};
const viewBase = { value: "Beach wedding · Tulum · Aug 14", phase: "idle" as const, refusalCode: null, copy: EN_COPY, variant: "desktop" as const, onChange: noop, onSave: noop, onCancel: noop };

test("idle: input carries the value, Save and Cancel present, no hint or refusal", () => {
  const html = renderToStaticMarkup(<RenameInlineView {...viewBase} />);
  assert.match(html, /data-rename-inline="true" data-rename-phase="idle"/);
  assert.doesNotMatch(html, /aria-busy="true"/);
  assert.match(html, /value="Beach wedding · Tulum · Aug 14"/);
  assert.match(html, /data-rename-cancel[^>]*>Cancel/);
  assert.match(html, /data-rename-save[^>]*>Save/);
  assert.doesNotMatch(html, /data-system-line|data-refusal/);
  assert.doesNotMatch(html, /style=/);
});

test("saving: aria-busy, input disabled, Save reads Saving", () => {
  const html = renderToStaticMarkup(<RenameInlineView {...viewBase} phase="saving" />);
  assert.match(html, /data-rename-phase="saving"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /<input[^>]*disabled=""/);
  assert.match(html, /data-rename-save[^>]*>Saving/);
});

test("refused: the refusal sentence shows and the generated hint does not", () => {
  const html = renderToStaticMarkup(<RenameInlineView {...viewBase} phase="refused" refusalCode="invalid" generated />);
  assert.match(html, /data-refusal="invalid"/);
  assert.match(html, /cannot be saved/i);
  assert.doesNotMatch(html, /data-system-line/);
});

test("generated hint shows only when generated and not refused", () => {
  const html = renderToStaticMarkup(<RenameInlineView {...viewBase} generated />);
  assert.match(html, /data-system-line/);
  assert.match(html, /Named from the first message/);
  const html2 = renderToStaticMarkup(<RenameInlineView {...viewBase} generated={false} />);
  assert.doesNotMatch(html2, /data-system-line/);
});

test("mobile variant uses the mx-rename grammar", () => {
  const html = renderToStaticMarkup(<RenameInlineView {...viewBase} variant="mobile" />);
  assert.match(html, /class="mx-rename"/);
});

test("RenameInline (the L2-contract wrapper) starts idle with the given name and forwards `generated`", async () => {
  const html = renderToStaticMarkup(
    <RenameInline
      name="Marco Ruiz"
      version={4}
      onSave={async () => ({ ok: true as const })}
      onCancel={noop}
      copy={EN_COPY}
      variant="desktop"
      generated
    />,
  );
  assert.match(html, /data-rename-phase="idle"/);
  assert.match(html, /value="Marco Ruiz"/);
  assert.match(html, /Named from the first message/);
});
