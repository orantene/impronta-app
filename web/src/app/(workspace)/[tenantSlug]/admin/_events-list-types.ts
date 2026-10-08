import type { TierPresentation } from "@/lib/events/tier-presentation";

export type EventTierRow = {
  id: string;
  poolKey: string;
  label: string;
  amountCents: number;
  admitsPerUnit: number;
  isHidden: boolean;
  seatingMode: string | null;
  onSale: boolean;
  /** `scheduled` | `ended` | `hidden` when not on sale. */
  saleReason: string | null;
  salesFrom: string | null;
  salesUntil: string | null;
  maxPerOrder: number | null;
  /** The tier's own presentation (image, badge, includes, description); empty until set. */
  presentation: TierPresentation;
  /** `presentation.imageMediaId` resolved, for the row thumbnail and the editor. */
  imageUrl: string | null;
};

export type EventListRow = {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "published" | "cancelled";
  admissionKind: string;
  doorsOffsetMinutes: number;
  refundCutoffHours: number | null;
  payoutReleaseRule: string;
  nextSessionAt: string | null;
  /** Scheduled sessions only — a cancelled night is not an upcoming one. */
  sessionCount: number;
  /**
   * TRUE when this event has sessions and every one of them is in the past.
   * `nextSessionAt === null` alone cannot say this: it is also null for an event
   * with no sessions at all, and "3 sessions, next: no date" is one label
   * covering two states — the state it hides being "this run is over", which is
   * the one a staff member actively wants to see.
   */
  runFinished: boolean;
  /**
   * The VENUE'S zone, resolved through the platform ladder (venue, workspace,
   * platform). Every time on this screen is formatted in it and never in the
   * reader's: a Cancún venue opened by an owner in Madrid would otherwise be
   * told the wrong night, worst at a late doors time that crosses midnight in
   * the reader's zone. An instant formatted without a named zone silently
   * becomes the reader's wall clock.
   */
  timeZone: string;
  tiers: EventTierRow[];
  /** Scheduled sessions, soonest first — what the Door tab links to. */
  sessions: Array<{ id: string; startsAt: string }>;
  /** Settings the ticket page reads (the Settings tab writes them). */
  venueId: string | null;
  coverMediaId: string | null;
  description: string | null;
  /**
   * The refund switch. FALSE when the three refund columns do not exist yet
   * (they ship in `…243000_events_refund_settings`): read in a separate
   * query so an absent column costs the switch, never the event list.
   */
  refundsOpen: boolean;
  refundPolicyKey: string | null;
  refundsCloseAt: string | null;
};
