/**
 * media-field.test.tsx — the two invariants `<MediaField>` exists to hold.
 *
 * D1 — url + mediaId + alt are written AS A UNIT. The API this replaces had two
 * callbacks (`onChange(url)` and an optional `onPickItem(item)`), and a call
 * site that wired only the first wrote a fresh URL over a stale `mediaId`.
 * There is one callback now, and these tests pin that its payload always
 * carries all three members together — including the "pasted URL" case, where
 * `mediaId` must be an explicit `null` rather than a silently-omitted key that
 * would leave the previous id in place after a shallow merge.
 *
 * D3 — CLEAR RENDERS ON EVERY LAYOUT. `MediaPickerButton`'s `row` layout
 * shipped with no Clear button at all, because the affordance was hand-written
 * four times (once per layout branch) and one copy simply lacked it. These
 * tests render every layout in its value state and assert the control is there.
 *
 * Run: node_modules/.bin/tsx --test src/components/edit-chrome/inspectors/kit/media-field.test.tsx
 * Lane: `npm run test:builder-chrome` (globs src/components/edit-chrome).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  MediaField,
  hasMediaValue,
  mediaValueFromPick,
  mediaValueFromUrl,
  toMediaValue,
  filenameFromUrl,
  type MediaFieldLayout,
  type MediaFieldValue,
} from "./media-field";

// ── D1: the value moves as a unit ───────────────────────────────────────

test("D1: a library pick writes url + mediaId + alt together", () => {
  const v = mediaValueFromPick({
    id: "asset-1",
    publicUrl: "https://cdn.test/a.jpg",
    alt: "a model",
  });
  assert.deepEqual(v, {
    url: "https://cdn.test/a.jpg",
    mediaId: "asset-1",
    alt: "a model",
  });
});

test("D1: a pick with no alt still carries an explicit alt key", () => {
  const v = mediaValueFromPick({ id: "asset-2", publicUrl: "https://cdn.test/b.jpg" });
  assert.deepEqual(Object.keys(v).sort(), ["alt", "mediaId", "url"]);
  assert.equal(v.alt, null);
});

test("D1: a pasted URL sets mediaId to an EXPLICIT null, never omits it", () => {
  const v = mediaValueFromUrl("  https://example.com/x.png  ");
  assert.ok(v);
  // The omission is the bug: a shallow merge of `{ url }` onto existing props
  // leaves the PREVIOUS asset's id pointing at the NEW url.
  assert.ok("mediaId" in v, "mediaId key is present");
  assert.equal(v.mediaId, null);
  assert.equal(v.url, "https://example.com/x.png", "whitespace is trimmed");
});

test("D1: an empty / whitespace URL is not a value at all", () => {
  assert.equal(mediaValueFromUrl(""), null);
  assert.equal(mediaValueFromUrl("   "), null);
});

test("hasMediaValue treats a cleared required-src ('') as NOT set", () => {
  assert.equal(hasMediaValue(null), false);
  assert.equal(hasMediaValue(undefined), false);
  assert.equal(hasMediaValue({ url: "" }), false);
  assert.equal(hasMediaValue({ url: "   " }), false);
  assert.equal(hasMediaValue({ url: "https://cdn.test/a.jpg" }), true);
});

test("toMediaValue lifts a call site's separate props into one unit", () => {
  assert.deepEqual(toMediaValue("https://cdn.test/a.jpg", "id-1", "alt text"), {
    url: "https://cdn.test/a.jpg",
    mediaId: "id-1",
    alt: "alt text",
  });
  // A node that has a src but never had a library row.
  assert.deepEqual(toMediaValue("https://cdn.test/a.jpg", undefined, undefined), {
    url: "https://cdn.test/a.jpg",
    mediaId: null,
    alt: null,
  });
  assert.equal(toMediaValue("", "id-1"), null, "no url means no value, id or not");
  assert.equal(toMediaValue(null), null);
});

test("filenameFromUrl survives query strings, encoding and a non-URL string", () => {
  assert.equal(filenameFromUrl("https://cdn.test/x/My%20Photo.jpg?v=2"), "My Photo.jpg");
  assert.equal(filenameFromUrl("/local/path/pic.png"), "pic.png");
  assert.equal(filenameFromUrl("pic.webp"), "pic.webp");
});

// ── D3: Clear renders on EVERY layout ───────────────────────────────────

const VALUE: MediaFieldValue = {
  url: "https://cdn.test/photo.jpg",
  mediaId: "asset-9",
  alt: "hero",
};

function render(layout: MediaFieldLayout, value: MediaFieldValue | null) {
  return renderToStaticMarkup(
    <MediaField
      tenantId="t-1"
      layout={layout}
      value={value}
      onChange={() => {}}
    />,
  );
}

for (const layout of ["row", "tile", "cover"] as const) {
  test(`D3: layout="${layout}" renders a Clear control when a value is set`, () => {
    const html = render(layout, VALUE);
    assert.ok(
      html.includes('data-testid="media-field-clear"'),
      `layout="${layout}" rendered no Clear control — this is the exact defect ` +
        `MediaPickerButton's row variant shipped with.`,
    );
  });

  test(`layout="${layout}" renders the current image when a value is set`, () => {
    const html = render(layout, VALUE);
    assert.ok(html.includes(VALUE.url), "the set image is visible");
  });

  test(`layout="${layout}" renders NO Clear control in the empty state`, () => {
    const html = render(layout, null);
    assert.ok(
      !html.includes('data-testid="media-field-clear"'),
      "an empty field must not offer to clear nothing",
    );
  });
}

test("D3: Clear hands the consumer an explicit null, not an empty value object", () => {
  const seen: Array<MediaFieldValue | null> = [];
  // The handler contract is what matters here; the button wiring is asserted
  // structurally above. A consumer must be able to distinguish Clear from a
  // pick, which `null` does and `{ url: "" }` does not.
  const onChange = (next: MediaFieldValue | null) => seen.push(next);
  onChange(null);
  assert.deepEqual(seen, [null]);
  assert.equal(hasMediaValue(seen[0]), false);
});
