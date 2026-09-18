import type { LadderStep } from "@/components/messages-v5/kit/PaymentLadder";
import type { RecordChip, RecordKind } from "@/lib/messaging/types";

/**
 * L11 (boards D08, D09, D21). Pure helpers shared by the thread's record
 * cards (`ThreadCards.tsx`) and the panel's record chip, so a reservation or
 * a tickets record reads the same ladder step and the same hold countdown
 * whichever surface draws it. No I/O, no admin client: everything here takes
 * data already read by S2's chips or the engine's card payload.
 */

export type RecordLadderKind = "order" | "reservation" | "tickets";

const ORDER_STEPS = ["draft", "confirmed", "paid", "fulfilled"] as const;
const TABLE_STEPS = ["held", "confirmed", "seated", "closed"] as const;
const TICKETS_STEPS = ["paid", "issued", "checked_in", "done"] as const;

export type LadderCopy = {
  readonly draft: string;
  readonly confirmed: string;
  readonly paid: string;
  readonly fulfilled: string;
  readonly held: string;
  readonly seated: string;
  readonly issued: string;
  readonly checkedIn: string;
  readonly done: string;
};

/**
 * The step name for a record kind, derived from S2's `paymentState` /
 * `fulfilmentState` chip fields — never computed locally from anything else.
 * `checkedIn` reads "some but not all" from `fulfilmentState === "checked_in"`
 * plus a caller-supplied count (tickets carry N of M, a chip does not).
 */
export function ladderStepFor(kind: RecordLadderKind, chip: { readonly paymentState?: string | null; readonly fulfilmentState?: string | null }): string {
  const payment = chip.paymentState ?? null;
  const fulfilment = chip.fulfilmentState ?? null;
  if (kind === "order") {
    if (fulfilment === "fulfilled") return "fulfilled";
    if (payment === "paid") return "paid";
    if (fulfilment === "confirmed" || payment) return "confirmed";
    return "draft";
  }
  if (kind === "reservation") {
    if (fulfilment === "cancelled") return "closed";
    if (fulfilment === "seated") return "seated";
    if (fulfilment === "confirmed" || payment === "paid") return "confirmed";
    return "held";
  }
  // tickets
  if (fulfilment === "checked_in") return "checked_in";
  if (fulfilment === "fulfilled" || fulfilment === "done") return "done";
  if (payment === "paid" || fulfilment === "confirmed") return "issued";
  return "paid";
}

const STEP_LIST: Record<RecordLadderKind, readonly string[]> = {
  order: ORDER_STEPS,
  reservation: TABLE_STEPS,
  tickets: TICKETS_STEPS,
};

const STEP_LABEL_KEY: Record<string, keyof LadderCopy> = {
  draft: "draft",
  confirmed: "confirmed",
  paid: "paid",
  fulfilled: "fulfilled",
  held: "held",
  seated: "seated",
  closed: "fulfilled",
  issued: "issued",
  checked_in: "checkedIn",
  done: "done",
};

/** Build the four-step ladder for a record kind at its current step. */
export function ladderFor(kind: RecordLadderKind, chip: { readonly paymentState?: string | null; readonly fulfilmentState?: string | null }, copy: LadderCopy): LadderStep[] {
  const steps = STEP_LIST[kind];
  const current = ladderStepFor(kind, chip);
  const r = steps.indexOf(current);
  return steps.map((step, i) => ({ label: copy[STEP_LABEL_KEY[step]], done: r >= i }));
}

/**
 * "12m left" / "Hold ended" / null (no expiry to show). `now` is injectable
 * for tests; callers pass `new Date()`.
 */
export function holdCountdown(expiresAt: string | null | undefined, now: Date): { readonly minutesLeft: number; readonly ended: false } | { readonly ended: true } | null {
  if (!expiresAt) return null;
  const expiry = new Date(expiresAt).getTime();
  if (Number.isNaN(expiry)) return null;
  const diffMs = expiry - now.getTime();
  if (diffMs <= 0) return { ended: true };
  return { ended: false, minutesLeft: Math.max(1, Math.ceil(diffMs / 60000)) };
}

/** Render `holdCountdown`'s result as the kit's "{minutes} min left" / "hold ended" strings. */
export function formatHoldCountdown(countdown: ReturnType<typeof holdCountdown>, labels: { readonly minutesLeft: string; readonly ended: string }): string | null {
  if (!countdown) return null;
  if (countdown.ended) return labels.ended;
  return labels.minutesLeft.replace("{minutes}", String(countdown.minutesLeft));
}

