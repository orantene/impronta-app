// Booking form prefill (TUL-723): the signed-in client's OWN name, email and
// phone, so the "who" step opens filled in. Session user only; the request
// carries no identifier. Staff and talent sessions get nothing.

import { NextResponse } from "next/server";

import { bookingPrefillFor } from "@/lib/client-account/booking-prefill";
import { accountSurfaceEnabledForRequest } from "@/lib/client-account/tenant.server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function GET() {
  try {
    if (!(await accountSurfaceEnabledForRequest())) return reply({ prefill: null }, 404);
    const session = await getCachedActorSession();
    const user = session.user;
    const admin = createServiceRoleClient();
    if (!user || !admin) return reply({ prefill: null });
    const [profileRes, clientRes] = await Promise.all([
      admin.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
      admin.from("client_profiles").select("phone").eq("user_id", user.id).maybeSingle(),
    ]);
    if (profileRes.error) logServerError("clientAccount.bookingPrefill.profile", profileRes.error);
    if (clientRes.error) logServerError("clientAccount.bookingPrefill.client", clientRes.error);
    const prefill = bookingPrefillFor({
      appRole: session.profile?.app_role,
      displayName: (profileRes.data as { display_name?: string | null } | null)?.display_name,
      email: user.email,
      phone: (clientRes.data as { phone?: string | null } | null)?.phone,
    });
    return reply({ prefill });
  } catch {
    return reply({ prefill: null }, 500);
  }
}
