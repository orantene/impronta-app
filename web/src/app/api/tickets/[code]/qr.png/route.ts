import { NextResponse, type NextRequest } from "next/server";

import { encodeQr } from "@/lib/links/qr";
import { toPng } from "@/lib/links/qr/files";
import { tryConsumeRateLimit } from "@/lib/rate-limit";
import { getPublicHostContext } from "@/lib/saas/scope";
import { logServerError } from "@/lib/server/safe-error";
import { verifyAdmissionToken } from "@/lib/sessions/admission-token";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * The QR the ticket e-mail embeds: `/api/tickets/<signed-token>/qr.png`.
 *
 * PUBLIC, and that is safe because the path segment IS the credential — a
 * signed admission token nobody can forge — and the image encodes nothing
 * but that same token. Anyone holding the URL already holds the ticket.
 *
 * What it refuses, all as 404 (never distinguish "no such ticket" from "not
 * this tenant" from "old version" to a prober):
 *   - a host that carries no tenant, or a token for another tenant's row;
 *   - a token whose version is not the row's CURRENT one: a transferred
 *     ticket bumps `token_version`, so the previous holder's e-mail image
 *     dies with the previous holder's code;
 *   - a cancelled/refunded admission.
 * Rate-limited per IP so the endpoint cannot be used as a signature oracle.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!tryConsumeRateLimit(`ticket-qr:${ip}`, 120, 60_000)) {
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
  const { data, error } = await admin
    .from("admissions")
    .select("id, token_version, status")
    .eq("tenant_id", host.tenantId)
    .eq("id", verified.admissionId)
    .maybeSingle();
  if (error) {
    logServerError("tickets.qr/read", error);
    return notFound();
  }
  const row = data as { id: string; token_version: number; status: string } | null;
  if (!row || row.token_version !== verified.tokenVersion || row.status !== "valid") return notFound();

  try {
    // Sized for a phone screen in an e-mail (220 css px, 2x). `toPng` takes a
    // physical width; 40 mm at 300 dpi is ~470 px.
    encodeQr(token, { ecc: "Q" }); // throws on overflow before we touch sharp
    const png = await toPng(token, { widthMm: 40, dpi: 300, ecc: "Q" });
    return new NextResponse(new Uint8Array(png), {
      status: 200,
      headers: {
        "content-type": "image/png",
        "cache-control": "private, max-age=86400",
        "x-robots-tag": "noindex",
      },
    });
  } catch (err) {
    logServerError(`tickets.qr/encode admission=${row.id}`, err);
    return notFound();
  }
}
