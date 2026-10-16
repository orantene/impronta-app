import { test } from "node:test";
import assert from "node:assert/strict";

import { promoCopy } from "@/lib/promos/copy/talent";
import type { PromoActionError } from "@/lib/promos/fail-from";
import { promoErrorMessage } from "./error-message";

const REASONS: PromoActionError[] = ["not_allowed", "not_found", "invalid", "code_taken", "not_available_yet", "unavailable"];

test("the toast says something different for every reason, in both languages", () => {
  for (const lang of ["es", "en"]) {
    const copy = promoCopy(lang);
    const msgs = REASONS.map((error) => promoErrorMessage(copy, { error }));
    assert.equal(new Set(msgs).size, REASONS.length, lang);
  }
});

test("the short reference shows only for unavailable, and only when sent", () => {
  const es = promoCopy("es");
  assert.match(promoErrorMessage(es, { error: "unavailable", ref: "a1b2c3d4" }), /Código de error: a1b2c3d4$/);
  assert.match(promoErrorMessage(promoCopy("en"), { error: "unavailable", ref: "a1b2c3d4" }), /Error code: a1b2c3d4$/);
  assert.equal(promoErrorMessage(es, { error: "unavailable" }), es.t("err.unavailable"));
  assert.equal(promoErrorMessage(es, { error: "code_taken", ref: "a1b2c3d4" }), es.t("err.code_taken"));
});
