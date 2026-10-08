import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TalentClientRow } from "./clients-merge";
import {
  clientVisit,
  clientsRowAction,
  countClientsByFilter,
  filterClientsDirectory,
  hasRepeatServices,
  isDueForRefill,
  isNewClient,
  isUpcomingClient,
  mapBookingStatusToNext,
  matchesClientsSearch,
  showClientsFilterChip,
} from "./clients-directory";

function row(partial: Partial<TalentClientRow> & Pick<TalentClientRow, "id" | "name">): TalentClientRow {
  return {
    lastVisit: null,
    completedCount: 0,
    visitCount: 0,
    amountOwedCents: null,
    currency: null,
    conversationHref: null,
    source: "booking",
    phone: null,
    email: null,
    nextStartsAt: null,
    nextStatus: null,
    nextBookingHref: null,
    overdue: false,
    ...partial,
  };
}

describe("clients-directory", () => {
  it("maps booking statuses to next chips", () => {
    assert.equal(mapBookingStatusToNext("requested"), "requested");
    assert.equal(mapBookingStatusToNext("hold"), "hold");
    assert.equal(mapBookingStatusToNext("held"), "hold");
    assert.equal(mapBookingStatusToNext("confirmed"), "confirmed");
    assert.equal(mapBookingStatusToNext("cancelled"), null);
  });

  it("counts filters without inventing follow-ups", () => {
    const now = "2026-09-28T12:00:00.000Z";
    const items = [
      row({
        id: "a",
        name: "Ana",
        nextStartsAt: "2026-09-29T15:00:00.000Z",
        nextStatus: "confirmed",
        nextBookingHref: "/talent/bookings/1",
        completedCount: 2,
        visitCount: 2,
      }),
      row({
        id: "b",
        name: "Bea",
        amountOwedCents: 62000,
        currency: "MXN",
        overdue: true,
        completedCount: 1,
        visitCount: 1,
      }),
      row({ id: "c", name: "Cora", source: "inquiry", completedCount: 0, visitCount: 0 }),
      row({
        id: "d",
        name: "Dani",
        nextStartsAt: "2026-09-30T12:00:00.000Z",
        nextStatus: "requested",
        nextBookingHref: "/talent/bookings/2",
        completedCount: 0,
        visitCount: 0,
      }),
    ];
    const counts = countClientsByFilter(items, now);
    assert.equal(counts.all, 4);
    assert.equal(counts.upcoming, 1); // Ana only — requested excluded
    assert.equal(counts.outstanding, 1);
    assert.equal(counts.follow, 0);
    assert.equal(counts.fresh, 2); // Cora + Dani (done === 0; request still counts as New)
  });

  it("due for a refill: a repeat service whose last visit is older than its cycle", () => {
    const now = "2026-09-28T12:00:00.000Z";
    const visit = (id: string, startsAt: string, title: string | null) => ({
      bookingId: id,
      startsAt,
      amountCents: null,
      currency: null,
      paymentStatus: null,
      past: true,
      href: "/talent/bookings/" + id,
      state: "completed" as const,
      title,
    });
    const due = row({
      id: "due",
      name: "Regina",
      completedCount: 3,
      history: [
        visit("3", "2026-08-01T10:00:00.000Z", "Volumen ruso"),
        visit("2", "2026-07-01T10:00:00.000Z", "Volumen ruso"),
        visit("1", "2026-06-01T10:00:00.000Z", "Volumen ruso"),
      ],
    });
    const fresh = row({
      id: "fresh",
      name: "Valeria",
      completedCount: 3,
      history: [
        visit("6", "2026-09-20T10:00:00.000Z", "Gel"),
        visit("5", "2026-09-05T10:00:00.000Z", "Gel"),
        visit("4", "2026-08-20T10:00:00.000Z", "Gel"),
      ],
    });
    const once = row({ id: "once", name: "Sofia", completedCount: 1, history: [visit("7", "2026-01-01T10:00:00.000Z", "Gel")] });
    const booked = row({ ...due, id: "booked", name: "Camila", nextStartsAt: "2026-10-02T10:00:00.000Z" });
    assert.equal(isDueForRefill(due, now), true);
    assert.equal(isDueForRefill(fresh, now), false);
    assert.equal(isDueForRefill(once, now), false);
    assert.equal(isDueForRefill(booked, now), false);
    assert.equal(hasRepeatServices([once]), false);
    assert.equal(hasRepeatServices([once, due]), true);
    assert.equal(countClientsByFilter([once, due, fresh, booked], now).follow, 1);
  });

  it("searches name phone email", () => {
    const r = row({ id: "1", name: "Paola Ríos", phone: "+52 998 301 6616", email: "paola@x.com" });
    assert.equal(matchesClientsSearch(r, "pao"), true);
    assert.equal(matchesClientsSearch(r, "301"), true);
    assert.equal(matchesClientsSearch(r, "paola@"), true);
    assert.equal(matchesClientsSearch(r, "zzz"), false);
  });

  it("picks the one relevant row action", () => {
    assert.equal(
      clientsRowAction(
        row({
          id: "1",
          name: "R",
          nextStatus: "requested",
          nextStartsAt: "2026-10-01T12:00:00.000Z",
          nextBookingHref: "/talent/bookings/r",
        }),
      ).kind,
      "review_request",
    );
    assert.equal(
      clientsRowAction(
        row({
          id: "2",
          name: "H",
          nextStatus: "hold",
          nextStartsAt: "2026-10-01T12:00:00.000Z",
          nextBookingHref: "/talent/bookings/h",
        }),
      ).kind,
      "view_hold",
    );
    assert.equal(
      clientsRowAction(
        row({
          id: "3",
          name: "O",
          amountOwedCents: 100,
          conversationHref: "/talent/inbox/x",
        }),
      ).kind,
      "request_payment",
    );
    assert.equal(clientsRowAction(row({ id: "4", name: "N" })).kind, "book_appointment");
  });

  it("filters + search together", () => {
    const now = "2026-09-28T12:00:00.000Z";
    const items = [
      row({ id: "1", name: "Paola", amountOwedCents: 100, completedCount: 1, visitCount: 1 }),
      row({ id: "2", name: "Regina", amountOwedCents: 200, completedCount: 2, visitCount: 2 }),
    ];
    const out = filterClientsDirectory({ items, filter: "outstanding", query: "reg", nowIso: now });
    assert.equal(out.length, 1);
    assert.equal(out[0]!.name, "Regina");
  });

  it("classifies new vs upcoming", () => {
    const now = "2026-09-28T12:00:00.000Z";
    assert.equal(isNewClient(row({ id: "1", name: "N" })), true);
    assert.equal(
      isUpcomingClient(
        row({
          id: "2",
          name: "U",
          nextStartsAt: "2026-09-29T00:00:00.000Z",
          nextStatus: "confirmed",
        }),
        now,
      ),
      true,
    );
  });
});

describe("clientVisit", () => {
  const nowIso = "2026-09-28T21:00:00.000Z";
  it("a past hold is not completed work", () => {
    assert.deepEqual(
      clientVisit({ status: "hold", startsAt: "2026-09-28T15:00:00.000Z", endsAt: "2026-09-28T15:15:00.000Z", nowIso }),
      { state: "hold", done: false, upcoming: false },
    );
  });
  it("a finished confirmed appointment counts as completed", () => {
    assert.deepEqual(
      clientVisit({ status: "confirmed", startsAt: "2026-09-20T15:00:00.000Z", endsAt: "2026-09-20T16:00:00.000Z", nowIso }),
      { state: "completed", done: true, upcoming: false },
    );
  });
  it("an appointment still running is upcoming", () => {
    assert.deepEqual(
      clientVisit({ status: "confirmed", startsAt: "2026-09-28T20:30:00.000Z", endsAt: "2026-09-28T21:30:00.000Z", nowIso }),
      { state: "confirmed", done: false, upcoming: true },
    );
  });
});
