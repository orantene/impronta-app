/**
 * TUL-1463: what the save button does with the server's answer. Pure and tiny so the
 * client bundle does not pull the offering readers in.
 *
 *  - ok            the save (or unsave) stuck;
 *  - sign_in       a guest: show the sign-in prompt (the server wrote nothing);
 *  - clients_only  a talent or staff account: saving services is for clients;
 *  - error         anything else (network, unavailable, not found): revert and say so.
 */
export type SaveAnswer = { ok: true; saved: boolean } | { ok: false; reason: string } | null | undefined;

export type SaveOutcome = "ok" | "sign_in" | "clients_only" | "error";

export function guestSaveOutcome(res: SaveAnswer): SaveOutcome {
  if (!res) return "error";
  if (res.ok) return "ok";
  if (res.reason === "sign_in") return "sign_in";
  if (res.reason === "not_client") return "clients_only";
  return "error";
}
