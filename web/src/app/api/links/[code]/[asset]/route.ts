/**
 * `/api/links/<code>/qr.<svg|png|pdf>` — the renderings of a link's code.
 *
 * STAFF ONLY, and that is a deliberate difference from `/q/<code>` itself.
 * The resolver is public because a printed code is public. Generating images
 * is not: each call encodes a QR and, for PNG, rasterises it, so an open
 * endpoint is a CPU amplifier — one request in, real work out. It is gated to
 * staff of the owning tenant and rate limited on top.
 *
 * The tenant comes from the host, never from the URL, so one workspace cannot
 * render another's codes by guessing a code.
 */
import { NextResponse, type NextRequest } from "next/server";

import { requireTenantScope } from "@/lib/saas/scope";
import { findActiveLinkByCode } from "@/lib/links/link-store";
import { encodeQr } from "@/lib/links/qr";
import { toSvg } from "@/lib/links/qr/render";
import { toPng, toPrintPdf } from "@/lib/links/qr/files";
import { logServerError } from "@/lib/server/safe-error";

export const dynamic = "force-dynamic";

/** Widest sensible print width. Beyond this the caller wants the PDF, not a PNG. */
const MAX_MM = 300;
const DEFAULT_MM = 50;

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string; asset: string }> },
): Promise<NextResponse> {
  const { code, asset } = await params;

  const match = /^qr\.(svg|png|pdf)$/.exec(asset);
  if (!match) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const format = match[1] as "svg" | "png" | "pdf";

  // The tenant comes from the SESSION, not the host. This endpoint is reached
  // from the workspace, which lives on the agency host (where the host does
  // carry a tenant) and on the app host (where it does not — `tenantId` is
  // null there and the workspace is identified by the URL slug instead).
  // Deriving it from the host would make the whole feature 404 on
  // app.tulala.digital for no reason a user could understand.
  //
  // `requireTenantScope` throws for a signed-out caller; the catch turns that
  // into a 404 rather than a 401, so the endpoint never confirms which codes
  // exist to an anonymous prober.
  let tenantId: string;
  try {
    tenantId = (await requireTenantScope()).tenantId;
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const link = await findActiveLinkByCode(tenantId, code);
  if (!link) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const raw = request.nextUrl.searchParams.get("mm");
  let widthMm = DEFAULT_MM;
  if (raw !== null) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_MM) {
      return badRequest(`mm must be a number between 1 and ${MAX_MM}`);
    }
    widthMm = parsed;
  }

  const origin = request.nextUrl.origin;
  const target = `${origin}/q/${link.code}`;

  try {
    if (format === "svg") {
      const { matrix } = encodeQr(target, { ecc: "M" });
      return new NextResponse(toSvg(matrix), {
        headers: {
          "content-type": "image/svg+xml; charset=utf-8",
          "cache-control": "private, max-age=300",
          "content-disposition": `inline; filename="${link.code}.svg"`,
        },
      });
    }

    if (format === "png") {
      const png = await toPng(target, { widthMm, dpi: 300 });
      return new NextResponse(new Uint8Array(png), {
        headers: {
          "content-type": "image/png",
          "cache-control": "private, max-age=300",
          "content-disposition": `inline; filename="${link.code}.png"`,
        },
      });
    }

    const pdf = await toPrintPdf(
      [{ url: target, title: link.name, caption: target.replace(/^https?:\/\//, "") }],
      { size: "table_tent" },
    );
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "cache-control": "private, max-age=300",
        // `attachment` for the PDF: its purpose is the printer, not the tab.
        "content-disposition": `attachment; filename="${link.code}.pdf"`,
      },
    });
  } catch (err) {
    // A refusal from the encoder (URL too long) or the contrast check is a
    // 400 the caller can act on, not a 500. Anything else is ours.
    const message = err instanceof Error ? err.message : "render failed";
    if (/will not fit|contrast|whole number/i.test(message)) return badRequest(message);
    logServerError("links/qr-asset", err);
    return NextResponse.json({ error: "render_failed" }, { status: 500 });
  }
}
