import "server-only";

import { NextResponse } from "next/server";

import { userHasCapability } from "@/lib/access";

/** Capability every admin media write route requires on the resolved workspace (editor and above). */
export const MEDIA_UPLOAD_CAPABILITY = "agency.site_admin.media.upload" as const;

/**
 * 403 response when the caller's ACTIVE membership in `tenantId` does not grant media uploads
 * (viewers and pending members), null when allowed. Routes that resolve the tenant themselves
 * call this right after resolving it, before reading the body or touching storage.
 */
export async function mediaUploadDenied(tenantId: string): Promise<NextResponse | null> {
  if (await userHasCapability(MEDIA_UPLOAD_CAPABILITY, tenantId)) return null;
  return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 403 });
}
