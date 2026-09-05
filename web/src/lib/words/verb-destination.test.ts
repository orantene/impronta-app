import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { VERB_BLOCK_KINDS, pageCarriesBlock } from "./verb-destination";
import { HEADER_VERBS } from "./presets";

/**
 * The header CTA said "Reserve" and opened the TALENT inquiry, because the
 * label came from the preset and the href was hardcoded for every verb. These
 * pin the half of the fix that can be tested without a database.
 */

test("a page carrying the reserve block is recognised anywhere in its tree", () => {
  const kinds = VERB_BLOCK_KINDS.reserve!;
  const nested = {
    children: [{ children: [{ kind: "reserve_table", props: {} }] }],
  };
  assert.equal(pageCarriesBlock(nested, kinds), true);
  assert.equal(pageCarriesBlock({ kind: "reserve_table" }, kinds), true);
});

test("prose mentioning the block name is NOT a booking page", () => {
  // The whole point of matching the serialised `kind` field rather than the
  // bare name: an operator writing about reserve_table must not turn their
  // about page into the header's booking destination.
  const kinds = VERB_BLOCK_KINDS.reserve!;
  assert.equal(
    pageCarriesBlock({ kind: "text", props: { body: "our reserve_table block" } }, kinds),
    false,
  );
});

test("absent, empty and unserialisable blocks are all 'no', never a throw", () => {
  const kinds = VERB_BLOCK_KINDS.reserve!;
  for (const blocks of [null, undefined, "", 0, [], {}]) {
    assert.equal(pageCarriesBlock(blocks, kinds), false);
  }
  // A cycle cannot be serialised. It must read as "no page proven", not crash
  // the header of every page on the site.
  const cyclic: Record<string, unknown> = { kind: "reserve_table" };
  cyclic.self = cyclic;
  assert.equal(pageCarriesBlock(cyclic, kinds), false);
});

test("every kind this maps to is a REAL builder block", () => {
  // The failure this prevents is the one that caused the bug: a destination
  // that looks wired and resolves to nothing. `headerVerbHref()` has mapped
  // reserve -> /book since F1e and no renderer ever called it.
  const types = readFileSync(
    join(process.cwd(), "src/lib/site-admin/builder-node/types.ts"),
    "utf8",
  );
  for (const [verb, kinds] of Object.entries(VERB_BLOCK_KINDS)) {
    assert.ok(
      (HEADER_VERBS as readonly string[]).includes(verb),
      `${verb} is not a header verb`,
    );
    for (const kind of kinds) {
      assert.ok(
        types.includes(`| "${kind}"`),
        `${kind} is not a builder block kind, so this verb would resolve to nothing`,
      );
    }
  }
});

test("only reserve is mapped, and that is a fact about the codebase", () => {
  // `book` deliberately has no entry: there is no appointments block in
  // types.ts, so it correctly keeps the chat cue rather than being sent to
  // /book, which is appointments-only and renders "No open times".
  assert.deepEqual(Object.keys(VERB_BLOCK_KINDS), ["reserve"]);
});
