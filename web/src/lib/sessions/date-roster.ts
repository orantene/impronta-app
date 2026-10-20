/**
 * date-roster.ts — the participant list of ONE date: people per price, who is
 * checked in (TUL-1344 slice 8). Pure; the action beside it reads the rows.
 *
 * Refunded and void tickets stay in the list (staff must see why a name is not
 * counted) but never add to a count, so the number on the door is the number of
 * people who can walk in. Checked in is capped at the people on the ticket.
 */

export type RosterRow = {
  admissionId: string;
  name: string | null;
  email: string | null;
  tierLabel: string | null;
  partySize: number;
  admittedCount: number;
  /** `admissions.status`: valid, refunded, void ... */
  status: string;
};

export type RosterLine = RosterRow & { counted: boolean };

export type DateRosterSummary = {
  totalPeople: number;
  checkedIn: number;
  byTier: Array<{ label: string; people: number; checkedIn: number }>;
  rows: RosterLine[];
};

const UNCOUNTED = new Set(["refunded", "void"]);

export function summariseDateRoster(rows: readonly RosterRow[]): DateRosterSummary {
  const tiers = new Map<string, { label: string; people: number; checkedIn: number }>();
  let totalPeople = 0;
  let checkedIn = 0;
  const lines: RosterLine[] = rows.map((r) => ({ ...r, counted: !UNCOUNTED.has(r.status) }));
  for (const r of lines) {
    if (!r.counted) continue;
    const people = Math.max(1, Math.floor(r.partySize) || 1);
    const inside = Math.min(people, Math.max(0, Math.floor(r.admittedCount) || 0));
    totalPeople += people;
    checkedIn += inside;
    const label = r.tierLabel ?? "";
    const t = tiers.get(label) ?? { label, people: 0, checkedIn: 0 };
    t.people += people;
    t.checkedIn += inside;
    tiers.set(label, t);
  }
  const sorted = [...lines].sort((a, b) => {
    if (a.name == null && b.name == null) return 0;
    if (a.name == null) return 1;
    if (b.name == null) return -1;
    return a.name.localeCompare(b.name);
  });
  return { totalPeople, checkedIn, byTier: [...tiers.values()], rows: sorted };
}
