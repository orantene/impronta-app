/**
 * Maps a database failure to a typed promo action error. Pure, so it can be
 * tested without a server (actions.ts is a "use server" file and may only
 * export async functions).
 */
export type PromoActionError =
  | "not_allowed"
  | "not_found"
  | "invalid"
  | "code_taken"
  | "not_available_yet"
  | "unavailable";

export type DbErrorLike = { code?: string | null; message?: string | null } | null | undefined;

export function reasonFromDbError(error: DbErrorLike): PromoActionError {
  if (!error) return "unavailable";
  if (error.code === "23505") return "code_taken";
  if (error.code === "23514") return "invalid";
  const msg = typeof error.message === "string" ? error.message : "";
  if (msg.includes("promos_hub_tenant_blocked") || msg.includes("promos_hub_owner")) return "not_available_yet";
  return "unavailable";
}

/** A short id the talent can read to support; the same id is logged server side. */
export function newErrorRef(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

export function failFrom(error: DbErrorLike, ref?: string): { ok: false; error: PromoActionError; ref?: string } {
  const reason = reasonFromDbError(error);
  return reason === "unavailable" && ref ? { ok: false, error: reason, ref } : { ok: false, error: reason };
}

/** Copy key suffix for each reason; one distinct key per reason. */
export const ERROR_COPY_KEY = {
  not_allowed: "err.not_allowed",
  not_found: "err.not_found",
  invalid: "err.invalid",
  code_taken: "err.code_taken",
  not_available_yet: "err.not_available_yet",
  unavailable: "err.unavailable",
} as const satisfies Record<PromoActionError, `err.${string}`>;
