/**
 * Detect PostgREST / Postgres errors that mean the search RPC is not deployed yet
 * (or not exposed), so we can fall back to legacy client-side search once.
 *
 * Remove fallback paths once `directory_search_public_talent_ids` is guaranteed in prod.
 */

/** Force legacy search without calling RPC (local debugging / emergency). */
export function directorySearchForceLegacy(): boolean {
  return process.env.DIRECTORY_SEARCH_FORCE_LEGACY === "1";
}

export function isDirectorySearchRpcUnavailableError(err: {
  code?: string;
  message?: string;
  details?: string;
}): boolean {
  const code = err.code ?? "";
  const msg = (err.message ?? "").toLowerCase();
  const details = (err.details ?? "").toLowerCase();

  if (code === "42883") return true;
  if (code === "PGRST202") return true;

  if (msg.includes("could not find the function")) return true;
  if (msg.includes("function") && msg.includes("does not exist")) return true;
  if (msg.includes("schema cache") && msg.includes("function")) return true;

  if (details.includes("directory_search_public_talent_ids")) return true;

  return false;
}
