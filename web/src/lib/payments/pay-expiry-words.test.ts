/**
 * TUL-467: /pay printed a bare "20:54" under the price. The expiry and the
 * slot hold now read as a sentence in the venue's zone, named in words.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { interpolate } from "@/i18n/interpolate";
import { payZoneName } from "@/app/(public)/pay/[code]/pay-zone-name";

test("the venue zone reads as a city", () => {
  assert.equal(payZoneName("America/Mexico_City"), "Mexico City");
  assert.equal(payZoneName("America/Argentina/Buenos_Aires"), "Buenos Aires");
  assert.equal(payZoneName("Europe/Madrid"), "Madrid");
});

test("an unset zone says UTC, the zone the clock fell back to", () => {
  assert.equal(payZoneName("UTC"), "UTC");
  assert.equal(payZoneName("Etc/UTC"), "UTC");
  assert.equal(payZoneName(""), "UTC");
  assert.equal(payZoneName(null), "UTC");
});

const thread = (locale: string) =>
  (JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")) as { public: { thread: Record<string, string> } })
    .public.thread;

test("every locale words the expiry and the hold with the time and the zone", () => {
  for (const locale of ["en", "es", "fr"]) {
    for (const key of ["linkValidUntil", "slotKeptUntil"]) {
      const copy = thread(locale)[key];
      assert.ok(copy, `${locale} ${key}`);
      const out = interpolate(copy, { time: "20:54", zone: "Mexico City" });
      assert.match(out, /20:54/, `${locale} ${key}`);
      assert.match(out, /Mexico City/, `${locale} ${key}`);
    }
  }
  assert.equal(
    interpolate(thread("en").linkValidUntil, { time: "20:54", zone: "Mexico City" }),
    "This payment link is valid until 20:54 (Mexico City time).",
  );
});

test("the pay page hands the zone to every view that shows the expiry", () => {
  const page = readFileSync("src/app/(public)/pay/[code]/pay-page.tsx", "utf8");
  const expiries = page.match(/expiresAt=\{expiresAtLabel\}/g)?.length ?? 0;
  assert.ok(expiries > 0);
  assert.equal(page.match(/zoneName=\{zoneName\}/g)?.length, expiries);
  const view = readFileSync("src/app/(public)/pay/[code]/CheckoutView.tsx", "utf8");
  assert.match(view, /t\("public\.thread\.linkValidUntil"\), \{ time: props\.expiresAt/);
  assert.match(view, /t\("public\.thread\.slotKeptUntil"\), \{ time: props\.holdUntil/);
  assert.doesNotMatch(view, /\{props\.expiresAt\}/);
});
