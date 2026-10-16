import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const footer = readFileSync(join(__dirname, "footer.tsx"), "utf8");
const privacy = readFileSync(join(__dirname, "..", "analytics", "privacy-choices-link.tsx"), "utf8");

// TUL-886 leftovers: at 390px the footer links measured 23px and the
// "Opciones de privacidad" button 21px, under the 24px WCAG 2.2 AA target size.
test("TUL-886: footer column links are at least 24px tall", () => {
  assert.match(footer, /className="inline-flex min-h-6 items-center text-\[0\.9375rem\]/);
  assert.doesNotMatch(footer, /className="inline-block text-\[0\.9375rem\]/);
});

test("TUL-886: the privacy choices button is at least 24px tall", () => {
  assert.match(privacy, /inline-flex min-h-6 items-center/);
});
