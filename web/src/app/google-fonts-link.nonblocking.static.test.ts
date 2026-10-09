/**
 * TUL-495 — GoogleFontsLink must not block first paint of header/main.
 *
 * Talent Max sites mount the link in the body above the shell. A render-
 * blocking stylesheet there holds paint until /api/fonts/css returns.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import { GoogleFontsLink } from "./google-fonts-link";

const TOKENS = {
  "typography.heading-font-family": "Archivo, system-ui, sans-serif",
  "typography.body-font-family": "Archivo, system-ui, sans-serif",
  "type.system": "utility",
  "type.stretch": "118%",
};

test("default GoogleFontsLink is non-blocking (preload + media=print + activate)", () => {
  const html = renderToStaticMarkup(
    React.createElement(GoogleFontsLink, { tokens: TOKENS }),
  );
  assert.match(html, /rel="preload"[^>]*as="style"/);
  assert.match(html, /data-talent-font-stylesheet=""/);
  assert.match(html, /media="print"/);
  assert.match(html, /data-talent-font-stylesheet-activate/);
  assert.match(html, /l\.media='all'/);
  assert.match(html, /<noscript>/);
  // The stylesheet that carries data-talent-font-stylesheet must be print-media.
  assert.match(
    html,
    /<link rel="stylesheet" href="[^"]+" media="print" data-talent-font-stylesheet=""/,
  );
});

test("blocking=true keeps a single render-blocking stylesheet", () => {
  const html = renderToStaticMarkup(
    React.createElement(GoogleFontsLink, { tokens: TOKENS, blocking: true }),
  );
  assert.match(html, /<link rel="stylesheet" href="\/api\/fonts\/css\?/);
  assert.doesNotMatch(html, /media="print"/);
  assert.doesNotMatch(html, /data-talent-font-stylesheet/);
});
