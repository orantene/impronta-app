/**
 * An UPDATE must never move a row between tenants. `upsertTalentOffering` stamps
 * the editing talent's own workspace as `tenant_id`; on insert that is right, but
 * on update it silently re-homed an agency-tenant row onto the talent's
 * workspace the first time the talent edited it (Services Phase 0 item 4).
 * Insert keeps the stamp; update keeps whatever tenant the row already has.
 */
export function patchForSave<T extends { tenant_id?: unknown }>(
  patch: T,
  isUpdate: boolean,
): Omit<T, "tenant_id"> | T {
  if (!isUpdate) return patch;
  const { tenant_id: _keep, ...rest } = patch;
  return rest;
}
