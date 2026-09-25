/**
 * Minimal per-trade day fixtures (G4.1) — one item each for trade-section smoke.
 * Full Jor week remains the numeric source of truth in jor-week.ts.
 */

import type { TalentAgendaItem } from "../types";
import { TRADE_WALK_KEYS } from "../trade-walk";
import { TRADE_PROFILES } from "../trades";

const DAY = "2026-09-23";
const TZ = "America/Cancun";

function baseItem(
  trade: string,
  extras: Partial<TalentAgendaItem> & Pick<TalentAgendaItem, "id" | "title" | "tradeSection">,
): TalentAgendaItem {
  return {
    kind: "booking",
    ref: { table: "agency_bookings", id: extras.id },
    client: { name: "QA Client", initials: "QC" },
    lines: [{ label: extras.title, cents: 10000 }],
    startsAt: `${DAY}T11:00:00-05:00`,
    endsAt: `${DAY}T12:00:00-05:00`,
    allDay: false,
    tz: TZ,
    where: { mode: "studio", label: "Studio" },
    bufferAfterMin: TRADE_PROFILES[trade as keyof typeof TRADE_PROFILES]?.timeAround.bufferMin ?? 15,
    booking: "confirmed",
    payment: "due",
    money: { totalCents: 10000, paidCents: 0, dueCents: 10000, currency: "MXN" },
    source: "manual",
    blocksTime: true,
    history: [],
    ...extras,
  };
}

/** One confirmed booking per trade with a kind-appropriate tradeSection. */
export function buildTradeDayFixtures(): TalentAgendaItem[] {
  return TRADE_WALK_KEYS.map((trade) => {
    const profile = TRADE_PROFILES[trade];
    const section =
      profile.kind === "event"
        ? {
            kind: "event" as const,
            payload: { guests: 12, diet: "none", kitchen: "yes", menu: "tasting", prep: "2h" },
          }
        : profile.kind === "project"
          ? {
              kind: "project" as const,
              payload: { stage: "draft", deliverables: "3 pages", due: DAY },
            }
          : profile.key === "dancer"
            ? {
                kind: "performance" as const,
                payload: { callTime: "18:00", sets: 2, end: "22:00", venueRules: "indoor" },
              }
            : profile.neededFirst.includes("intake_form")
              ? { kind: "intake" as const, payload: { status: "pending" } }
              : { kind: "estimate" as const, payload: { range: "60–90 min" } };

    return baseItem(trade, {
      id: `trade-${trade}-1`,
      title: `${profile.words.noun[0]} session`,
      tradeSection: section,
    });
  });
}
