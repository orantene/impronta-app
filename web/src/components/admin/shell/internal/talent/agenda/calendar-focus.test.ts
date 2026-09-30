import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import type { TalentAgendaItem } from "@/lib/talent-agenda/types";

import { focusMinutes } from "./calendar-focus";

const DIR = join(process.cwd(), "src/components/admin/shell/internal/talent/agenda");

function item(startsAt: Date, kind = "booking"): TalentAgendaItem {
  const end = new Date(startsAt.getTime() + 3_600_000);
  return { id: String(startsAt.getTime()), kind, startsAt: startsAt.toISOString(), endsAt: end.toISOString(), title: "x", booking: "confirmed", blocksTime: true, allDay: false } as unknown as TalentAgendaItem;
}

describe("F56 week view opens on her earliest hour", () => {
  const thu = new Date(2026, 8, 24);
  const at = (h: number) => new Date(2026, 8, 24, h, 0);
  it("uses the first working hour when it is earlier than any booking", () => {
    assert.equal(focusMinutes([thu], [item(at(11))], () => [{ startMin: 9 * 60 }]), 9 * 60);
  });
  it("uses the first booking when it is earlier than her hours", () => {
    assert.equal(focusMinutes([thu], [item(at(8))], () => [{ startMin: 10 * 60 }]), 8 * 60);
  });
  it("ignores blocks and other days, and is null with nothing to show", () => {
    assert.equal(focusMinutes([thu], [item(at(4), "block")], () => []), null);
    assert.equal(focusMinutes([thu], [item(new Date(2026, 8, 25, 5, 0))], () => []), null);
  });
  it("the week grid scrolls the anchor into view", () => {
    const views = readFileSync(join(DIR, "AgendaCalendarViews.tsx"), "utf8");
    assert.match(views, /data-agenda-focus/);
    assert.match(views, /scrollIntoView\(\{ block: "start" \}\)/);
    assert.ok(views.split("\n").length <= 800);
  });
});

describe("F55 one List control in the Calendar header", () => {
  it("the old Schedule/List toggle is gone", () => {
    const page = readFileSync(join(DIR, "AgendaCalendarPage.tsx"), "utf8");
    assert.doesNotMatch(page, /Calendar mode/);
    assert.doesNotMatch(page, /id: "schedule"/);
    // Header button (desktop) plus the phone view switcher; never two on one screen.
    assert.equal((page.match(/"Schedule" : "List"/g) ?? []).length, 1);
  });
});
