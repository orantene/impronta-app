import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A single row from `public.inquiry_coordinators`, plus a display-facing name
 * resolved from `public.profiles`. Shape is frozen for Phase 1 — expanding it
 * later is fine, but the existing keys must not change.
 */
export type InquiryCoordinator = {
  inquiry_id: string;
  user_id: string;
  role: "primary" | "secondary";
  status: "active" | "former_coordinator";
  assigned_at: string;
  assigned_by: string | null;
  display_name: string | null;
};

export type InquiryCoordinatorsResult = {
  /**
   * The single primary+active coordinator, if any. Guaranteed unique by the
   * `inquiry_coordinators_primary_unique` partial index.
   */
  primary: InquiryCoordinator | null;
  /** All secondary+active coordinators, ordered by assigned_at asc. */
  secondaries: InquiryCoordinator[];
  /**
   * Rows with status='former_coordinator' — retained for thread history (spec
   * §6: "removed coordinators remain in history, cannot send messages"). Kept
   * separate so callers don't accidentally treat them as active members.
   */
  former: InquiryCoordinator[];
};

const EMPTY: InquiryCoordinatorsResult = Object.freeze({
  primary: null,
  secondaries: [],
  former: [],
});

type RawRow = {
  inquiry_id: string;
  user_id: string;
  role: "primary" | "secondary";
  status: "active" | "former_coordinator";
  assigned_at: string;
  assigned_by: string | null;
  profiles: { display_name: string | null } | null;
};

/**
 * Read the full coordinator roster for an inquiry, partitioned into
 * `primary` / `secondaries` / `former`. Returns an empty result on error or
 * no rows — consumers should treat absence as "no data" rather than branching
 * on null everywhere.
 *
 * Uses whichever client the caller passes, so RLS applies normally:
 *   • server components with the user client → user-scoped visibility
 *   • service-role client → full visibility (use sparingly)
 *
 * No writes from this module in M1.1 — authoring actions land in M2.1 under
 * `inquiry-engine-coordinator.ts`.
 */
export async function getInquiryCoordinators(
  supabase: SupabaseClient,
  inquiryId: string,
): Promise<InquiryCoordinatorsResult> {
  if (!inquiryId) return EMPTY;

  const { data, error } = await supabase
    .from("inquiry_coordinators")
    .select(
      "inquiry_id, user_id, role, status, assigned_at, assigned_by, profiles:user_id(display_name)",
    )
    .eq("inquiry_id", inquiryId)
    .order("assigned_at", { ascending: true });

  if (error || !data) return EMPTY;

  const rows = (data as unknown as RawRow[]).map((r) => ({
    inquiry_id: r.inquiry_id,
    user_id: r.user_id,
    role: r.role,
    status: r.status,
    assigned_at: r.assigned_at,
    assigned_by: r.assigned_by,
    display_name: r.profiles?.display_name ?? null,
  }));

  const primary =
    rows.find((r) => r.role === "primary" && r.status === "active") ?? null;
  const secondaries = rows.filter(
    (r) => r.role === "secondary" && r.status === "active",
  );
  const former = rows.filter((r) => r.status === "former_coordinator");

  return { primary, secondaries, former };
}
