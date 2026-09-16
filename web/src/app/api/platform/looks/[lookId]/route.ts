/**
 * GET /api/platform/looks/<lookId> — export one built-in Look as portable JSON.
 *
 * Shape: `PortableLook` (see site-templates/portable-look.ts). Super-admin
 * only. Import (the reverse) lands with the `site_looks` table in PR-B.
 */

import { NextResponse } from "next/server";

import { isPlatformAdmin } from "@/lib/access/platform-role";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { getLook } from "@/lib/site-admin/builder-core/site-templates";
import { toPortableLook } from "@/lib/site-admin/builder-core/site-templates/portable-look";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ lookId: string }> }) {
  const session = await getCachedActorSession();
  if (!isPlatformAdmin(session.profile)) {
    return NextResponse.json({ error: "Super admin access required." }, { status: 404 });
  }
  const { lookId } = await ctx.params;
  const look = getLook(lookId);
  if (!look) return NextResponse.json({ error: "Unknown look." }, { status: 404 });
  return new NextResponse(JSON.stringify(toPortableLook(look), null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${look.id}.look.json"`,
    },
  });
}
