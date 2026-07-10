/**
 * guest-chat-settings-shape.ts — the PURE shape + mapper for the per-tenant
 * guest-chat launcher settings. No `server-only`, no backend imports, so both
 * the public reader (guest-chat-settings.ts) and the admin write path
 * (admin-guest-chat-settings.ts) can share the exact same row→settings mapping,
 * and the mapper stays unit-testable outside an RSC bundle.
 *
 * DEFAULTS-ON / FAIL-OPEN CONTRACT: a tenant that has never configured this has
 * no row → the all-on default. A present row opts a surface OUT only with an
 * explicit `false`; any null/undefined flag stays ON (`x !== false`). A config
 * read must never strip a working chat off a public page.
 */

export type GuestChatSettings = {
  /** Master switch — false hides the launcher on every public surface. */
  enabled: boolean;
  /** Show the launcher on individual talent profile pages (/t/{code}). */
  showOnTalent: boolean;
  /** Show the launcher on the agency directory page (/directory). */
  showOnDirectory: boolean;
  /** Show the launcher on the agency home page (builder home or storefront, "/"). */
  showOnHome: boolean;
  /** Optional custom opener line; null → the built-in brand-voiced greeting. */
  greeting: string | null;
};

/** All-on default — preserves the pre-settings behavior + the directory rollout. */
export const GUEST_CHAT_DEFAULTS: GuestChatSettings = {
  enabled: true,
  showOnTalent: true,
  showOnDirectory: true,
  showOnHome: true,
  greeting: null,
};

/** Raw column shape as read from `tenant_guest_chat_settings` (all optional/nullable). */
export type GuestChatSettingsRow = {
  enabled?: boolean | null;
  show_on_talent?: boolean | null;
  show_on_directory?: boolean | null;
  show_on_home?: boolean | null;
  greeting?: string | null;
};

/**
 * Map a raw settings row to the app-facing GuestChatSettings. A missing row
 * (null/undefined) resolves to the all-on default; per-flag, only an explicit
 * `false` opts a surface out (fail-open). Greeting is trimmed to null when blank.
 */
export function mapGuestChatSettingsRow(
  row: GuestChatSettingsRow | null | undefined,
): GuestChatSettings {
  if (!row) return GUEST_CHAT_DEFAULTS;
  const greeting =
    typeof row.greeting === "string" && row.greeting.trim().length > 0
      ? row.greeting.trim()
      : null;
  return {
    enabled: row.enabled !== false,
    showOnTalent: row.show_on_talent !== false,
    showOnDirectory: row.show_on_directory !== false,
    showOnHome: row.show_on_home !== false,
    greeting,
  };
}
