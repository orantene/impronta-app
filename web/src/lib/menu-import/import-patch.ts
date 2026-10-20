/**
 * TUL-1331: what a menu import writes for a NEW dish versus an EXISTING one.
 * Only new rows start as draft. An update must leave `status` alone, or a
 * re-import silently unpublishes every live dish on the site.
 */

export function insertPatch<T extends { status: string }>(patch: T): T {
  return { ...patch, status: "draft" };
}

export function updatePatch<T extends { status: string }>(patch: T): Omit<T, "status"> {
  const { status: _status, ...rest } = patch;
  void _status;
  return rest;
}
