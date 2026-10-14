/**
 * TUL-G5: `/account/visits/<id>` is keyed on `inquiries.id`, but emails used to
 * send a BOOKING id. Accept either: an inquiry id passes through, a booking id
 * resolves to its `source_inquiry_id`. The caller still filters by the signed-in
 * client and tenant, so resolving here never widens access.
 */
type Row = { source_inquiry_id: string | null } | null;
type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export async function resolveVisitInquiryId(admin: Admin, tenantId: string, id: string): Promise<string> {
  const { data: inq, error: inqErr } = await admin.from("inquiries").select("id").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  if (inqErr) console.error("[visit-id] inquiry lookup failed", inqErr.message);
  if (inq) return id;
  const { data: bk, error: bkErr } = await admin
    .from("agency_bookings")
    .select("source_inquiry_id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (bkErr) console.error("[visit-id] booking lookup failed", bkErr.message);
  return (bk as Row)?.source_inquiry_id ?? id;
}
