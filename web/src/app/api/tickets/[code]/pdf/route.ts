import { NextResponse, type NextRequest } from "next/server";

import { buildTicketPdfForAdmission } from "@/lib/events/ticket-delivery";
import { tryConsumeRateLimit } from "@/lib/rate-limit";
import { getPublicHostContext } from "@/lib/saas/scope";
import { logServerError } from "@/lib/server/safe-error";
import { verifyAdmissionToken } from "@/lib/sessions/admission-token";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * The ticket PDF the e-mail attached, downloadable again:
 * `/api/tickets/<signed-token>/pdf`. One file per ORDER, one page per valid
 * admission, the requested one first. Same bytes the mail carried (same
 * facts loader, same renderer), so a guest who lost the attachment gets the
 * identical receipt + ticket.
 *
 * NO EXTENSION IN THE PATH: the proxy matcher skips static-looking paths,
 * and a route under the host-gated `/api/tickets` prefix that never sees
 * the host headers answers 404 to everyone (that is how `/qr.png` shipped
 * broken). The content type and the download filename say PDF; the segment
 * does not.
 *
 * Same guards as the QR route: the token is the credential (a signed
 * admission id + version nobody can forge); host must carry a tenant; the
 * row must be the current version and valid; per-IP rate limit so the
 * endpoint is not a signature oracle. Everything refused is a 404.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  // Rendering a PDF is heavier than a QR, so the budget is tighter.
  if (!tryConsumeRateLimit(`ticket-pdf:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const host = await getPublicHostContext();
  if ((host.kind !== "agency" && host.kind !== "hub") || !host.tenantId) return notFound();

  const { code } = await params;
  const token = decodeURIComponent(code);
  const verified = verifyAdmissionToken(token);
  if (!verified.ok) return notFound();

  const admin = createServiceRoleClient();
  if (!admin) return notFound();

  try {
    const pdf = await buildTicketPdfForAdmission(admin, {
      tenantId: host.tenantId,
      admissionId: verified.admissionId,
      tokenVersion: verified.tokenVersion,
    });
    if (!pdf) return notFound();
    return new NextResponse(new Uint8Array(pdf.bytes), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${pdf.filename}"`,
        "cache-control": "private, max-age=3600",
        "x-robots-tag": "noindex",
      },
    });
  } catch (err) {
    logServerError(`tickets.pdf/render admission=${verified.admissionId}`, err);
    return notFound();
  }
}
