/**
 * What /talent/bookings/<id> shows while its reads run. Pure so it can be tested.
 * The failure state is only ever the result of reads that have SETTLED: never the
 * server render (no id yet), never a timer.
 */
export type RecordViewState = "loading" | "still-loading" | "ready" | "unavailable";

/** Past this the loading line says "still loading"; it is never turned into a failure. */
export const RECORD_SLOW_AFTER_MS = 20_000;

export function recordViewState(input: {
  /** Booking id from the URL / session; empty on the server render. */
  bookingId: string;
  /** True once the client has mounted (the id is readable from window). */
  mounted: boolean;
  hasItem: boolean;
  /** The reads for THIS id have returned (value or failure). */
  settled: boolean;
  slow: boolean;
}): RecordViewState {
  if (input.hasItem) return "ready";
  if (!input.bookingId) return input.mounted ? "unavailable" : "loading";
  if (!input.settled) return input.slow ? "still-loading" : "loading";
  return "unavailable";
}

type Stub = { service?: string | null; clientName?: string | null; status?: string | null } | null;

/** Runs both reads at once; each failure is contained so one cannot drop the other. */
export async function readRecordInParallel<I>(
  readItem: () => Promise<I | null>,
  readStub: () => Promise<Stub>,
): Promise<{ item: I | null; stub: Stub }> {
  const [item, stub] = await Promise.all([
    readItem().catch(() => null),
    readStub().catch(() => null),
  ]);
  return { item, stub: item ? null : stub };
}
