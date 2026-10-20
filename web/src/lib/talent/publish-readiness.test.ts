import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  isPublishTransition,
  notReadyToPublishMessage,
  publishBlockers,
  publishGapLabel,
  publishReadiness,
  publishRefusalToSpanish,
  type PublishReadinessInput,
} from "./publish-readiness";

const BASE: PublishReadinessInput = {
  title: "Uñas gel",
  kind: "service",
  priceDisplay: "exact",
  priceType: "flat_package",
  amountCents: 35000,
  durationMinutes: 60,
  currency: "MXN",
  bookingMode: "request",
  reserveMode: "full",
  depositPct: null,
  imageUrls: ["https://x/1.jpg"],
};

test("TUL-1270 #11: a complete service is ready", () => {
  assert.deepEqual(publishReadiness(BASE), { ready: true, missing: [], advice: [] });
});

test("TUL-1270 #11: returns the structured list of every missing field", () => {
  const r = publishReadiness({ ...BASE, title: "  ", amountCents: null, durationMinutes: null, currency: "", imageUrls: [] });
  assert.equal(r.ready, false);
  assert.deepEqual(r.missing, ["name", "price", "length", "currency"]);
  assert.deepEqual(r.advice, ["photo"], "a photo is advice (TUL-825), never a blocker");
});

test("TUL-1270 #11: a quote-priced service needs only a name (no price, no length)", () => {
  const r = publishReadiness({ ...BASE, priceDisplay: "quote", amountCents: null, durationMinutes: null });
  assert.deepEqual(r.missing, []);
  assert.deepEqual(publishReadiness({ ...BASE, priceType: "custom", amountCents: null, durationMinutes: null }).missing, []);
});

test("TUL-1270 #11: length is for timed services; packages and products may be untimed", () => {
  assert.deepEqual(publishReadiness({ ...BASE, kind: "package", durationMinutes: null }).missing, []);
  assert.deepEqual(publishReadiness({ ...BASE, kind: "product", durationMinutes: null }).missing, []);
  assert.deepEqual(publishReadiness({ ...BASE, durationMinutes: 0 }).missing, ["length"]);
});

test("TUL-1270 #11: an instant deposit needs its percent (own mode or inherited default)", () => {
  const dep = { ...BASE, reserveMode: "deposit", depositPct: null };
  assert.deepEqual(publishReadiness({ ...dep, bookingMode: "instant" }).missing, ["deposit"]);
  assert.deepEqual(publishReadiness({ ...dep, bookingMode: null }, "instant").missing, ["deposit"]);
  assert.deepEqual(publishReadiness({ ...dep, bookingMode: null }, "request").missing, []);
  assert.deepEqual(publishReadiness({ ...dep, bookingMode: "instant", depositPct: 30 }).missing, []);
});

test("TUL-1270 #11: only a move onto the menu is a publish transition", () => {
  assert.equal(isPublishTransition("published", undefined), true, "new item published");
  assert.equal(isPublishTransition("published", "draft"), true);
  assert.equal(isPublishTransition("published", "archived"), true);
  assert.equal(isPublishTransition("published", "published"), false, "live quick edits keep working");
  assert.equal(isPublishTransition("draft", "draft"), false);
});

test("TUL-1270 #11: server refusal names what is missing, in English and in Spanish", () => {
  const en = notReadyToPublishMessage("Uñas gel", ["price", "length"]);
  assert.equal(en, "“Uñas gel” is not ready to publish. It still needs a price and a length.");
  assert.equal(publishRefusalToSpanish(en), "“Uñas gel” todavía no está lista para publicar. Le falta un precio y una duración.");
  const three = notReadyToPublishMessage("X", ["name", "price", "currency"]);
  assert.equal(publishRefusalToSpanish(three), "“X” todavía no está lista para publicar. Le falta un nombre, un precio y una moneda.");
  assert.equal(publishRefusalToSpanish("Something else."), null);
  assert.doesNotMatch(en + publishGapLabel("deposit", true), /—/, "no em dashes in new copy");
});

test("TUL-1270 #11: publishBlockers blocks only a move onto the menu; a live item saves its other fields", () => {
  const gap = { ...BASE, durationMinutes: null, currency: "" };
  assert.deepEqual(publishBlockers({ ...gap, status: "published" }, "draft"), ["length", "currency"]);
  assert.deepEqual(publishBlockers({ ...gap, status: "published" }, undefined), ["length", "currency"]);
  assert.deepEqual(publishBlockers({ ...gap, status: "published" }, "published"), [], "live item: Save changes allowed");
  assert.deepEqual(publishBlockers({ ...gap, status: "draft" }, "draft"), [], "Save draft never blocked");
});

test("TUL-1270 #11: the server gate and the editor use the SAME rule (publishBlockers)", () => {
  const actions = readFileSync(join(process.cwd(), "src/lib/talent/offerings-actions.ts"), "utf8");
  assert.match(actions, /const gate = await offeringSaveGate\(admin, talentProfileId, offering\);/);
  assert.match(actions, /if \(!gate\.ok\) return gate;/);
  const gate = readFileSync(join(process.cwd(), "src/lib/talent/offering-save-gate.server.ts"), "utf8");
  assert.match(gate, /publishBlockers\(offering, prior\?\.status,/);
  assert.match(gate, /notReadyToPublishMessage\(/);
  const editor = readFileSync(join(process.cwd(), "src/components/talent/services/EditorScreen.tsx"), "utf8");
  assert.match(editor, /publishBlockers\(\{ \.\.\.item, status: "published" \}, isNew \? undefined : item\.status, defaults\?\.bookingPosture\)/);
  assert.match(editor, /disabled=\{Boolean\(busy\) \|\| blocked\.length > 0\} onClick=\{\(\) => void save\(true\)\}/);
  // A live item's Save changes is never disabled by readiness (the server does not re-gate it either).
  assert.match(editor, /disabled=\{Boolean\(busy\)\} onClick=\{\(\) => void save\(false\)\}>\s*\{busy \? copy\.t\("Saving…"\) : copy\.t\("Save changes"\)\}/);
});

test("TUL-1270 #11: the editor panel shows the missing list (live items get it inline too)", () => {
  const editor = readFileSync(join(process.cwd(), "src/components/talent/services/EditorScreen.tsx"), "utf8");
  assert.match(editor, /<PublishReadinessPanel /);
  const panel = readFileSync(join(process.cwd(), "src/components/talent/services/PublishReadinessPanel.tsx"), "utf8");
  assert.match(panel, /publishGapLabel\(/);
  assert.match(panel, /Listo para publicar/);
  assert.match(panel, /needsLive/);
  const save = readFileSync(join(process.cwd(), "src/components/talent/services/offering-editor-save.ts"), "utf8");
  assert.match(save, /publishRefusalToSpanish\(/);
});
