import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { detectDefaultCountry } from "./guest-phone";
import { resolveCountryIso } from "./staff-phone-country";

test("resolveCountryIso accepts ISO2 and English names", () => {
  assert.equal(resolveCountryIso("mx"), "MX");
  assert.equal(resolveCountryIso(" Mexico "), "MX");
  assert.equal(resolveCountryIso("Argentina"), "AR");
  assert.equal(resolveCountryIso("Narnia"), null);
  assert.equal(resolveCountryIso(null), null);
});

test("workspace country wins over ip/browser; fallback chain unchanged without it", () => {
  assert.equal(detectDefaultCountry({ workspaceCountry: "AR", ipCountry: "US" }), "AR");
  assert.equal(detectDefaultCountry({ workspaceCountry: "bogus", ipCountry: "US" }), "US");
  assert.equal(detectDefaultCountry({ ipCountry: "US" }), "US");
  assert.equal(detectDefaultCountry({}), "MX");
});

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("field reads the workspace country context; layouts provide it", () => {
  assert.match(read("components/ui/guest-phone-field.tsx"), /useStaffPhoneCountry\(\)/);
  assert.match(read("app/(workspace)/[tenantSlug]/admin/layout.tsx"), /StaffPhoneCountryProvider/);
  assert.match(read("app/(workspace)/talent/_talent-layout-inner.tsx"), /StaffPhoneCountryProvider/);
});

test("updateAdminClientProfile validates and stores E.164", () => {
  const src = read("lib/server-actions/admin-clients.ts");
  const i = src.indexOf("export async function updateAdminClientProfile");
  assert.ok(i > 0);
  assert.match(src.slice(i), /checkStaffPhone\(/);
});
