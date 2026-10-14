import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  filterActiveCopyRecipients,
  type CopyKind,
  type CopyListRow,
} from "./kinds";

/**
 * Reads the platform-admin copy list (public.notification_email_copies) with a
 * short cache, like loadNotificationOverlay. Degrades to "no recipients" on
 * error so a DB blip never breaks the main notification send.
 */

const TTL_MS = 60_000;
let _cache: { at: number; rows: CopyListRow[] } | null = null;

export function invalidateCopyListCache(): void {
  _cache = null;
}

/** Returns the rows, or null when the list could not be read. */
async function loadCopyRows(admin?: SupabaseClient | null): Promise<CopyListRow[] | null> {
  const now = Date.now();
  if (_cache && now - _cache.at < TTL_MS) return _cache.rows;
  const sb = admin ?? createServiceRoleClient();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from("notification_email_copies")
      .select("email, kinds, paused");
    if (error) {
      logServerError("notifications.emailCopies.load", error);
      return null;
    }
    const rows = (data ?? []) as CopyListRow[];
    _cache = { at: now, rows };
    return rows;
  } catch (err) {
    logServerError("notifications.emailCopies.load", err);
    return null;
  }
}

export async function loadActiveCopyRecipients(
  kind: CopyKind,
  admin?: SupabaseClient | null,
): Promise<string[]> {
  const rows = await loadCopyRows(admin);
  return rows ? filterActiveCopyRecipients(rows, kind) : [];
}

/**
 * True when the list has zero rows at all. An unreadable list also counts as
 * empty, so the inbound env fallback keeps working during a DB blip.
 */
export async function copyListIsEmpty(admin?: SupabaseClient | null): Promise<boolean> {
  const rows = await loadCopyRows(admin);
  return rows == null || rows.length === 0;
}
