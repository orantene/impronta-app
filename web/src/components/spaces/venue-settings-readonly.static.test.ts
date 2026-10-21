/**
 * TUL-1708 (UI follow-up, PM decision): updateVenueSettings stays
 * manage_agency_settings (admin+) server-side — explicitly NOT changed.
 * This test guards the client-side consequence of that decision: a
 * non-admin must not be shown a working Save control that the server will
 * silently refuse, so WorkspacePageView passes `canEdit={isAdmin}` into
 * VenueSettingsCard, and the card hides/disables the editable surface
 * (name, timezone, address fields, Save button) when canEdit is false.
 *
 * Static source assertions only — no render harness, matching the
 * capability-wiring tests elsewhere in this area (e.g.
 * src/lib/access/tul-1708-area-i-capability.static.test.ts).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, "src", p), "utf8");

test("WorkspacePageView gates VenueSettingsCard's edit surface on isAdmin", () => {
  const src = read("components/admin/shell/internal/page-modules/WorkspacePageView.tsx");
  assert.match(
    src,
    /<VenueSettingsCard tenantSlug={tenantSlug} canEdit={isAdmin} \/>/,
    "VenueSettingsCard must be mounted with canEdit={isAdmin}",
  );
});

test("VenueSettingsCard accepts a canEdit prop and defaults it to true", () => {
  const src = read("components/spaces/VenueSettingsCard.tsx");
  assert.match(src, /canEdit\s*=\s*true/, "canEdit must default to true (server is the real gate)");
});

test("VenueSettingsCard disables every editable field when canEdit is false", () => {
  const src = read("components/spaces/VenueSettingsCard.tsx");
  const disabledCount = [...src.matchAll(/disabled=\{!canEdit\}/g)].length;
  // name input, timezone select, 6 address inputs = 8 editable fields.
  assert.equal(disabledCount, 8, "all 8 venue/address fields must be disabled when !canEdit");
});

test("VenueSettingsCard hides the Save control entirely when canEdit is false", () => {
  const src = read("components/spaces/VenueSettingsCard.tsx");
  assert.match(
    src,
    /\{canEdit \? \(\s*<div style=\{\{ display: "flex", alignItems: "center", gap: 12 \}\}>\s*<button\s*type="button"\s*onClick=\{save\}/,
    "the Save button + status row must be wrapped in a canEdit check",
  );
});

test("VenueSettingsCard shows a read-only notice when canEdit is false", () => {
  const src = read("components/spaces/VenueSettingsCard.tsx");
  assert.match(src, /!canEdit \? \(\s*<div[^>]*>\{t\(`\$\{K\}\.readOnly`\)\}/, "must render the readOnly copy when !canEdit");
});

test("the readOnly i18n key exists in both locales", () => {
  const en = read("../messages/en.json");
  const es = read("../messages/es.json");
  assert.match(en, /"readOnly":\s*"[^"]+"/);
  assert.match(es, /"readOnly":\s*"[^"]+"/);
});

test("save() is a no-op when canEdit is false (defense in depth alongside the hidden button)", () => {
  const src = read("components/spaces/VenueSettingsCard.tsx");
  assert.match(src, /function save\(\) \{\s*if \(!canEdit\) return;/);
});
