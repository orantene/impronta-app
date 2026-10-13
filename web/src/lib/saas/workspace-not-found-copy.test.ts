import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { workspaceNotFoundCopy, workspaceNotFoundLang } from "./workspace-not-found-copy";

test("TUL-697: Spanish workspace 404 is Spanish and carries the workspace name", () => {
  const c = workspaceNotFoundCopy("es", "QA Grok Salon");
  assert.equal(c.lang, "es");
  assert.equal(c.heading, "Esta página ya no está aquí");
  assert.equal(c.eyebrow, "QA GROK SALON");
  assert.match(c.body, /QA Grok Salon/);
  assert.doesNotMatch(JSON.stringify(c), /Studio|We couldn/);
});

test("TUL-697: English workspace 404 and nameless fallback never say Studio", () => {
  assert.equal(workspaceNotFoundCopy("en", "Casa Luna").heading, "This page is no longer here");
  const nameless = workspaceNotFoundCopy("es-MX", "  ");
  assert.equal(nameless.eyebrow, "ESTE SITIO");
  assert.equal(workspaceNotFoundCopy("en", null).eyebrow, "THIS SITE");
  assert.equal(workspaceNotFoundLang(null), "en");
});

test("TUL-697: not-found.tsx uses the copy helper, not a hardcoded English 'Studio'", () => {
  const src = readFileSync(path.join(__dirname, "..", "..", "app", "not-found.tsx"), "utf8");
  assert.doesNotMatch(src, /"Studio"/);
  assert.match(src, /workspaceNotFoundCopy/);
});
