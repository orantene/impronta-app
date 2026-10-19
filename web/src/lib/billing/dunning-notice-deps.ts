import "server-only";

import { sendEmailResult } from "@/lib/email";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import type { DunningNoticeDeps } from "./dunning-notice";

/** Production wiring: ledger table billing_dunning_notices + Resend. */
export function defaultDunningNoticeDeps(): DunningNoticeDeps {
  return {
    async claim(row) {
      const sb = createServiceRoleClient();
      if (!sb) return false;
      const { error } = await sb.from("billing_dunning_notices").insert({
        stripe_invoice_id: row.invoiceId,
        scope: row.scope,
        stripe_subscription_id: row.subscriptionId,
        sent_to: row.to,
      });
      // 23505 = already claimed (replay / later retry attempt).
      if (!error) return true;
      if (error.code === "23505") return false;
      throw new Error(`dunning claim failed: ${error.message}`);
    },
    async release(invoiceId) {
      const sb = createServiceRoleClient();
      await sb?.from("billing_dunning_notices").delete().eq("stripe_invoice_id", invoiceId);
    },
    async recipientLocale(query) {
      const sb = createServiceRoleClient();
      if (!sb || !query.subscriptionId) return null;
      return loadDunningRecipientLocale(sb, query.scope, query.subscriptionId);
    },
    async send(input) {
      const r = await sendEmailResult(input);
      return r.status === "failed" ? "failed" : r.status === "skipped" ? "skipped" : "sent";
    },
  };
}

type Sb = NonNullable<ReturnType<typeof createServiceRoleClient>>;

/**
 * TUL-835: the language the payment-failed email is written in. Talent: the
 * talent's own dashboard language (talent_profiles.preferred_locale). Workspace:
 * the workspace default language. Null when unknown or on a read error (the
 * caller then falls back to the Stripe customer locale, then English).
 */
async function loadDunningRecipientLocale(
  sb: Sb,
  scope: "talent" | "workspace",
  subscriptionId: string,
): Promise<string | null> {
  if (scope === "talent") {
    const { data: sub, error: subErr } = await sb
      .from("talent_subscriptions")
      .select("talent_profile_id")
      .eq("stripe_subscription_id", subscriptionId)
      .maybeSingle<{ talent_profile_id: string | null }>();
    if (subErr) {
      logServerError("dunning-notice.locale.talent_subscription", subErr);
      return null;
    }
    if (!sub?.talent_profile_id) return null;
    const { data: profile, error: profileErr } = await sb
      .from("talent_profiles")
      .select("preferred_locale")
      .eq("id", sub.talent_profile_id)
      .maybeSingle<{ preferred_locale: string | null }>();
    if (profileErr) {
      logServerError("dunning-notice.locale.talent_profile", profileErr);
      return null;
    }
    return profile?.preferred_locale ?? null;
  }
  const { data: ws, error: wsErr } = await sb
    .from("workspace_subscriptions")
    .select("tenant_id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle<{ tenant_id: string | null }>();
  if (wsErr) {
    logServerError("dunning-notice.locale.workspace_subscription", wsErr);
    return null;
  }
  if (!ws?.tenant_id) return null;
  const { data: ident, error: identErr } = await sb
    .from("agency_business_identity")
    .select("default_locale")
    .eq("tenant_id", ws.tenant_id)
    .maybeSingle<{ default_locale: string | null }>();
  if (identErr) {
    logServerError("dunning-notice.locale.workspace_identity", identErr);
    return null;
  }
  return ident?.default_locale ?? null;
}