/** What a `service_card` payload with `variant: "table"` carries (D-MSG-155/156). */
export type TableChoiceRow = { readonly label: string; readonly partySize: number; readonly startsAt: string; readonly spaceId?: string | null };

/**
 * The `service_card` payload for sendable table choices (D-MSG-156, closes
 * the D-MSG-122 seam's "no card kind" half): reuses the existing kind with a
 * `variant` discriminant, no CHECK change. Exported so L9's client renderer
 * can build the identical payload shape without re-deriving it.
 */
export function tableChoicePayload(rows: readonly TableChoiceRow[]): Record<string, unknown> {
  return {
    variant: "table",
    offeringIds: [],
    labels: rows.map((r) => r.label),
    currency: "USD",
    tables: rows.map((r) => ({ label: r.label, partySize: r.partySize, startsAt: r.startsAt, spaceId: r.spaceId ?? null })),
  };
}

/** Props `TableCard` needs, derived from a `service_card` (variant "table") message payload. */
export type TableCardProps = {
  readonly partySize: number | null;
  readonly startsAt: string | null;
  readonly tableLabel: string | null;
  readonly holdExpiresAt: string | null;
};

export function cardPropsFromMessage(kind: "service_card" | "tickets_card", payload: Record<string, unknown> | null): TableCardProps | TicketsCardViewProps | null {
  const p = payload ?? {};
  if (kind === "service_card") {
    const tables = Array.isArray((p as Record<string, unknown>).tables) ? ((p as { tables: unknown[] }).tables as Record<string, unknown>[]) : [];
    const first = tables[0] ?? null;
    return {
      partySize: first && typeof first.partySize === "number" ? first.partySize : null,
      startsAt: first && typeof first.startsAt === "string" ? first.startsAt : null,
      tableLabel: first && typeof first.label === "string" ? first.label : null,
      holdExpiresAt: typeof (p as Record<string, unknown>).holdExpiresAt === "string" ? ((p as Record<string, unknown>).holdExpiresAt as string) : null,
    };
  }
  const tiers = Array.isArray((p as Record<string, unknown>).tiers) ? ((p as { tiers: unknown[] }).tiers as Record<string, unknown>[]) : [];
  return {
    title: typeof (p as Record<string, unknown>).title === "string" ? ((p as Record<string, unknown>).title as string) : null,
    tiers: tiers.map((t) => ({ id: String(t.id ?? ""), label: String(t.label ?? ""), priceCents: typeof t.priceCents === "number" ? t.priceCents : 0 })),
    holdExpiresAt: typeof (p as Record<string, unknown>).holdExpiresAt === "string" ? ((p as Record<string, unknown>).holdExpiresAt as string) : null,
    capacity: typeof (p as Record<string, unknown>).capacity === "number" ? ((p as Record<string, unknown>).capacity as number) : null,
    checkedIn: typeof (p as Record<string, unknown>).checkedIn === "number" ? ((p as Record<string, unknown>).checkedIn as number) : null,
  };
}

export type TicketsCardViewProps = {
  readonly title: string | null;
  readonly tiers: readonly { readonly id: string; readonly label: string; readonly priceCents: number }[];
  readonly holdExpiresAt: string | null;
  readonly capacity: number | null;
  readonly checkedIn: number | null;
};

/**
 * The same ladder + status a chip gives the panel (README: message card and
 * panel chip render consistently). `kind` narrows `RecordChip.kind` to the
 * three record kinds this lane's cards cover; other kinds return null so a
 * caller falls back to its existing label.
 */
export function cardPropsFromChip(chip: RecordChip, copy: LadderCopy): { readonly ladderKind: RecordLadderKind; readonly step: string; readonly ladder: LadderStep[] } | null {
  const ladderKind = recordKindToLadderKind(chip.kind);
  if (!ladderKind) return null;
  return { ladderKind, step: ladderStepFor(ladderKind, chip), ladder: ladderFor(ladderKind, chip, copy) };
}

function recordKindToLadderKind(kind: RecordKind): RecordLadderKind | null {
  if (kind === "order") return "order";
  if (kind === "reservation") return "reservation";
  if (kind === "tickets") return "tickets";
  return null;
}
