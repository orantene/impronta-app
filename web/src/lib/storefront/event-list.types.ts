/** event_list — the types the island codes against. Cards with a date badge; desktop 3-up. */

export type EventListProps = {
  filter?: "upcoming" | "all";
  layout?: "cards" | "list";
  /** 1..50, default 12. */
  count?: number;
  locale?: string | null;
};

export type EventCard = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  /** `/events/<slug>` on this host. */
  path: string;
  nextStartsAtIso: string | null;
  lastStartsAtIso: string | null;
  timezone: string | null;
  nightsCount: number;
};

export type EventListData = { events: EventCard[]; layout: "cards" | "list" };
