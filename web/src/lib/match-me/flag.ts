/**
 * TUL-1464: "Match me with a professional" rollout flag. Pure.
 *
 * Off unless exactly "true". The feature needs the held migration
 * 20261231421100 (match_requests / match_request_recipients); until that is
 * applied every submission would error, so it ships dark. Off means the client
 * Match tab, the professional's "Jobs for you" screen and both actions are gone
 * (the actions refuse with reason "off"). No NODE_ENV branch and no dev default.
 */
export const MATCH_ME_FLAG = "MATCH_ME_ENABLED";

export function matchMeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env[MATCH_ME_FLAG] === "true";
}
