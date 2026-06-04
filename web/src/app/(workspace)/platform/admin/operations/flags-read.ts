// Platform HQ · Operations — live read of platform-default feature-flag values.
//
// Server-only. Reads the GLOBAL platform-default rows (tenant_id IS NULL) for
// every registered flag key via the service-role client, so the admin sees the
// exact value each getter resolves in the platform/hub context. The page is
// platform-admin gated by the layout; this is a read of global config only.

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { FLAG_GROUPS } from "./flags-registry";

/** Raw current value per flag key (the JSONB stored in settings), or undefined when no row. */
export type FlagValues = Record<string, unknown>;

export async function readFlagValues(): Promise<FlagValues> {
  const keys = FLAG_GROUPS.flatMap((g) => g.flags.map((f) => f.key));
  const sb = createServiceRoleClient();
  if (!sb) return {};

  const { data, error } = await sb
    .from("settings")
    .select("key, value")
    .in("key", keys)
    .is("tenant_id", null);

  if (error || !data) {
    if (error) logServerError("operations/readFlagValues", error);
    return {};
  }

  const out: FlagValues = {};
  for (const row of data as Array<{ key: string; value: unknown }>) {
    out[row.key] = row.value;
  }
  return out;
}
