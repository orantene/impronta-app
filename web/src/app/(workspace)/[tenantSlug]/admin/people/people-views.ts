/**
 * people-views.ts — the pure half of the People page: which view the URL
 * names, which records each view lists, and the counts the boards print
 * beside the tabs and in the Talent tiles (W27, W29, W30).
 *
 * No React, no server imports. Every number here is counted over the record
 * set the reader returned, never fetched a second time.
 */

import { pickAProfessional, type PersonRecord } from "@/lib/people/hats";

/** The five rows of the tab strip, plus the two screens the header opens. */
export const PEOPLE_VIEWS = ["everyone", "talent", "bookable", "access", "add", "model"] as const;
export type PeopleView = (typeof PEOPLE_VIEWS)[number];

/** The four tabs that list people; `add` and `model` are screens, not filters. */
export const PEOPLE_TABS = ["everyone", "talent", "bookable", "access"] as const;
export type PeopleTab = (typeof PEOPLE_TABS)[number];

export function parsePeopleView(raw: string | null | undefined): PeopleView {
  return (PEOPLE_VIEWS as readonly string[]).includes(raw ?? "") ? (raw as PeopleView) : "everyone";
}

export function isPeopleTab(view: PeopleView): view is PeopleTab {
  return (PEOPLE_TABS as readonly string[]).includes(view);
}

/**
 * The records a tab lists. The Bookable list is the picker's list, by
 * construction: it is the same function the POS and the booking page filter
 * with, so the tab can never promise a professional the engine refuses.
 */
export function peopleFor(people: readonly PersonRecord[], tab: PeopleTab): readonly PersonRecord[] {
  switch (tab) {
    case "talent":
      return people.filter((p) => p.publicProfile.on);
    case "bookable":
      return pickAProfessional(people);
    case "access":
      return people.filter((p) => p.access.on);
    default:
      return people;
  }
}

export type PeopleCounts = Record<PeopleTab, number>;

export function countPeople(people: readonly PersonRecord[]): PeopleCounts {
  return {
    everyone: people.length,
    talent: peopleFor(people, "talent").length,
    bookable: peopleFor(people, "bookable").length,
    access: peopleFor(people, "access").length,
  };
}

/** The four tiles above the Talent cards (W27): Visible · Hidden · Claimed · Also Bookable here. */
export type TalentStats = {
  visible: number;
  hidden: number;
  claimed: number;
  alsoBookable: number;
};

export function talentStats(talent: readonly PersonRecord[]): TalentStats {
  let visible = 0;
  let hidden = 0;
  let claimed = 0;
  let alsoBookable = 0;
  for (const p of talent) {
    if (p.facts.siteVisible) visible += 1;
    else hidden += 1;
    if (p.accountId) claimed += 1;
    if (p.bookable.on) alsoBookable += 1;
  }
  return { visible, hidden, claimed, alsoBookable };
}

/** Which hats a record wears, in the boards' order. */
export function hatsWorn(p: PersonRecord): ReadonlyArray<"publicProfile" | "bookable" | "access"> {
  const out: Array<"publicProfile" | "bookable" | "access"> = [];
  if (p.publicProfile.on) out.push("publicProfile");
  if (p.bookable.on) out.push("bookable");
  if (p.access.on) out.push("access");
  return out;
}

/**
 * The type filter's chips (W27): every category label the listed profiles
 * carry, in first-seen order, so the chips are the workspace's own types and
 * not a fixed list.
 */
export function talentTypeChips(talent: readonly PersonRecord[]): readonly string[] {
  const seen: string[] = [];
  for (const p of talent) {
    const first = p.facts.types[0];
    if (first && !seen.includes(first)) seen.push(first);
  }
  return seen;
}

/** The location filter's options (W27): the cities the listed profiles name. */
export function talentCities(talent: readonly PersonRecord[]): readonly string[] {
  const seen: string[] = [];
  for (const p of talent) {
    const city = p.facts.city;
    if (city && !seen.includes(city)) seen.push(city);
  }
  return seen;
}

export type TalentFilter = {
  type: string | null;
  hat: "any" | "bookable" | "access" | "publicOnly";
  city: string | null;
};

export function filterTalent(talent: readonly PersonRecord[], f: TalentFilter): readonly PersonRecord[] {
  return talent.filter((p) => {
    if (f.type && p.facts.types[0] !== f.type) return false;
    if (f.city && p.facts.city !== f.city) return false;
    if (f.hat === "bookable" && !p.bookable.on) return false;
    if (f.hat === "access" && !p.access.on) return false;
    if (f.hat === "publicOnly" && (p.bookable.on || p.access.on)) return false;
    return true;
  });
}

/**
 * "Tue–Sat" / "Mon, Wed" from the weekday indexes a person's hours cover.
 * A run of three or more consecutive days collapses to a range; the labels
 * are the caller's (translated), indexed 0 = Sunday.
 */
export function describeOpenDays(openDays: readonly number[], dayLabels: readonly string[]): string {
  if (openDays.length === 0) return "";
  const sorted = [...openDays].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0]!;
  let prev = start;
  const flush = () => {
    if (prev - start >= 2) parts.push(`${dayLabels[start]}–${dayLabels[prev]}`);
    else if (prev !== start) parts.push(`${dayLabels[start]}, ${dayLabels[prev]}`);
    else parts.push(dayLabels[start]!);
  };
  for (const d of sorted.slice(1)) {
    if (d === prev + 1) {
      prev = d;
      continue;
    }
    flush();
    start = d;
    prev = d;
  }
  flush();
  return parts.join(", ");
}
