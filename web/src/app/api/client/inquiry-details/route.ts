// Phase C — lazy Details payload fetch for the client Messages shell.
// Called when the user switches inquiry in the thread pane.
//
// GET /api/client/inquiry-details?inquiry=<id>
//   → 200 { details: ClientInquiryDetails }
//   → 401 unauthenticated
//   → 403 not your inquiry
//   → 404 inquiry not found

import { NextResponse } from "next/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { loadClientInquiryDetails } from "@/app/(workspace)/[tenantSlug]/_data-bridge/client-inquiry-details";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getCachedActorSession();
  if (!session.user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const url = new URL(req.url);
  const inquiryId = url.searchParams.get("inquiry");
  if (!inquiryId) return NextResponse.json({ error: "missing inquiry" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ details: null });

  // Authz: confirm this inquiry's client_user_id matches the actor before
  // running the loader. RLS would block the loader too, but this gives a
  // clean 403 instead of a silently-empty payload.
  const { data: inq } = await supabase
    .from("inquiries")
    .select("id, tenant_id, client_user_id")
    .eq("id", inquiryId)
    .maybeSingle();
  if (!inq) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (inq.client_user_id !== session.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const details = await loadClientInquiryDetails(inq.tenant_id as string, inquiryId);
  return NextResponse.json({ details });
}
