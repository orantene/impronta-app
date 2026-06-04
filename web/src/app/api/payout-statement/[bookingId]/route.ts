/**
 * GET /api/payout-statement/[bookingId]
 *
 * Returns a PDF payout statement for the calling talent on the specified
 * booking. The `bookingId` segment is the real `agency_bookings.id`.
 *
 * Auth: only the booking's talent participant (via booking_payouts leg).
 * Other authenticated users → 403. Unauthenticated → 401.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generatePayoutStatementPdf } from "@/lib/pdf/payout-statement";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const { bookingId } = await params;

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });
  }

  const result = await generatePayoutStatementPdf(bookingId, user.id);

  if (!result.ok) {
    const status =
      result.reason === "forbidden" ? 403 : result.reason === "not_found" ? 404 : 500;
    return NextResponse.json({ error: result.reason }, { status });
  }

  return new NextResponse(Buffer.from(result.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
