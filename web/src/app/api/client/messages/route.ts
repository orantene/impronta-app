// Per-inquiry thread-message fetch for the client Messages shell.
// Client-side thread switching calls this to lazy-load a different
// inquiry's messages without a full page reload.

import { NextResponse } from "next/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { resolveClientApiRead } from "@/lib/impersonation/client-api-read";
import { loadClientInquiryMessages } from "@/app/(workspace)/[tenantSlug]/_data-bridge/inquiries-messages";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getCachedActorSession();
  if (!session.user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const url = new URL(req.url);
  const inquiryId = url.searchParams.get("inquiry");
  if (!inquiryId) return NextResponse.json({ error: "missing inquiry" }, { status: 400 });

  // Resolve the inquiry's tenant_id + verify the actor is the inquiry's
  // client. RLS would block this anyway but we want a clean 403, not a
  // silent empty array.
  // TUL-255: "the actor" is the effective client (the impersonation subject for
  // a verified staff view-as, else the session user). Read-only GET.
  const read = await resolveClientApiRead();
  if (!read) return NextResponse.json({ messages: [] });
  const { data: inq } = await read.client
    .from("inquiries")
    .select("id, tenant_id, client_user_id")
    .eq("id", inquiryId)
    .maybeSingle();
  if (!inq) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (inq.client_user_id !== read.userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Private thread — agency + client. Talent fan-out lives on the group thread.
  // D-MSG-2: the client reader also drops staff internal notes.
  const messages = await loadClientInquiryMessages(
    inq.tenant_id as string,
    inquiryId,
    read.impersonated ? read.userId : undefined,
  );
  return NextResponse.json({ messages });
}
