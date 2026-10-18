/**
 * TUL-1244: which booking, and when, does /talent/bookings/<id> mean?
 *
 * The record used to look the id up in `talent_bookings` only. Today, Clientes and
 * the order link hand out agency booking ids (and, for an accepted offer, the
 * order id), which have no `talent_bookings` row, so the record fell back to its
 * "No time assigned" / "Where: -" stub for a booking that Today showed at 09:00.
 * This resolves the id against all three, always scoped to HER legs, and returns
 * the canonical booking id plus its start. Pure over a minimal client shape so a
 * fake can test it.
 */

type Row = Record<string, unknown> | null;
type Reply = PromiseLike<{ data: unknown; error?: unknown }>;

export interface RecordTargetDb {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        eq(column: string, value: string): { maybeSingle(): Reply };
        maybeSingle(): Reply;
      };
    };
  };
}

export type RecordTarget = { bookingId: string; startsAt: string };

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

async function row(p: Reply): Promise<Row> {
  const res = await p;
  return (res.data as Row) ?? null;
}

export async function resolveRecordTarget(
  db: { supabase: RecordTargetDb; admin: RecordTargetDb },
  talentProfileId: string,
  id: string,
): Promise<RecordTarget | null> {
  // 1. Her own manual booking.
  const own = await row(
    db.supabase.from("talent_bookings").select("id, starts_at").eq("id", id).eq("talent_profile_id", talentProfileId).maybeSingle(),
  );
  if (own && str(own.starts_at)) return { bookingId: id, startsAt: str(own.starts_at)! };

  const hasLeg = async (bookingId: string) =>
    Boolean(
      await row(
        db.admin.from("booking_talent").select("booking_id").eq("booking_id", bookingId).eq("talent_profile_id", talentProfileId).maybeSingle(),
      ),
    );

  // 2. An agency booking she is on, by its own id.
  const byId = await row(db.admin.from("agency_bookings").select("id, starts_at").eq("id", id).maybeSingle());
  if (byId && str(byId.starts_at) && (await hasLeg(id))) return { bookingId: id, startsAt: str(byId.starts_at)! };

  // 3. The order id of an accepted offer: the booking made from it.
  const byOrder = await row(db.admin.from("agency_bookings").select("id, starts_at").eq("order_id", id).maybeSingle());
  const orderBookingId = str(byOrder?.id);
  if (byOrder && orderBookingId && str(byOrder.starts_at) && (await hasLeg(orderBookingId))) {
    return { bookingId: orderBookingId, startsAt: str(byOrder.starts_at)! };
  }
  return null;
}
