import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";

/**
 * EXPERIMENTAL WhatsApp drawer kill switch.
 *
 * Off by default. Enable with TULALA_WHATSAPP_DRAWER=1 or the isolated
 * platform_settings column. A missing column or a failed read is OFF, and
 * this file is the only place that column is read so the main workspace-ui
 * loader cannot break if the migration is rolled back.
 */
export async function isMessagingChannelsEnabled(): Promise<boolean> {
  if (process.env.TULALA_WHATSAPP_DRAWER === "1") return true;
  try {
    const admin = createServiceRoleClient();
    if (!admin) return false;
    const { data, error } = await admin
      .from("platform_settings")
      .select("workspace_messaging_channels_enabled")
      .eq("id", true)
      .maybeSingle();
    if (error || !data) return false;
    return !!(data as { workspace_messaging_channels_enabled?: boolean })
      .workspace_messaging_channels_enabled;
  } catch {
    return false;
  }
}

export async function writeMessagingChannelsEnabled(
  updatedBy: string,
  enabled: boolean,
): Promise<{ ok: true } | { ok: false }> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false };
    const { error } = await admin
      .from("platform_settings")
      .update({
        workspace_messaging_channels_enabled: enabled,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      } as never)
      .eq("id", true);
    if (error) return { ok: false };
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
