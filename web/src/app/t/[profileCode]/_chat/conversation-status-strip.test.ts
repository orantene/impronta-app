/**
 * Solo talent docks must not leak the platform tenant name into the
 * post-send "who's on it" strip (live fail: "… de Tulala lo esta viendo").
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveStatusStripActor } from "./conversation-status-strip-actor";

test("solo omitPlatformBrand uses talent brand, never receipt Tulala", () => {
  const actor = resolveStatusStripActor({
    omitPlatformBrand: true,
    brandAgencyName: "Jorg Beauty",
    receiptAgencyName: "Tulala",
    coordinatorDisplayName: "orantene+jorgbeauty",
    stripActorFromAgency: "{first} de {agency}",
  });
  assert.equal(actor, "Jorg Beauty");
  assert.equal(/Tulala/i.test(actor), false);
});

test("hub qualifies a named coordinator with the agency", () => {
  const actor = resolveStatusStripActor({
    omitPlatformBrand: false,
    brandAgencyName: "Impronta",
    receiptAgencyName: "Impronta",
    coordinatorDisplayName: "Maya Lopez",
    stripActorFromAgency: "{first} from {agency}",
  });
  assert.equal(actor, "Maya from Impronta");
});

test("hub without coordinator falls back to agency name", () => {
  const actor = resolveStatusStripActor({
    omitPlatformBrand: false,
    brandAgencyName: "Impronta",
    receiptAgencyName: null,
    coordinatorDisplayName: null,
    stripActorFromAgency: "{first} from {agency}",
  });
  assert.equal(actor, "Impronta");
});
