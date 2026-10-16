import "server-only";

import { sendEmailResult } from "@/lib/email";
import { createServiceRoleClient } from "@/lib/supabase/admin";
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
    async send(input) {
      const r = await sendEmailResult(input);
      return r.status === "failed" ? "failed" : r.status === "skipped" ? "skipped" : "sent";
    },
  };
}
