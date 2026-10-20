/**
 * What /talent/bookings/<id> can say about a booking that is not in any agenda window
 * (a purchase booking in agency_bookings, a draft with no time). Pure over a minimal
 * client shape so a fake can test it. Authorization: only rows that are HERS count. An
 * agency booking needs a booking_talent leg for her; a talent_bookings row needs her
 * talent_profile_id. The order id of an accepted offer resolves to the booking made from it.
 * Read only: nothing here writes or mirrors a row.
 */

type Reply = PromiseLike<{ data: unknown; error?: unknown }>;
type Filter = {
  eq(column: string, value: string): Filter;
  order(column: string, opts: { ascending: boolean }): Filter;
  limit(n: number): Filter;
  maybeSingle(): Reply;
};
export interface StubDb {
  from(table: string): { select(columns: string): Filter };
}

export type BookingStub = { title: string; service: string | null; clientName: string | null; status: string | null };

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const one = async (p: Reply): Promise<Record<string, unknown> | null> => ((await p).data as Record<string, unknown> | null) ?? null;

export async function readTimelessBookingStub(
  db: { supabase: StubDb; admin: StubDb },
  talentProfileId: string,
  id: string,
): Promise<BookingStub | null> {
  const own = await one(
    db.supabase.from("talent_bookings").select("title, client_label, status").eq("id", id).eq("talent_profile_id", talentProfileId).maybeSingle(),
  );

  const hasLeg = async (bookingId: string) =>
    Boolean(await one(db.admin.from("booking_talent").select("booking_id").eq("booking_id", bookingId).eq("talent_profile_id", talentProfileId).maybeSingle()));

  const agencyCols = "id, order_id, contact_name, status";
  let agency = await one(db.admin.from("agency_bookings").select(agencyCols).eq("id", id).maybeSingle());
  if (!agency) agency = await one(db.admin.from("agency_bookings").select(agencyCols).eq("order_id", id).maybeSingle());
  const agencyId = text(agency?.id);
  if (agency && !(agencyId && (await hasLeg(agencyId)))) agency = null;

  if (!own && !agency) return null;

  let service = text(own?.title);
  const orderId = text(agency?.order_id);
  if (!service && orderId) {
    const line = await one(db.admin.from("order_lines").select("label").eq("order_id", orderId).order("sort_order", { ascending: true }).limit(1).maybeSingle());
    service = text(line?.label);
  }
  return {
    title: service ?? "",
    service,
    clientName: text(agency?.contact_name) ?? text(own?.client_label),
    status: text(agency?.status) ?? text(own?.status),
  };
}
