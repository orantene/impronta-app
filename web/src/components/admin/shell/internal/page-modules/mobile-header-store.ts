"use client";

/**
 * The phone's detail header, handed from a record page to the shell.
 *
 * The MW boards draw two top bars at 390px: the workspace bar (MW00: the
 * workspace pill, the role chip, search, the bell) on list pages, and a back
 * header (MW03, MW06, MW10, MW14, MW18, MW22: a chevron, the record's title
 * and a one-line subtitle) on record pages. The identity bar owns the top of
 * the screen, so a record page PUBLISHES its header here and the identity bar
 * draws it while the page is mounted; leaving the page clears it. Same shape
 * as `overview-snapshot-store.ts`.
 *
 * `null` means "no record open": the identity bar draws the workspace bar.
 */

import { useLayoutEffect, useSyncExternalStore } from "react";

export type MobileDetailHeader = {
  readonly title: string;
  readonly subtitle?: string;
  /** Where the chevron goes. Absent = the browser's history. */
  readonly backHref?: string;
};

let current: MobileDetailHeader | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function read(): MobileDetailHeader | null {
  return current;
}

function readServer(): MobileDetailHeader | null {
  return null;
}

export function publishMobileDetailHeader(header: MobileDetailHeader | null): void {
  if (current === header) return;
  current = header;
  for (const listener of listeners) listener();
}

export function useMobileDetailHeader(): MobileDetailHeader | null {
  return useSyncExternalStore(subscribe, read, readServer);
}

/**
 * Rendered by a record page (server or client); publishes before paint and
 * clears on leave. Draws nothing itself: the identity bar draws the header.
 */
export function MobileDetailHeaderSyncer({ title, subtitle, backHref }: MobileDetailHeader) {
  useLayoutEffect(() => {
    publishMobileDetailHeader({ title, subtitle, backHref });
    return () => publishMobileDetailHeader(null);
  }, [title, subtitle, backHref]);
  return null;
}
