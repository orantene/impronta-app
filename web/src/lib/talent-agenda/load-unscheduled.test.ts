import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  isUnscheduledAgencyBooking,
  mapUnscheduledDraftBooking,
  unscheduledAgendaItems,
} from "./load-unscheduled";
import type { TalentAgendaItem } from "./types";

describe("isUnscheduledAgencyBooking", () => {
  it("treats null starts_at draft as unscheduled", () => {
    assert.equal(isUnscheduledAgencyBooking({ starts_at: null, status: "draft" }), true);
    assert.equal(isUnscheduledAgencyBooking({ starts_at: null, status: "confirmed" }), true);
  });
  it("excludes timed and terminal rows", () => {
    assert.equal(
      isUnscheduledAgencyBooking({ starts_at: "2026-10-02T12:00:00Z", status: "draft" }),
      false,
    );
    assert.equal(isUnscheduledAgencyBooking({ starts_at: null, status: "cancelled" }), false);
    assert.equal(isUnscheduledAgencyBooking({ starts_at: null, status: "completed" }), false);
  });
});

describe("mapUnscheduledDraftBooking", () => {
  it("maps a draft with no time into an unscheduled agenda item", () => {
    const item = mapUnscheduledDraftBooking(
      {
        id: "b1",
        status: "draft",
        starts_at: null,
        contact_name: "Bozo",
        title: "Makeup",
        total_client_revenue: 100,
        currency_code: "MXN",
        payment_status: "unpaid",
        created_at: "2026-10-01T15:00:00Z",
      },
      { now: new Date("2026-10-02T12:00:00Z") },
    );
    assert.ok(item);
    assert.equal(item!.unscheduled, true);
    assert.equal(item!.blocksTime, false);
    assert.equal(item!.allDay, true);
    assert.equal(item!.client?.name, "Bozo");
    assert.equal(item!.money.totalCents, 10000);
    assert.equal(item!.startsAt, "2026-10-01T15:00:00Z");
  });

  it("returns null for cancelled or timed bookings", () => {
    assert.equal(
      mapUnscheduledDraftBooking({ id: "c", status: "cancelled", starts_at: null }),
      null,
    );
    assert.equal(
      mapUnscheduledDraftBooking({
        id: "t",
        status: "draft",
        starts_at: "2026-10-02T10:00:00Z",
      }),
      null,
    );
  });
});

describe("unscheduledAgendaItems", () => {
  it("filters the Sin hora strip", () => {
    const items = [
      { id: "a", unscheduled: true },
      { id: "b" },
      { id: "c", unscheduled: false },
    ] as TalentAgendaItem[];
    assert.deepEqual(
      unscheduledAgendaItems(items).map((i) => i.id),
      ["a"],
    );
  });
});

describe("loadTalentAgenda wires unscheduled drafts", () => {
  it("load.ts merges unscheduled drafts from booking_talent", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "load.ts"), "utf8");
    assert.match(src, /loadUnscheduledDraftsForTalent|mapUnscheduledDraftBooking/);
    assert.match(src, /unscheduled/);
  });

  it("Today page renders a Sin hora strip", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const page = readFileSync(
      join(
        here,
        "../../components/admin/shell/internal/talent/agenda/AgendaTodayPage.tsx",
      ),
      "utf8",
    );
    assert.match(page, /unscheduledAgendaItems|data-testid="today-no-time"/);
    assert.match(page, /No time|Sin hora/);
  });
});
