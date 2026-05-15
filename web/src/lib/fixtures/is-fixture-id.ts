/**
 * is-fixture-id.ts — centralized predicate for mock / demo / fixture IDs.
 *
 * The admin shell mixes real DB-backed inquiries with hardcoded fixture
 * inquiries used for empty-state demos (defined in state.tsx as
 * `RICH_INQUIRIES` with IDs like RI-201, RI-202, ...).
 *
 * Real DB-backed inquiries are UUIDs. Anything that isn't a UUID and
 * matches our fixture prefixes is a demo row. We use this in two ways:
 *
 *   1. Skip server-side writes — fixtures don't exist in the DB, so any
 *      action triggered on a fixture should fall through to a toast
 *      instead of hitting `revalidatePath` or an engine call.
 *   2. Render a Demo badge — visual flag so the user knows the row
 *      isn't real data they can act on for production work.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns true when `id` is a hardcoded fixture / mock inquiry ID. The
 * canonical pattern is `RI-NNN` (rich inquiries) but we also defensively
 * match anything that isn't a UUID-shaped string.
 */
export function isFixtureInquiryId(id: string | null | undefined): boolean {
  if (!id) return false;
  if (UUID_REGEX.test(id)) return false;
  // Anything non-UUID is treated as a fixture. This covers RI-NNN as
  // well as any future ad-hoc demo data that doesn't follow the prefix.
  return true;
}

/** Inverse — does this look like a real DB-backed inquiry? */
export function isRealInquiryId(id: string | null | undefined): boolean {
  return !!id && UUID_REGEX.test(id);
}
