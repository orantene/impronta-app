/**
 * G4: onboarding packs for more trades; the arrival page links to Servicios.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { BEAUTY_PACKS, packKeyForTrade, suggestedServices } from "./essentials";
import { buildArrivalNextSteps, servicesHrefFor } from "./arrival-next-steps";

const WEB = path.resolve(__dirname, "../../..");

const NEW_TRADES: Array<[string, string[]]> = [
  ["facial", ["facial", "limpieza facial", "esthetician", "estética", "skincare"]],
  ["massage", ["massage therapist", "masajista", "spa", "fisioterapia"]],
  ["fitness", ["personal trainer", "yoga", "pilates", "entrenador personal", "crossfit"]],
  ["photography", ["photographer", "fotógrafo", "fotografía de bodas"]],
  ["tutoring", ["math tutor", "profesor de inglés", "english teacher", "clases de guitarra"]],
  ["pets", ["dog groomer", "paseador de perros", "pet sitter", "mascotas"]],
  ["tattoo", ["tattoo artist", "tatuador", "tatuajes"]],
];

test("each new trade is detected from English and Spanish wording", () => {
  for (const [key, said] of NEW_TRADES) {
    for (const s of said) assert.equal(packKeyForTrade(s), key, `${s} -> ${key}`);
  }
});

test("trades matched before G4 keep their pack (no regression)", () => {
  const before: Array<[string, string]> = [
    ["lash artist", "lashes"], ["pestañas", "lashes"], ["nail tech", "nails"], ["manicurista", "nails"],
    ["brow artist", "brows"], ["makeup artist", "makeup"], ["maquillista", "makeup"],
    ["house cleaning", "cleaning"], ["limpieza de casas", "cleaning"], ["barber", "hair"], ["estilista", "hair"],
  ];
  for (const [said, key] of before) assert.equal(packKeyForTrade(said), key, said);
  assert.equal(packKeyForTrade("dentist"), null);
});

test("every pack has services with both languages, positive durations and prices", () => {
  assert.ok(Object.keys(BEAUTY_PACKS).length >= 13);
  for (const pack of Object.values(BEAUTY_PACKS)) {
    assert.ok(pack.services.length >= 3, pack.key);
    for (const s of pack.services) {
      assert.ok(s.en.trim() && s.es.trim(), `${pack.key}: empty name`);
      if (s.en !== "Color") assert.notEqual(s.en.toLowerCase(), s.es.toLowerCase(), `${pack.key}/${s.en}: ES equals EN`);
      assert.ok(s.durationMin > 0 && s.mxnCents > 0, `${pack.key}/${s.en}`);
    }
  }
});

test("service names are unique across packs (a said name must find one pack entry)", () => {
  const seen = new Map<string, string>();
  for (const pack of Object.values(BEAUTY_PACKS)) {
    for (const s of pack.services) {
      for (const n of [s.en, s.es]) {
        const k = n.toLowerCase();
        // "Color" is the same word in both languages inside one hair entry.
        if (seen.has(k) && seen.get(k) !== `${pack.key}/${s.en}`) assert.fail(`duplicate "${n}" in ${pack.key} and ${seen.get(k)}`);
        seen.set(k, `${pack.key}/${s.en}`);
      }
    }
  }
});

test("a new pack suggests MXN prices in Mexico and quotes elsewhere, in the person's language", () => {
  const mx = suggestedServices({ trade: "massage therapist", country: "MX", locale: "es" });
  assert.equal(mx[0].name, "Masaje relajante");
  assert.equal(mx[0].currency, "MXN");
  assert.equal(mx[0].priceCents, 80000);
  assert.equal(mx[0].packKey, "massage");
  const us = suggestedServices({ trade: "photographer", country: "US", locale: "en" });
  assert.equal(us[0].name, "Portrait session");
  assert.equal(us[0].priceCents, null);
  assert.equal(us[0].quote, true);
});

// ─── arrival links to Servicios ───────────────────────────────────────────────

const t = (key: string) => key.replace(/^public\.onboarding\.arrival\./, "");

test("services href: talent panel and business admin; null when unknown", () => {
  assert.equal(servicesHrefFor("https://app.test/talent/today", false), "https://app.test/talent/services");
  assert.equal(servicesHrefFor("/talent/today?x=1", false), "/talent/services");
  assert.equal(servicesHrefFor("https://app.test/luna/admin/", true), "https://app.test/luna/admin/catalog");
  assert.equal(servicesHrefFor("luna", true), null);
  assert.equal(servicesHrefFor(null, true), null);
  assert.equal(servicesHrefFor("https://app.test/luna/admin", false), null);
});

test("next steps: a Services row with the link; without a link the list is unchanged", () => {
  const withLink = buildArrivalNextSteps({ siteLive: false, business: true, servicesHref: "https://app.test/luna/admin/catalog" }, t);
  assert.deepEqual(withLink.map((s) => s.label).slice(0, 3), ["nextVisit", "nextServices", "nextCustomize"]);
  assert.equal(withLink[1].href, "https://app.test/luna/admin/catalog");
  assert.ok(withLink.every((s) => s.done === false));
  const without = buildArrivalNextSteps({ siteLive: false, business: true }, t);
  assert.ok(without.every((s) => s.href === undefined));
  assert.equal(without.length, withLink.length - 1);
  const talent = buildArrivalNextSteps({ siteLive: false, business: false, servicesHref: "/talent/services" }, t);
  assert.deepEqual(talent.map((s) => s.label), ["nextTalentPhotos", "nextServices", "nextTalentBio", "nextTalentShare"]);
  const live = buildArrivalNextSteps({ siteLive: true, business: false, servicesHref: "/talent/services" }, t);
  assert.equal(live[0].done, true);
  assert.equal(live[1].label, "nextServices");
  assert.equal(live[1].done, false);
});

test("the arrival step renders the row as a link and both languages have the words", () => {
  const src = fs.readFileSync(path.join(WEB, "src/components/onboarding/steps/arrival-step.tsx"), "utf8");
  assert.match(src, /servicesHrefFor\(arrival\.panelHref, business\)/);
  assert.match(src, /step\.href \? \(/);
  const en = JSON.parse(fs.readFileSync(path.join(WEB, "messages/en.json"), "utf8"));
  const es = JSON.parse(fs.readFileSync(path.join(WEB, "messages/es.json"), "utf8"));
  assert.equal(en.public.onboarding.arrival.nextServices, "Review your services");
  assert.equal(es.public.onboarding.arrival.nextServices, "Revisa tus servicios");
  assert.doesNotMatch(es.public.onboarding.arrival.nextServices, /—/);
});
