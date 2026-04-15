/**
 * Executable Phase 1 QA: invariants for public rendering, stale transitions, EN-edit patches.
 * Run: npm run test:phase1-i18n
 */
import assert from "node:assert/strict";
import test from "node:test";

import { publicBioForLocale } from "@/lib/translation/public-bio";
import {
  buildBioEnEditExtras,
  nextBioEsStatusAfterEnglishChanged,
} from "@/lib/translation/talent-bio-translation-service";

test("public bio: non-empty ES always shown on /es (incl. stale semantics)", () => {
  assert.equal(publicBioForLocale("es", "New English", "Texto español viejo"), "Texto español viejo");
});

test("public bio: empty ES falls back to EN on es locale", () => {
  assert.equal(publicBioForLocale("es", "Solo inglés", ""), "Solo inglés");
  assert.equal(publicBioForLocale("es", "Solo inglés", "   "), "Solo inglés");
});

test("public bio: en locale uses English source", () => {
  assert.equal(publicBioForLocale("en", "EN text", "ES text"), "EN text");
});

test("public bio: en locale falls back to Spanish when English empty", () => {
  assert.equal(publicBioForLocale("en", "", "Solo español"), "Solo español");
  assert.equal(publicBioForLocale("en", "   ", "ES"), "ES");
});

test("stale: already stale → no new status from EN-change helper", () => {
  assert.equal(nextBioEsStatusAfterEnglishChanged("stale", "published"), null);
});

test("stale: published ES + non-stale status → stale on EN edit", () => {
  assert.equal(nextBioEsStatusAfterEnglishChanged("approved", "hola"), "stale");
  assert.equal(nextBioEsStatusAfterEnglishChanged("auto", "hola"), "stale");
});

test("stale: no published ES → no stale transition", () => {
  assert.equal(nextBioEsStatusAfterEnglishChanged("approved", ""), null);
  assert.equal(nextBioEsStatusAfterEnglishChanged("approved", "  "), null);
});

test("buildBioEnEditExtras: identical EN text does not bump bio_en_updated_at", () => {
  const { payload } = buildBioEnEditExtras({
    talentProfileId: "00000000-0000-4000-8000-000000000001",
    prev: {
      bio_en: "Same",
      bio_es: "Español",
      bio_es_draft: null,
      bio_es_status: "approved",
      bio_en_draft: null,
      bio_en_status: "missing",
      short_bio: "Same",
    },
    nextShortBio: "Same",
    actorId: "00000000-0000-4000-8000-000000000002",
    nowIso: "2020-01-01T00:00:00.000Z",
  });
  assert.equal("bio_en_updated_at" in payload, false);
});

test("buildBioEnEditExtras: EN text change + published ES → stale + audit", () => {
  const { payload, audit } = buildBioEnEditExtras({
    talentProfileId: "00000000-0000-4000-8000-000000000001",
    prev: {
      bio_en: "Old",
      bio_es: "Viejo",
      bio_es_draft: null,
      bio_es_status: "approved",
      bio_en_draft: null,
      bio_en_status: "missing",
      short_bio: "Old",
    },
    nextShortBio: "New",
    actorId: "00000000-0000-4000-8000-000000000002",
    nowIso: "2020-01-01T00:00:00.000Z",
  });
  assert.equal(payload.bio_es_status, "stale");
  assert.equal(payload.bio_en_updated_at, "2020-01-01T00:00:00.000Z");
  assert.equal(audit?.eventType, "en_changed_mark_stale");
});
