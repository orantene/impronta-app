import assert from "node:assert/strict";
import { test } from "node:test";

import {
  NESTED_BLOCKS_PANEL_COOKIE,
  parseNestedBlocksPanelCookie,
  serializeNestedBlocksPanelCookie,
} from "./use-nested-blocks-preference";

test("no cookie means hidden — the panel is opt-in, not opt-out", () => {
  // null (not false) so the hook can tell "never chose" from "chose closed";
  // both render closed, but only a real choice is worth writing back.
  assert.equal(parseNestedBlocksPanelCookie(""), null);
  assert.equal(parseNestedBlocksPanelCookie("locale=es; other=1"), null);
});

test("a stored choice round-trips in both directions", () => {
  for (const open of [true, false]) {
    const written = serializeNestedBlocksPanelCookie(open, false);
    const [pair] = written.split("; ");
    assert.equal(parseNestedBlocksPanelCookie(pair), open);
  }
});

test("the cookie is not read out of a similarly-named neighbour", () => {
  assert.equal(
    parseNestedBlocksPanelCookie(`x_${NESTED_BLOCKS_PANEL_COOKIE}=1`),
    null,
  );
});

test("the choice outlives the session and stays same-site", () => {
  const written = serializeNestedBlocksPanelCookie(true, true);
  assert.match(written, /max-age=31536000/);
  assert.match(written, /samesite=lax/);
  assert.match(written, /(^|; )secure$/);
  // No `secure` on http://localhost or the local editor could never persist.
  assert.doesNotMatch(serializeNestedBlocksPanelCookie(true, false), /secure/);
});
