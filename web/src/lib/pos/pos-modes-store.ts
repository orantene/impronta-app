import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { enabledPosModesAtLocation, enabledPosModesFromSettings, type PosMode } from "@/lib/pos/modes";

/**
 * `agencies.settings.pos.locations.default.modes` — the ONLY reader and
 * writer of that path, mirroring `runs-events-store.ts`.
 *
 * Lives outside `lib/server-actions/` on purpose: `agencies` has no
 * `tenant_id` column to route through `tenantScopedQuery` — the agency row
 * IS the tenant, scoped by its own `id` — so this stays a small, single-
 * purpose store the "use server" action calls into, the same shape
 * `readRunsEvents` / `writeRunsEvents` already established for the sibling
 * `agencies.runs_events` column.
 */

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function readPosModes(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<PosMode[] | null> {
  const { data, error } = await supabase
    .from("agencies")
    .select("settings")
    .eq("id", tenantId)
    .single();
  if (error) {
    logServerError("pos-modes-store.readPosModes", error);
    return null;
  }
  return enabledPosModesFromSettings((data as { settings?: unknown } | null)?.settings);
}

export async function writePosModes(
  supabase: SupabaseClient,
  tenantId: string,
  modes: readonly PosMode[],
): Promise<{ ok: true; before: PosMode[] } | { ok: false }> {
  const { data: agency, error: readErr } = await supabase
    .from("agencies")
    .select("settings")
    .eq("id", tenantId)
    .single();
  if (readErr) {
    logServerError("pos-modes-store.writePosModes.read", readErr);
    return { ok: false };
  }

  const rawSettings = (agency as { settings?: unknown } | null)?.settings;
  const before = enabledPosModesFromSettings(rawSettings);

  const currentSettings: Record<string, unknown> = isPlainRecord(rawSettings) ? rawSettings : {};
  const currentPos: Record<string, unknown> = isPlainRecord(currentSettings.pos) ? currentSettings.pos : {};
  const currentLocations: Record<string, unknown> = isPlainRecord(currentPos.locations) ? currentPos.locations : {};
  const currentDefault: Record<string, unknown> = isPlainRecord(currentLocations.default)
    ? currentLocations.default
    : {};

  const nextSettings = {
    ...currentSettings,
    pos: {
      ...currentPos,
      locations: {
        ...currentLocations,
        default: { ...currentDefault, modes: [...modes] },
      },
    },
  };

  const { error: updateErr } = await supabase
    .from("agencies")
    .update({ settings: nextSettings, updated_at: new Date().toISOString() })
    .eq("id", tenantId);
  if (updateErr) {
    logServerError("pos-modes-store.writePosModes.update", updateErr);
    return { ok: false };
  }
  return { ok: true, before };
}

export async function readLocationModes(
  supabase: SupabaseClient,
  tenantId: string,
  slug: string,
): Promise<PosMode[] | null> {
  const { data, error } = await supabase
    .from("agencies")
    .select("settings")
    .eq("id", tenantId)
    .single();
  if (error) {
    logServerError("pos-modes-store.readLocationModes", error);
    return null;
  }
  return enabledPosModesAtLocation((data as { settings?: unknown } | null)?.settings, slug);
}

export async function writeLocationModes(
  supabase: SupabaseClient,
  tenantId: string,
  slug: string,
  modes: readonly PosMode[],
): Promise<{ ok: true; before: PosMode[] } | { ok: false }> {
  const key = slug.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(key)) return { ok: false };

  const { data: agency, error: readErr } = await supabase
    .from("agencies")
    .select("settings")
    .eq("id", tenantId)
    .single();
  if (readErr) {
    logServerError("pos-modes-store.writeLocationModes.read", readErr);
    return { ok: false };
  }

  const rawSettings = (agency as { settings?: unknown } | null)?.settings;
  const before = enabledPosModesAtLocation(rawSettings, key);
  const currentSettings: Record<string, unknown> = isPlainRecord(rawSettings) ? rawSettings : {};
  const currentPos: Record<string, unknown> = isPlainRecord(currentSettings.pos) ? currentSettings.pos : {};
  const currentLocations: Record<string, unknown> = isPlainRecord(currentPos.locations)
    ? currentPos.locations
    : {};
  const currentNamed: Record<string, unknown> = isPlainRecord(currentLocations[key])
    ? currentLocations[key]
    : {};

  const nextSettings = {
    ...currentSettings,
    pos: {
      ...currentPos,
      locations: {
        ...currentLocations,
        [key]: { ...currentNamed, modes: [...modes] },
      },
    },
  };

  const { error: updateErr } = await supabase
    .from("agencies")
    .update({ settings: nextSettings, updated_at: new Date().toISOString() })
    .eq("id", tenantId);
  if (updateErr) {
    logServerError("pos-modes-store.writeLocationModes.update", updateErr);
    return { ok: false };
  }
  return { ok: true, before };
}
