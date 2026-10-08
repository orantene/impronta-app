import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

import {
  clearStarterPrepare,
  markStarterPrepareFailed,
  needsStarterPrepareRetry,
} from "./starter-prepare";

export async function readAgencySettings(
  admin: SupabaseClient,
  tenantId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await admin
    .from("agencies")
    .select("settings")
    .eq("id", tenantId)
    .maybeSingle<{ settings: unknown }>();
  if (error) {
    logServerError("starter-prepare.readSettings", error);
    return null;
  }
  if (!data?.settings || typeof data.settings !== "object" || Array.isArray(data.settings)) {
    return {};
  }
  return data.settings as Record<string, unknown>;
}

export async function writeAgencySettings(
  admin: SupabaseClient,
  tenantId: string,
  settings: Record<string, unknown>,
): Promise<boolean> {
  const { error } = await admin.from("agencies").update({ settings }).eq("id", tenantId);
  if (error) {
    logServerError("starter-prepare.writeSettings", error);
    return false;
  }
  return true;
}

export async function recordStarterPrepareFailed(
  admin: SupabaseClient,
  tenantId: string,
  error?: string,
): Promise<void> {
  const current = await readAgencySettings(admin, tenantId);
  if (current == null) return;
  await writeAgencySettings(admin, tenantId, markStarterPrepareFailed(current, error));
}

export async function clearStarterPrepareFlag(
  admin: SupabaseClient,
  tenantId: string,
): Promise<void> {
  const current = await readAgencySettings(admin, tenantId);
  if (current == null) return;
  if (!("starter_prepare" in current)) return;
  await writeAgencySettings(admin, tenantId, clearStarterPrepare(current));
}

export async function agencyNeedsStarterPrepareRetry(
  admin: SupabaseClient,
  tenantId: string,
): Promise<boolean> {
  const current = await readAgencySettings(admin, tenantId);
  if (current == null) return false;
  return needsStarterPrepareRetry(current);
}
