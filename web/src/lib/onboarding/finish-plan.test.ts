import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { arrivalFromStamp, parseArrivalStamp } from "./arrival";
import { finishPlan } from "./finish-plan";

const site = { publicUrl: "https://el-paisa.tulala.digital", editorUrl: "https://el-paisa.tulala.digital/?edit=1", adminPath: "https://app.tulala.digital/el-paisa/admin" };
const composed = parseArrivalStamp({ outcome: "composed", placed: { photos: { hero: "type" } } });
const person = { name: "Mariana", city: null };

function msg(locale: "en" | "es", key: string): string {
  const root = JSON.parse(readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf8")) as Record<string, unknown>;
  const v = key.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), root);
  assert.equal(typeof v, "string", `${locale}:${key} missing`);
  return v as string;
}

test("studio finish: requests wording, one primary action (add first member), no 'bookable'", () => {
  for (const stamp of [composed, parseArrivalStamp({ outcome: "fallback_used" })]) {
    const a = arrivalFromStamp({ path: "business", stamp, person, businessName: "Uñas Mariana", services: 3, site, talent: null, liveCheck: { ok: true } });
    const plan = finishPlan(a);
    assert.equal(plan.kind, "inquiry_only");
    if (plan.kind !== "inquiry_only") return;
    assert.equal(plan.primary.id, "add_first_member");
    assert.equal(plan.primary.href, "https://app.tulala.digital/el-paisa/admin/roster/new");
    assert.equal(plan.secondary.id, "also_book_myself");
    assert.equal(plan.secondary.href, "https://app.tulala.digital/el-paisa/admin/settings");

    assert.equal(msg("es", plan.titleKey), "Tu página está lista para recibir solicitudes");
    assert.equal(msg("en", plan.titleKey), "Your page is ready for requests");
    assert.equal(msg("es", plan.primary.labelKey), "Agrega a tu primer integrante para empezar a recibir reservas");
    assert.equal(msg("en", plan.primary.labelKey), "Add your first team member to start taking bookings");
    assert.equal(msg("es", plan.secondary.labelKey), "También quiero recibir reservas yo");
    assert.equal(msg("en", plan.secondary.labelKey), "Also take bookings yourself");
    for (const l of ["en", "es"] as const) {
      for (const k of [plan.titleKey, plan.subKey, plan.primary.labelKey, plan.secondary.labelKey]) {
        const s = msg(l, k);
        assert.ok(!/—|–/.test(s), `no dashes in ${l}:${k}`);
        assert.ok(!/bookable|reservable/i.test(msg(l, plan.titleKey) + msg(l, plan.subKey)));
      }
    }
  }
});

test("myself and both finish are unchanged (standard)", () => {
  const talent = arrivalFromStamp({ path: "talent", stamp: null, person, businessName: null, services: 2, site: null, talent: { publicUrl: "https://tulala.digital/t/abc", todayUrl: "https://app.tulala.digital/talent/today" } });
  assert.equal(finishPlan(talent).kind, "standard");
  assert.equal(talent.inquiryOnly, undefined);
  const both = arrivalFromStamp({ path: "both", stamp: composed, person, businessName: "Uñas Mariana", services: 3, site, talent: null, liveCheck: { ok: true } });
  assert.equal(both.variant, "both");
  assert.equal(finishPlan(both).kind, "standard");
});

test("studio draft, reused workspace and missing site stay on their existing states", () => {
  const draft = arrivalFromStamp({ path: "business", stamp: composed, person, businessName: "X", services: 1, site, talent: null, liveCheck: { ok: false } });
  assert.equal(draft.variant, "draft_saved");
  assert.equal(finishPlan(draft).kind, "standard");
  const reused = arrivalFromStamp({ path: "business", stamp: null, reusedExisting: true, person, businessName: "X", services: 0, site, talent: null });
  assert.equal(finishPlan(reused).kind, "standard");
  const none = arrivalFromStamp({ path: "business", stamp: null, person, businessName: "X", services: 0, site: null, talent: null });
  assert.equal(finishPlan(none).kind, "standard");
});
