/**
 * profile-pin-preflight.ts — a pinned roster goes stale in silence.
 *
 * The Featured Talent grid reads `manualProfileCodes` IN ORDER and stops at
 * `limit`. When a pinned profile leaves the roster its code simply resolves to
 * nothing: no error, no gap, just one fewer card. The homepage shipped three
 * cards in a four-column row that way, and the only reason it was ever caught
 * was someone looking at the section on purpose.
 *
 * So the seed checks the pins the same way it checks a video's embeddability:
 * ask the source of truth, and refuse to write a page whose pins are fiction.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ProfilePinIssue {
  code: string;
  reason: "missing" | "not_listed";
}

/** Every `manualProfileCodes` entry anywhere in a page tree. */
export function collectPinnedProfileCodes(tree: unknown): string[] {
  const codes: string[] = [];
  const walk = (value: unknown, key?: string): void => {
    if (Array.isArray(value)) {
      if (key === "manualProfileCodes") {
        for (const v of value) if (typeof v === "string") codes.push(v);
        return;
      }
      return void value.forEach((v) => walk(v));
    }
    if (!value || typeof value !== "object") return;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) walk(v, k);
  };
  walk(tree);
  return [...new Set(codes)];
}

/**
 * Which pinned codes cannot render today. A code is fine only when the profile
 * exists AND is publicly listed — an unlisted profile is just as invisible on
 * the storefront as a deleted one.
 */
export async function findBrokenProfilePins(
  supabase: SupabaseClient,
  codes: readonly string[],
): Promise<ProfilePinIssue[]> {
  if (codes.length === 0) return [];
  const { data, error } = await supabase
    .from("talent_profiles")
    .select("profile_code, is_publicly_listed, workflow_status")
    .in("profile_code", codes as string[]);
  // A failed lookup must not block a seed — the preflight is a guard, not a
  // gate on Supabase being reachable. Same call the video preflight makes.
  if (error) return [];
  const byCode = new Map(
    (data ?? []).map((r) => [
      (r as { profile_code: string }).profile_code,
      r as { is_publicly_listed: boolean | null; workflow_status: string | null },
    ]),
  );
  const issues: ProfilePinIssue[] = [];
  for (const code of codes) {
    const row = byCode.get(code);
    if (!row) issues.push({ code, reason: "missing" });
    else if (row.is_publicly_listed === false) issues.push({ code, reason: "not_listed" });
  }
  return issues;
}

export function describeBrokenPins(issues: readonly ProfilePinIssue[]): string {
  const lines = issues.map(
    (i) =>
      `  ${i.code} — ${i.reason === "missing" ? "no such profile" : "exists but is not publicly listed"}`,
  );
  return [
    `${issues.length} pinned profile code(s) cannot render:`,
    ...lines,
    "",
    "The grid reads these in order and stops at `limit`, so a dead code in the",
    "first N leaves an empty column rather than an error. Fix the list in",
    "scripts/impronta-rebuild/pages/home.ts (and page-designs/impronta.ts).",
  ].join("\n");
}
