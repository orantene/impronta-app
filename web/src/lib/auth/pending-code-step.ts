/**
 * TUL-766: the emailed-code step must survive a reload. Before, reloading
 * `/register?as=client` after "send code" dropped the visitor on an empty form
 * with no way to type the code they had just received.
 *
 * The step is remembered in sessionStorage (this tab only, never the URL, so
 * the address is not leaked into history or referrers) for the same page,
 * for 15 minutes, which is the code's own validity window. Pure: the storage
 * and clock are injected.
 */
export const PENDING_CODE_KEY = "tulala.auth.pendingCode";
export const PENDING_CODE_TTL_MS = 15 * 60 * 1000;

export type PendingCodeStep = { email: string; name?: string };

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function savePendingCodeStep(
  store: Store | null,
  input: { email: string; name?: string; path: string; now: number },
): void {
  if (!store) return;
  try {
    store.setItem(
      PENDING_CODE_KEY,
      JSON.stringify({ email: input.email, name: input.name || undefined, path: input.path, at: input.now }),
    );
  } catch {
    // Storage full or blocked: the step simply will not survive a reload.
  }
}

export function readPendingCodeStep(store: Store | null, input: { path: string; now: number }): PendingCodeStep | null {
  if (!store) return null;
  try {
    const raw = store.getItem(PENDING_CODE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { email?: unknown; name?: unknown; path?: unknown; at?: unknown };
    if (typeof v.email !== "string" || !v.email.includes("@")) return null;
    if (v.path !== input.path) return null;
    if (typeof v.at !== "number" || input.now - v.at > PENDING_CODE_TTL_MS || v.at > input.now) {
      store.removeItem(PENDING_CODE_KEY);
      return null;
    }
    return { email: v.email, ...(typeof v.name === "string" && v.name ? { name: v.name } : {}) };
  } catch {
    return null;
  }
}

export function clearPendingCodeStep(store: Store | null): void {
  try {
    store?.removeItem(PENDING_CODE_KEY);
  } catch {
    // ignore
  }
}
