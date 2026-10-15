import { NextResponse, type NextRequest } from "next/server";

import { loadShareAssetData } from "@/lib/promos/share/asset-data";
import { buildPromoCardPdf } from "@/lib/promos/share/card-pdf";
import { conditionLine, offerHeadline } from "@/lib/promos/share/captions";
import { parseVia } from "@/lib/promos/share/links";
import { allowedStoragePhoto } from "@/lib/promos/share/theme-defaults";
import { printableCardAllowed } from "@/lib/promos/share/card-gate";
import { parseFormat, parseLang, parseStyle, sanitizeColors } from "@/lib/promos/share/visual-model";
import { renderShareVisual } from "@/lib/promos/share/visuals";

function allowedPhoto(raw: string | null): string | null {
  return allowedStoragePhoto(raw, process.env.NEXT_PUBLIC_SUPABASE_URL);
}

/**
 * GET /api/promos/share/<promoId>/<story|post|card>
 *   ?style=theme|bold|photo &lang=es|en &host=<registered host> &bg= &ink= &accent= &photo=<https url> &qr=1
 *
 * story / post -> PNG (ImageResponse). card -> printable A6 PDF (the QR link is
 * tagged `via=qr_print`). Public promo content only; personal / draft / archived 404.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ promoId: string; asset: string }> },
): Promise<Response> {
  const { promoId, asset } = await ctx.params;
  const q = req.nextUrl.searchParams;
  const data = await loadShareAssetData({ promoId, origin: req.nextUrl.origin, host: q.get("host") });
  if (!data) return new NextResponse(null, { status: 404 });

  const lang = parseLang(q.get("lang"));
  const colors = sanitizeColors({
    bg: q.get("bg") ?? data.theme.colors.bg,
    ink: q.get("ink") ?? data.theme.colors.ink,
    accent: q.get("accent") ?? data.theme.colors.accent,
  });
  const headline = offerHeadline(data.promo, lang);
  const condition = conditionLine(data.promo, lang, data.spotsLeft);
  const cache = { "Cache-Control": "public, max-age=300, s-maxage=300" };

  if (asset === "card") {
    // The printable card is a paid feature; the UI hides it, the server enforces it.
    if (!printableCardAllowed(data.talentPlanKey)) return new NextResponse(null, { status: 403 });
    const bytes = await buildPromoCardPdf({
      lang, talentName: data.talentName, headline, condition,
      link: data.linkFor("qr_print"), accent: colors.accent,
    });
    return new NextResponse(Buffer.from(bytes), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="promo-${data.slug}.pdf"`, ...cache },
    });
  }

  const format = parseFormat(asset);
  if (!format) return new NextResponse(null, { status: 404 });
  // Satori fetches the photo server side: only our own storage host is accepted.
  const photo = allowedPhoto(q.get("photo")) ?? data.theme.photoUrl;
  const via = parseVia(q.get("via")) ?? (format === "story" ? "ig_story" : "ig_post");
  const res = renderShareVisual({
    format, style: parseStyle(q.get("style")), lang, headline, condition,
    talentName: data.talentName, link: data.linkFor(via), colors,
    photoUrl: photo,
    withQr: q.get("qr") === "1",
  });
  for (const [k, v] of Object.entries(cache)) res.headers.set(k, v);
  if (q.get("download") === "1") res.headers.set("Content-Disposition", `attachment; filename="promo-${data.slug}-${format}.png"`);
  return res;
}
