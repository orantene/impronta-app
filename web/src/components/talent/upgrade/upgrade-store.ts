/**
 * TUL-829 · `openUpgrade({ feature, from })` and the tiny store behind it.
 *
 * A module store, not a React context, so any paywall can open the modal
 * whether it renders inside the dashboard shell or on a bare route such as
 * the full-screen builder. Hosts (`<TalentUpgradeModalHost />`) claim a slot
 * on mount; only the first live host renders, so mounting one in the shell
 * and one in the builder never shows two modals.
 *
 * `showUpgradeModal` returns false when no host is mounted. Callers use that to
 * fall straight through to `startUpgradeCheckout`, so a paywall is never a
 * dead end even where the modal cannot render.
 */

import type { UpgradeRequest } from "./upgrade-modal-model";

export type UpgradeSnapshot = {
  request: UpgradeRequest | null;
  /** Id of the host allowed to render, or null when none is mounted. */
  leader: number | null;
};

let snapshot: UpgradeSnapshot = { request: null, leader: null };
let nextHostId = 1;
const hosts: number[] = [];
const listeners = new Set<() => void>();

function emit(next: UpgradeSnapshot) {
  snapshot = next;
  for (const l of listeners) l();
}

export function subscribeUpgrade(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getUpgradeSnapshot(): UpgradeSnapshot {
  return snapshot;
}

/** Registers a mounted host. Returns its id and the release for unmount. */
export function claimUpgradeHost(): { id: number; release: () => void } {
  const id = nextHostId++;
  hosts.push(id);
  emit({ ...snapshot, leader: hosts[0] ?? null });
  const release = () => {
    const i = hosts.indexOf(id);
    if (i < 0) return;
    hosts.splice(i, 1);
    const leader = hosts[0] ?? null;
    emit({ request: leader === null ? null : snapshot.request, leader });
  };
  return { id, release };
}

/** Opens the upgrade modal. False when no host is mounted to show it. */
export function showUpgradeModal(request: UpgradeRequest): boolean {
  if (snapshot.leader === null) return false;
  emit({ ...snapshot, request });
  return true;
}

export function closeUpgrade(): void {
  if (snapshot.request === null) return;
  emit({ ...snapshot, request: null });
}
