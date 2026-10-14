/**
 * TUL-788: signing out in one tab must sign out the others without a reload.
 * The sign-out writes a timestamp under this key; every other tab of the same
 * origin gets a `storage` event and reloads (the reload then sees no session).
 * Pure helpers; the browser wiring lives in components/auth/cross-tab-sign-out.
 */
export const SIGNED_OUT_KEY = "tulala.auth.signedOutAt";

export function shouldReloadForSignOut(e: { key: string | null; newValue: string | null }): boolean {
  return e.key === SIGNED_OUT_KEY && Boolean(e.newValue);
}

export function announceSignOut(store: Pick<Storage, "setItem"> | null, now: number): void {
  try {
    store?.setItem(SIGNED_OUT_KEY, String(now));
  } catch {
    // Blocked storage: other tabs catch up on their next navigation.
  }
}
