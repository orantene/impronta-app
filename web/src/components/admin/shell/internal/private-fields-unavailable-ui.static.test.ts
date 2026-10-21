/**
 * TUL-1269: when legal name / date of birth / phone could not be loaded, the editors
 * must DISABLE those inputs and say why. The save omits the fields, so an enabled input
 * would look like it saved and then lose what the user typed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { translateDashboardText } from "./dashboard-i18n";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), "utf8");
const webRoot = join(here, "../../../../..");

const NOTE = "Private details could not be loaded. Reload to edit them.";

const identityEditor = read("drawers/profile-shell/profile-shell-modules/profile-identity-editor.tsx");
const drawer = read("drawers/profile-shell/TalentProfileShellDrawer.tsx");

test("identity editor disables legal name, date of birth and phone when private fields are unavailable", () => {
  assert.match(identityEditor, /privateFieldsUnavailable\?: boolean/);
  // Legal name input
  assert.match(identityEditor, /disabled=\{isFieldLocked\("identity\.legalName"\) \|\| !!privateFieldsUnavailable\}/);
  // Date of birth input (the type="date" input)
  const dob = identityEditor.match(/<input\s+type="date"[\s\S]*?\/>/)?.[0] ?? "";
  assert.match(dob, /disabled=\{!!privateFieldsUnavailable\}/);
  // Phone input
  const phone = identityEditor.match(/<IntlPhoneInput\s+variant="phone"[\s\S]*?onChange=/)?.[0] ?? "";
  assert.match(phone, /disabled=\{disabled \|\| !!privateFieldsUnavailable\}/);
});

test("identity editor shows the note only when unavailable, through the dashboard copy", () => {
  assert.match(identityEditor, /\{privateFieldsUnavailable && \(/);
  assert.ok(identityEditor.includes(`copy.t("${NOTE}")`));
});

test("the drawer tracks the hydration result and passes it to the editor", () => {
  // The state + omit logic lives in use-private-fields-gate.ts (moved out of the
  // drawer for the size ratchet); the drawer wires it in three places.
  const gate = read("drawers/profile-shell/profile-shell-modules/use-private-fields-gate.ts");
  assert.match(gate, /setUnavailable\(!loadedRef\.current\)/);
  assert.match(gate, /private_fields_available\?: boolean \}\)\.private_fields_available === true/);
  // The same flag still gates the save payload.
  assert.match(gate, /omitUnlessLoaded\(payload, loadedRef\.current, PRIVATE_IDENTITY_PAYLOAD_KEYS/);
  assert.match(drawer, /const privateFields = usePrivateFieldsGate\(\)/);
  assert.match(drawer, /privateFields\.markHydrated\(edRes\.data\)/);
  assert.match(drawer, /const identityPayload = privateFields\.scrub\(\{/);
  assert.match(drawer, /privateFieldsUnavailable=\{privateFields\.unavailable\}/);
});

test("the unavailable note has a Spanish row, no em dashes, no unaccented markers", () => {
  const es = translateDashboardText(NOTE, "es");
  assert.notEqual(es, NOTE, "missing Spanish row");
  assert.equal(translateDashboardText(NOTE, "en"), NOTE);
  assert.doesNotMatch(NOTE + es, /—/);
  assert.match(es, /datos privados/);
});

test("onboarding basics disables the same inputs and uses the same sentence", () => {
  const steps = readFileSync(join(webRoot, "src/app/(workspace)/talent/onboarding/onboarding-steps.tsx"), "utf8");
  assert.equal((steps.match(/disabled=\{!privateFieldsAvailable\}/g) ?? []).length, 2, "phone + date of birth");
  assert.ok(steps.includes(NOTE));
});
