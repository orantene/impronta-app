import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { SAFETY_VIEW_LIMIT, shapeSafetyRows, type SafetyBookingRow, type SafetyPlan } from "./rent-safety-view";

const NOW = new Date("2026-10-20T12:00:00Z");
const plans: SafetyPlan[] = [
  { talentProfileId: "a", memberName: "Ana", status: "active" },
  { talentProfileId: "b", memberName: "Beto", status: "paused" },
  { talentProfileId: "c", memberName: "Cora", status: "proposed" },
  { talentProfileId: "d", memberName: "Dani", status: "ended" },
];
const b = (id: string, talent: string, startH: number, over: Partial<SafetyBookingRow> = {}): SafetyBookingRow => ({
  id,
  tenant_id: "studio",
  talent_profile_id: talent,
  title: "Fade",
  client_label: " Luis ",
  starts_at: new Date(NOW.getTime() + startH * 3600_000).toISOString(),
  ends_at: new Date(NOW.getTime() + (startH + 1) * 3600_000).toISOString(),
  status: "confirmed",
  ...over,
});

describe("safety view", () => {
  test("shows only renting members (active or paused), upcoming and confirmed, soonest first", () => {
    const rows = shapeSafetyRows(
      "studio",
      plans,
      [b("1", "a", 5), b("2", "b", 2), b("3", "c", 1), b("4", "d", 1), b("5", "x", 1), b("6", "a", -5), b("7", "a", 3, { status: "cancelled" }), b("8", "a", 3, { status: "completed" })],
      NOW,
    );
    assert.deepEqual(rows.map((r) => r.id), ["2", "1"]);
    assert.equal(rows[0].memberName, "Beto");
  });
  test("a booking still in progress stays; one that has ended goes", () => {
    const inProgress = b("p", "a", -0.5, { ends_at: new Date(NOW.getTime() + 1800_000).toISOString() });
    assert.deepEqual(shapeSafetyRows("studio", plans, [inProgress], NOW).map((r) => r.id), ["p"]);
  });
  test("carries a trimmed client label and nothing that contacts the client", () => {
    const [row] = shapeSafetyRows("studio", plans, [b("1", "a", 1, { title: null })], NOW);
    assert.equal(row.clientLabel, "Luis");
    assert.equal(row.title, "");
    assert.deepEqual(Object.keys(row).sort(), ["clientLabel", "endsAt", "id", "memberName", "startsAt", "title"]);
  });
  test("caps the list", () => {
    const many = Array.from({ length: SAFETY_VIEW_LIMIT + 20 }, (_, i) => b(`id-${String(i).padStart(3, "0")}`, "a", i + 1));
    assert.equal(shapeSafetyRows("studio", plans, many, NOW).length, SAFETY_VIEW_LIMIT);
  });
  test("only bookings made in THIS studio's workspace: a member's bookings elsewhere never show", () => {
    const rows = shapeSafetyRows(
      "studio",
      plans,
      [b("mine", "a", 1), b("hub", "a", 2, { tenant_id: "hub" }), b("own-site", "a", 3, { tenant_id: "a-own-site" }), b("other-studio", "b", 4, { tenant_id: "other-studio", title: "Secret", client_label: "Ana" })],
      NOW,
    );
    assert.deepEqual(rows.map((r) => r.id), ["mine"]);
  });
  test("garbage end dates are skipped, not shown", () => {
    assert.equal(shapeSafetyRows("studio", plans, [b("1", "a", 1, { ends_at: "nope" })], NOW).length, 0);
  });
});
