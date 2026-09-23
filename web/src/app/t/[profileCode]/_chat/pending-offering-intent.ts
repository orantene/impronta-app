"use client";

/**
 * The signed service choice waiting for the guest's first message.
 * Ids and prices never live here. The dock and the service sheet share this
 * module because they are separate trees on the same page.
 */

let token: string | null = null;

export function setPendingOfferingIntent(next: string | null): void {
  token = next && next.length > 0 ? next : null;
}

export function peekPendingOfferingIntent(): string | null {
  return token;
}

export function clearPendingOfferingIntent(): void {
  token = null;
}
