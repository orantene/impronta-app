/** TUL-1026: a Today appointment row names its location once, localized, for studio / away / online. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { agendaI18n } from "@/lib/talent-agenda/agenda-i18n";
import { placeLabelFor } from "./record-actions";

const label = (where: { mode?: string; label?: string | null }, locale: "en" | "es", hasStudio = false) => {
  const raw = placeLabelFor(where, { hasStudio });
  return raw === undefined ? undefined : agendaI18n(locale)(raw);
};

describe("TUL-1026 Today row location label", () => {
  it("online reads En línea in ES and Online in EN (one label, no mixed language)", () => {
    assert.equal(label({ mode: "online", label: "" }, "es"), "En línea");
    assert.equal(label({ mode: "online", label: "" }, "en"), "Online");
  });
  it("studio with no typed place reads En tu estudio / At your studio", () => {
    assert.equal(label({ mode: "studio", label: "" }, "es", true), "En tu estudio");
    assert.equal(label({ mode: "studio", label: "" }, "en", true), "At your studio");
  });
  it("away shows the typed address once, untranslated", () => {
    assert.equal(label({ mode: "away", label: "Av. Reforma 10" }, "es"), "Av. Reforma 10");
    assert.equal(label({ mode: "away", label: "Av. Reforma 10" }, "en"), "Av. Reforma 10");
  });
  it("never prints a channel word as the place", () => {
    assert.equal(label({ mode: "studio", label: "Booking" }, "es"), undefined);
  });
  it("the Today row renders exactly one place line through the helper", () => {
    const src = readFileSync(join(process.cwd(), "src/components/admin/shell/internal/talent/agenda/AgendaTodayPage.tsx"), "utf8");
    assert.equal((src.match(/copy\.t\(placeLabelFor\(item\.where\)/g) ?? []).length, 1);
  });
});
