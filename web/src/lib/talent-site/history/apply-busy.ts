"use client";

/**
 * "Publish is disabled while an apply runs" (theme releases Phase 2).
 *
 * Every design / look apply in the talent UI runs through `runThemeApply`;
 * every talent Publish button reads `useThemeApplyBusy()`. Same tab via a tiny
 * store, other tabs of the same browser via a BroadcastChannel (a remote busy
 * flag expires on its own so a closed tab can never lock Publish). The server
 * side is the atomic apply RPC: a publish lands before or after an apply,
 * never in between.
 */
import { useSyncExternalStore } from "react";

const CHANNEL = "tulala-theme-apply";
const REMOTE_TTL_MS = 30_000;

let local = 0;
let remoteUntil = 0;
const listeners = new Set<() => void>();
let channel: BroadcastChannel | null = null;

function emit(): void {
  for (const l of listeners) l();
}

function ensureChannel(): BroadcastChannel | null {
  if (channel || typeof window === "undefined" || typeof BroadcastChannel === "undefined") return channel;
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (ev: MessageEvent<{ busy?: boolean }>) => {
      remoteUntil = ev.data?.busy ? Date.now() + REMOTE_TTL_MS : 0;
      emit();
      if (ev.data?.busy) setTimeout(emit, REMOTE_TTL_MS + 50);
    };
  } catch {
    channel = null;
  }
  return channel;
}

export function isThemeApplyBusy(): boolean {
  return local > 0 || remoteUntil > Date.now();
}

export async function runThemeApply<T>(fn: () => Promise<T>): Promise<T> {
  local += 1;
  emit();
  ensureChannel()?.postMessage({ busy: true });
  try {
    return await fn();
  } finally {
    local = Math.max(0, local - 1);
    emit();
    if (local === 0) ensureChannel()?.postMessage({ busy: false });
  }
}

function subscribe(listener: () => void): () => void {
  ensureChannel();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useThemeApplyBusy(): boolean {
  return useSyncExternalStore(subscribe, isThemeApplyBusy, () => false);
}
