"use server";

import { headers } from "next/headers";

import { loadPaymentLinkByCode } from "@/lib/payments/links";
import { paymentLinkPublicUrl } from "@/lib/payments/pay-link-url";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { resolveAgendaPayPublicOrigin } from "@/lib/talent-agenda/pay-public-origin";

/**
 * The absolute checkout URL for an open pay link, on a host that serves it.
 * The code is the credential (anyone holding it can already open the page);
 * this returns nothing the code does not already reach.
 */
export async function resolvePayLinkPublicUrl(input: { code: string }): Promise<{ url: string | null }> {
  const code = typeof input?.code === "string" ? input.code.trim() : "";
  if (!/^[a-z0-9]{8,64}$/i.test(code)) return { url: null };
  const admin = createServiceRoleClient();
  if (!admin) return { url: null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- service-role Supabase client
  const link = await loadPaymentLinkByCode(admin as any, code);
  const tenantId = link.ok ? link.tenantId : null;
  if (!tenantId) return { url: null };
  let requested = "";
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) {
      const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)/.test(host) ? "http" : "https");
      requested = `${proto}://${host}`;
    }
  } catch {
    requested = "";
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- service-role Supabase client
  const origin = await resolveAgendaPayPublicOrigin(admin as any, tenantId, requested);
  return { url: origin ? paymentLinkPublicUrl(origin, code) : null };
}
