/**
 * detail-editing.static.test.ts — the density pass must not have DELETED the
 * per-asset editors, only moved them.
 *
 * THE FAILURE THIS EXISTS FOR
 * Moving a working control from A to B is the classic way a feature quietly
 * stops existing: the new surface renders, looks better, and never sends the
 * PATCH. The tile lost two text inputs in this change; this file asserts they
 * turned up in the detail rail, still bound to `onSaveAlt` / `onSaveTags`, and
 * that the rail is reachable from a tile in ONE click via a control that is
 * not the tile's own activation (which, in single-select mode, closes the
 * whole drawer and would make editing unreachable).
 *
 * WHAT IT CANNOT SEE, said plainly: this is a source read. It proves the wiring
 * is present in the file, not that a click saves. Nothing here executes React.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (file: string) => readFileSync(join(HERE, file), "utf8");

test("[media-density] the grid tile renders no text inputs at all", () => {
  const tile = read("media-library-tile.tsx");
  assert.ok(
    !/<input/.test(tile),
    "the tile is an image, not a form — alt and tag inputs belong to the detail rail",
  );
  assert.ok(
    !/altDraft|tagDraft|onSaveAlt|onSaveTags/.test(tile),
    "no editing state or save handler survives on the tile",
  );
  // The metadata line that used to sit permanently under every thumbnail.
  assert.ok(
    /group-hover:opacity-100/.test(tile),
    "the file-name caption is a hover affordance, not a permanent third line",
  );
});

test("[media-density] the detail rail owns alt + tags and still calls the save handlers", () => {
  const detail = read("media-library-detail.tsx");
  assert.match(detail, /data-media-detail-alt/, "the alt input is in the rail");
  assert.match(detail, /data-media-detail-tag/, "the tag input is in the rail");
  assert.match(
    detail,
    /onSaveAlt\(item, altPayload\(altDraft\)\)/,
    "alt commits through onSaveAlt with the normalized payload",
  );
  assert.match(detail, /onSaveTags\(item, next\)/, "tags commit through onSaveTags");
  assert.match(detail, /onBlur=\{commitAlt\}/, "commit-on-blur is preserved");
  assert.match(
    detail,
    /altNeedsSave\(item\.alt, altDraft\)/,
    "the save decision is the tested pure rule, not a re-derivation",
  );
  // Explicit state on every save (admin edit UX bar: never a silent wait).
  assert.match(detail, /labels\.saving/, "the rail shows a saving state");
});

test("[media-density] the rail is reachable in one click from a tile, without picking it", () => {
  const tile = read("media-library-tile.tsx");
  assert.match(
    tile,
    /data-media-tile-details/,
    "a dedicated details control exists on the tile",
  );
  assert.match(
    tile,
    /event\.stopPropagation\(\)/,
    "opening details must not also activate (and, single-select, pick) the tile",
  );

  const library = read("media-library.tsx");
  assert.match(library, /onOpenDetails=/, "the grid wires the tile's details control");
  assert.match(
    library,
    /onSaveAlt=\{props\.onSaveAlt\}/,
    "the save handlers reach the rail unchanged from the host",
  );
  assert.match(library, /onSaveTags=\{props\.onSaveTags\}/);
});

test("[media-density] the grid is auto-fill, not a fixed four-column ladder", () => {
  const kit = read("media-library-kit.tsx");
  assert.match(
    kit,
    /auto-fill/,
    "a wide drawer must show MORE assets, not bigger ones (owner: 4 columns at ~1900px)",
  );
  const library = read("media-library.tsx");
  assert.ok(
    !/lg:grid-cols-4/.test(library),
    "the fixed column ladder is gone from the live grid",
  );
  assert.match(
    library,
    /LIBRARY_GRID_CLASS/,
    "the grid and its skeleton share ONE template",
  );
});

test("[media-density] the filter lanes are consolidated into one toolbar", () => {
  const library = read("media-library.tsx");
  assert.match(library, /MediaLibraryToolbar/, "one toolbar, not four stacked strips");
  for (const marker of [
    "data-media-kind-filter",
    "data-media-ownership-filter",
    "data-media-folder-filter",
  ]) {
    assert.ok(
      !library.includes(marker),
      `${marker} moved into the toolbar — no filter row is left on the library root`,
    );
  }
  const toolbar = read("media-library-toolbar.tsx");
  // Every lane survived the move. Consolidation must not be deletion.
  for (const marker of [
    "data-media-kind-filter",
    "data-media-ownership-filter",
    "data-media-folder-filter",
    "data-media-filters-button",
  ]) {
    assert.ok(toolbar.includes(marker), `${marker} is present in the toolbar`);
  }
  assert.match(
    toolbar,
    /data-testid="media-library-count"/,
    "the Showing N of M count is inline in the toolbar, not on its own line",
  );
});

test("[media-talent-filter] the client sends talentId server-side, staff lane only", () => {
  const hook = readFileSync(join(HERE, "use-media-library.ts"), "utf8");
  assert.match(
    hook,
    /params\.set\("talentId", filters\.talentProfileId\)/,
    "the talent filter is a request param — never a filter over the loaded page",
  );
  // It sits inside the `source.kind === "tenant"` branch, with kind/ownership.
  const tenantBranch = hook.slice(hook.indexOf('if (source.kind === "tenant") {'));
  assert.ok(
    tenantBranch.indexOf("talentId") < tenantBranch.indexOf("if (cursor)"),
    "talentId is sent from the tenant branch only",
  );

  const select = read("media-library-talent-select.tsx");
  assert.match(select, /data-media-talent-filter/);
  assert.match(
    select,
    /if \(talents\.length === 0\) return null;/,
    "an empty roster renders no control rather than a select of nothing",
  );
});
