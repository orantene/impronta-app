// GET /api/receipt/[bookingId]
//   → 200 application/pdf   client booking receipt (what/when/where, gross paid, receipt #)
//   → 401 unauthenticated
//   → 403 not your booking
//   → 404 booking not found
//   → 500 generation error
//
// Auth: only the booking's client (agency_bookings.client_user_id) may pull it.
// Receipt shows the GROSS amount paid only — never talent net, commission, or
// platform fee. The data fetch + auth gate live in @/lib/pdf/receipt so this
// handler stays a thin transport shell (the shells just render a link to it).

import { NextResponse } from "next/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { generateReceiptPdf } from "@/lib/pdf/receipt";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const session = await getCachedActorSession();
  if (!session.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { bookingId } = await params;
  if (!bookingId) {
    return NextResponse.json({ error: "missing booking" }, { status: 400 });
  }

  const result = await generateReceiptPdf(bookingId, session.user.id);
  if (!result.ok) {
    const status =
      result.reason === "forbidden" ? 403 : result.reason === "not_found" ? 404 : 500;
    return NextResponse.json({ error: result.reason }, { status });
  }

  return new NextResponse(Buffer.from(result.bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
