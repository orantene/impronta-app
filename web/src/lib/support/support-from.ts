import type { SupabaseClient } from "@supabase/supabase-js";

/** Untyped from() — support_* tables are not in generated Database types yet. */
export function supportFrom(client: SupabaseClient, table: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (client as any).from(table);
}
