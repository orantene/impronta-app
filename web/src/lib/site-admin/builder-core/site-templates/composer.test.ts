/**
 * Composer unit tests: the copy screen drops invented facts, the palette
 * mapper demotes rather than refuses, and the generator prompt changes voice
 * by family without breaking the agency register.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildGenerationSystemPrompt } from "@/lib/site-admin/builder-core/ai/generate-nodes";
import { validateThemePatch } from "@/lib/site-admin/tokens/registry";

import { COPY_PASS_KEYS, buildCopyPassPrompt, screenCopyReply, screenCopyValue, type CopyPassFacts } from "./copy-pass";
import { LOOKS } from "./looks";
import { themePatchFromPalette } from "./theme-from-palette";

const facts: CopyPassFacts = { businessName: "Uñas Marisol", city: "Playa del Carmen", familyLabel: "beauty", typeLabel: { es: "Salón de uñas", en: "Nail salon" }, services: ["Gelish", "Acrílicas"] };

test("copy screen drops prices, hours, phones, years, claims and dashes; keeps honest copy", () => {
  const bad: Array<[string, string]> = [
    ["home.offer.body", "Manicura desde $250"],
    ["home.offer.body", "Abrimos de 9:00 a 18:00"],
    ["home.offer.body", "Llámanos al 984 123 4567"],
    ["home.offer.body", "Más de 12 años de experiencia"],
    ["home.offer.body", "Salón premiado como el mejor de la Riviera"],
    ["home.offer.body", "Uñas con cariño — desde siempre"],
    ["home.offer.headline", "Un titular demasiado largo para caber en el límite de setenta caracteres que fijamos"],
  ];
  for (const [key, value] of bad) assert.equal(screenCopyValue(key, value, facts).ok, false, value);
  assert.deepEqual(screenCopyValue("home.offer.body", "Gelish y acrílicas, con calma y sin prisa.", facts), { ok: true, value: "Gelish y acrílicas, con calma y sin prisa." });

  const reply = JSON.stringify({ copy: { "home.offer.headline": { es: "Uñas que duran", en: "Nails that last" }, "home.offer.body": { es: "Solo $99", en: "Only $99" }, "nav.home": { es: "x", en: "x" } } });
  const screened = screenCopyReply(reply, { facts, defaults: LOOKS[0].copy, keys: COPY_PASS_KEYS, primaryLocale: "es" });
  assert.deepEqual(Object.keys(screened.copy), ["home.offer.headline"]);
  assert.ok(screened.dropped.some((d) => d.key === "home.offer.body" && /price/.test(d.reason)));
  assert.ok(screened.dropped.some((d) => d.key === "nav.home" && /not allowed/.test(d.reason)));
  assert.deepEqual(screenCopyReply("not json at all", { facts, defaults: LOOKS[0].copy, keys: COPY_PASS_KEYS, primaryLocale: "es" }).copy, {});
});

test("copy prompt carries the ban list and the facts, never a personal field", () => {
  const p = buildCopyPassPrompt({ facts, defaults: LOOKS[1].copy, keys: COPY_PASS_KEYS, primaryLocale: "es" });
  assert.match(p.systemPrompt, /Never invent a fact/);
  assert.match(p.userMessage, /business: Uñas Marisol/);
  assert.match(p.userMessage, /home\.offer\.headline \(max 70 chars\)/);
  assert.doesNotMatch(p.userMessage, /nav\.home/);
});

test("palette: saturated colour with contrast becomes primary; a weak one is demoted to accent; result validates", () => {
  // A light canvas: `luxe` (porcelain). On a dark Look the same navy would rightly be demoted and the yellow promoted.
  const base = LOOKS.find((l) => l.id === "luxe")!.themePatch;
  const r = themePatchFromPalette(base, ["#f6f1ea", "#1e3a5f", "#ffcc00"]);
  assert.equal(r.patch["color.primary"], "#1e3a5f");
  assert.equal(r.patch["color.background"], base["color.background"], "the canvas stays the Look's own");
  assert.ok(r.demoted.length >= 1);
  assert.ok(validateThemePatch({ ...r.patch }).ok);
  assert.deepEqual(themePatchFromPalette(base, ["not-a-colour"]).used, []);
});

test("generator prompt: agency register by default, local-business register with a family, name locked when given", () => {
  const agency = buildGenerationSystemPrompt({ locale: "en" });
  assert.match(agency, /talent-agency platform/);
  assert.match(agency, /Live agency data/);
  assert.match(agency, /NEVER invent a fact/);
  assert.doesNotMatch(agency, /plausible concrete name/);

  const salon = buildGenerationSystemPrompt({ locale: "es", business: { family: "beauty", businessName: "Uñas Marisol", typeLabel: "Nail salon" } });
  assert.match(salon, /small local businesses/);
  assert.match(salon, /called "Uñas Marisol"\. Use that name and no other/);
  assert.match(salon, /Do NOT use hero_search or talent_type_grid/);
  assert.doesNotMatch(salon, /Live agency data/);
});

test("industry text resolves to a business type, whole phrase then words", async () => {
  const { businessTypeFromIndustry } = await import("./compose-site-from-brief.server");
  assert.equal(businessTypeFromIndustry("nail-salon")?.id, "nail-salon");
  assert.equal(businessTypeFromIndustry("food and restaurant")?.id, "restaurant");
  assert.equal(businessTypeFromIndustry("salón de uñas")?.id, "nail-salon");
  assert.equal(businessTypeFromIndustry("zzzz"), null);
});
