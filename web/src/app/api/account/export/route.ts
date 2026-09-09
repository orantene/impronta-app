// GET /api/account/export
//   → 200 application/json   everything tied to the signed-in account
//   → 401 unauthenticated
//   → 503 the export could not be built at all
//
// The route `20260513181600_f11_user_privacy_prefs.sql` promised and nobody
// wrote. `requestDataExport` has been stamping a timestamp into
// `privacy_prefs.dataExportRequestedAt` since that migration landed; nothing
// read it, so asking for your data produced a stored date and no data.
//
// AUTH IS THE SESSION AND ONLY THE SESSION. No id in the path, no token, no
// email parameter — the subject is whoever is signed in, so there is no
// argument an attacker can vary. That is why this handler has no 403 branch:
// there is no other person's export to be refused from.
//
// The service-role client is used to READ, and every read is pinned to the
// session's own user id by `EXPORT_SOURCES`. Using the caller's RLS-scoped
// client instead would have been the obvious choice and is the wrong one here:
// several of these tables are staff-scoped, so a person who is not staff of the
// workspace would silently receive an empty section for rows that are
// genuinely theirs. An incomplete subject access response that looks complete
// is worse than a refusal.
//
// `no-store` and `private`, because this is the single most sensitive response
// this application produces.

import { NextResponse } from "next/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { buildAccountExport, exportFilename } from "@/lib/account/export-bundle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getCachedActorSession();
  if (!session.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    logServerError("account.export/admin", "createServiceRoleClient returned null");
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const bundle = await buildAccountExport(admin, {
    userId: session.user.id,
    email: session.user.email ?? null,
  });

  return new NextResponse(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename(new Date())}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
