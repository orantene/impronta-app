import "server-only";

/**
 * guest-chat-settings.ts — per-tenant configuration for the public guest-chat
 * launcher, READ side.
 *
 * The launcher is rendered on public, unauthenticated pages (talent profiles +
 * the agency directory/home). A tenant admin controls it from the workspace
 * Settings → Guest chat drawer; that writes `tenant_guest_chat_settings`.
 *
 * DEFAULTS-ON CONTRACT: a tenant that has NEVER configured this has no row.
 * `loadGuestChatSettings` then returns the all-on default so the launcher keeps
 * working everywhere out of the box (talent profiles AND directory/home). A
 * tenant opts out by saving a row with the relevant flag false.
 *
 * NEVER THROWS: any infra error resolves to the all-on default — a config-read
 * failure must not strip a working chat off the page (fail-open, like the rest
 * of the public render path).
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export type GuestChatSettings = {
  /** Master switch — false hides the launcher on every public surface. */
  enabled: boolean;
  /** Show the launcher on individual talent profile pages (/t/{code}). */
  showOnTalent: boolean;
  /** Show the launcher on the agency directory + home pages. */
  showOnDirectory: boolean;
  /** Optional custom opener line; null → the built-in brand-voiced greeting. */
  greeting: string | null;
};

/** All-on default — preserves the pre-settings behavior + the directory rollout. */
export const GUEST_CHAT_DEFAULTS: GuestChatSettings = {
  enabled: true,
  showOnTalent: true,
  showOnDirectory: true,
  greeting: null,
};

/**
 * Resolve the guest-chat settings for a tenant. Returns the all-on default when
 * there is no row or on any error (fail-open). Safe to call from any public
 * server component.
 */
export async function loadGuestChatSettings(
  tenantId: string | null | undefined,
): Promise<GuestChatSettings> {
  if (!tenantId) return GUEST_CHAT_DEFAULTS;
  try {
    const admin = createServiceRoleClient();
    if (!admin) return GUEST_CHAT_DEFAULTS;

    const { data, error } = await admin
      .from("tenant_guest_chat_settings")
      .select("enabled, show_on_talent, show_on_directory, greeting")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) {
      logServerError("guest-chat-settings/load", error);
      return GUEST_CHAT_DEFAULTS;
    }
    if (!data) return GUEST_CHAT_DEFAULTS;

    const greeting =
      typeof data.greeting === "string" && data.greeting.trim().length > 0
        ? data.greeting.trim()
        : null;

    return {
      enabled: data.enabled !== false,
      showOnTalent: data.show_on_talent !== false,
      showOnDirectory: data.show_on_directory !== false,
      greeting,
    };
  } catch (err) {
    logServerError("guest-chat-settings/load.unexpected", err);
    return GUEST_CHAT_DEFAULTS;
  }
}
