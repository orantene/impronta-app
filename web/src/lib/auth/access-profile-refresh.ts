/**
 * One-shot cookie that tells Edge middleware to drop the 60 s access-profile
 * memo after onboarding flips `account_status`. The memo lives in the proxy
 * isolate; a server action cannot delete it, so the cookie is the signal.
 */
export const ACCESS_PROFILE_REFRESH_COOKIE = "tulala_access_profile_refresh";
export const ACCESS_PROFILE_REFRESH_VALUE = "1";

export function wantsAccessProfileRefresh(value: string | undefined | null): boolean {
  return value === ACCESS_PROFILE_REFRESH_VALUE;
}
