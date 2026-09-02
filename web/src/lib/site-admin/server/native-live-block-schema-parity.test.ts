/**
 * native-live-block-schema-parity.test.ts - BUILDER 2027 P2B.
 *
 * `renderNativeLiveBlock` hands a native node's props to the curated section's
 * own Zod schema and renders the section's Component ONLY when that parse
 * succeeds. That guard is the right degradation, and it is also a perfect place
 * to hide a dead feature: if the schema rejected the mapped config (one
 * required field with no default, one enum member renamed on one side) every
 * native `directory` node would fall back forever, on every page, with nothing
 * red. The block would still look fine, because the fallback IS a correct
 * render.
 *
 * So the parse is asserted directly, against the real schemas.
 *
 * Runner: `tsx --test`, reached by `test:builder` (which expands
 * `src/lib/site-admin/server` recursively). That lane supplies the
 * `server-only` mock the curated section module graph needs.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  nativeDirectoryPropsToSectionConfig,
  nativeHeaderWidgetPropsToSectionConfig,
} from "@/lib/site-admin/builder-node/native-live-block-renderer";
import { directorySchemaV1 } from "@/lib/site-admin/sections/directory/schema";
import { headerWidgetSchemaV1 } from "@/lib/site-admin/sections/shared/header-widget";

test("a freshly inserted directory node parses, so the live path actually engages", () => {
  // A node dropped from the gallery carries almost no props. If THIS fails,
  // every directory on every page is silently stuck on its fallback.
  const parsed = directorySchemaV1.safeParse(
    nativeDirectoryPropsToSectionConfig({}),
  );
  assert.ok(
    parsed.success,
    parsed.success
      ? ""
      : "default directory node must parse; issues: " +
          JSON.stringify(parsed.error.issues),
  );
});

test("an authored scope survives the mapping into the section config", () => {
  const parsed = directorySchemaV1.safeParse(
    nativeDirectoryPropsToSectionConfig({
      scope: "by_talent_type",
      talentTypeKeys: ["chef"],
      manualProfileCodes: [],
      tagKeys: [],
      pageSize: 12,
      headline: "Our Chefs",
      defaultSort: "newest",
      topBarMode: "none",
      sidebarShow: true,
    }),
  );
  assert.ok(parsed.success);
  if (!parsed.success) return;
  // A rename on either side turns the band from "our chefs" into "everyone":
  // the operator's scope silently dropped, the page silently wrong.
  assert.equal(parsed.data.scope, "by_talent_type");
  assert.deepEqual(parsed.data.talentTypeKeys, ["chef"]);
  assert.equal(parsed.data.pageSize, 12);
  assert.equal(parsed.data.headline, "Our Chefs");
  assert.equal(parsed.data.defaultSort, "newest");
  assert.equal(parsed.data.topBarMode, "none");
  assert.equal(parsed.data.sidebarShow, true);
});

test("props the operator never set fall through to the section's own defaults", () => {
  const parsed = directorySchemaV1.safeParse(
    nativeDirectoryPropsToSectionConfig({ headline: "People" }),
  );
  assert.ok(parsed.success);
  if (!parsed.success) return;
  assert.equal(parsed.data.scope, "all");
  assert.equal(parsed.data.pageSize, 24);
  assert.equal(
    parsed.data.cardStyle,
    undefined,
    "UNSET must stay UNSET so the tenant Card Design default can still apply",
  );
});

test("the header widget config parses and carries only what the widget honours", () => {
  const parsed = headerWidgetSchemaV1.safeParse(
    nativeHeaderWidgetPropsToSectionConfig({ label: "Account", icon: "user" }),
  );
  assert.ok(parsed.success);
  if (!parsed.success) return;
  assert.equal(parsed.data.label, "Account");
  // The shared schema is passthrough, so a spread of the whole node props would
  // smuggle style, href and layerLabel into the curated section payload.
  assert.deepEqual(
    Object.keys(parsed.data).sort(),
    ["icon", "label"],
    "only the keys the live widget reads may cross",
  );
});

test("a widget with nothing authored still parses to an empty, valid config", () => {
  const parsed = headerWidgetSchemaV1.safeParse(
    nativeHeaderWidgetPropsToSectionConfig({}),
  );
  assert.ok(parsed.success);
  assert.deepEqual(parsed.success ? parsed.data : null, {});
});

test("a blank label is dropped rather than passed as an empty string", () => {
  const parsed = headerWidgetSchemaV1.safeParse(
    nativeHeaderWidgetPropsToSectionConfig({ label: "   " }),
  );
  assert.ok(parsed.success);
  assert.equal(parsed.success ? parsed.data.label : "x", undefined);
});
