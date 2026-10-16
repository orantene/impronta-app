import "server-only";

import { sendEmailResult } from "@/lib/email";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { CancelNoticeDeps } from "./cancel-state-notice";

/** Production wiring: ledger table billing_notice_ledger + Resend. */
export function defaultCancelNoticeDeps(): CancelNoticeDeps {
  return {
    async claim(row) {
      const sb = createServiceRoleClient();
      if (!sb) return false;
      const { error } = await sb.from("billing_notice_ledger").insert({
        dedupe_key: row.key,
        kind: "cancel_state",
        scope: row.scope,
        stripe_subscription_id: row.subscriptionId,
        sent_to: row.to,
      });
      if (!error) return true;
      if (error.code === "23505") return false;
      throw new Error(`cancel notice claim failed: ${error.message}`);
    },
    async release(key) {
      const sb = createServiceRoleClient();
      await sb?.from("billing_notice_ledger").delete().eq("dedupe_key", key);
    },
    async send(input) {
      const r = await sendEmailResult(input);
      return r.status === "failed" ? "failed" : r.status === "skipped" ? "skipped" : "sent";
    },
  };
}
