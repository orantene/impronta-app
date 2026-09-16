import { createServiceRoleClient } from "@/lib/supabase/admin";

/**
 * Onboarding module switch, read from `public.settings` (platform-default
 * layer, `tenant_id IS NULL`) with the service role like the AI flags.
 *
 * `onboarding_module_enabled` gates the shared onboarding overlay on the
 * marketing host: when false (or absent, or the DB is unreachable) every CTA
 * keeps today's behaviour (talent modal / `/get-started`). Off by default so
 * a deploy never changes the funnel until the owner flips it in
 * `/platform/admin/operations`.
 */
export type OnboardingFlags = {
  onboarding_module_enabled: boolean;
};

export const ONBOARDING_FLAG_KEYS = ["onboarding_module_enabled"] as const;

const DEFAULT_FLAGS: OnboardingFlags = { onboarding_module_enabled: false };

export function parseOnboardingFlagRows(
  rows: ReadonlyArray<{ key: string; value: unknown }> | null | undefined,
): OnboardingFlags {
  if (!rows) return { ...DEFAULT_FLAGS };
  const map = new Map(rows.map((r) => [r.key, r.value] as const));
  return {
    onboarding_module_enabled: asFlag(map.get("onboarding_module_enabled")),
  };
}

export async function getOnboardingFlags(): Promise<OnboardingFlags> {
  const supabase = createServiceRoleClient();
  if (!supabase) return { ...DEFAULT_FLAGS };
  const { data, error } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", [...ONBOARDING_FLAG_KEYS])
    .is("tenant_id", null);
  if (error || !data) return { ...DEFAULT_FLAGS };
  return parseOnboardingFlagRows(data);
}

function asFlag(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (value && typeof value === "object" && "enabled" in (value as object)) {
    return Boolean((value as { enabled?: boolean }).enabled);
  }
  return false;
}
