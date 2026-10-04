"use client";

/**
 * Pending look image: a PNG (data URL) an on-page app (Nail Studio Save look)
 * hands to the front-door chat through `tulala:ask-question` (`detail.imageDataUrl`).
 * Stashed until the guest's inquiry exists, then uploaded as an inquiry
 * attachment (moodboard). Module scope — app iframe and chat are separate trees.
 */

/** Cap so a stray postMessage cannot pin a multi‑MB string in memory. */
export const PENDING_LOOK_IMAGE_MAX_CHARS = 1_800_000;

let pending: string | null = null;

export function setPendingLookImage(next: string | null | undefined): void {
  if (typeof next !== "string") {
    pending = null;
    return;
  }
  const trimmed = next.trim();
  if (!trimmed.startsWith("data:image/") || trimmed.length > PENDING_LOOK_IMAGE_MAX_CHARS) {
    pending = null;
    return;
  }
  // SVG data URLs are refused (same XSS shape as inquiry-files mime gate).
  if (trimmed.startsWith("data:image/svg+xml")) {
    pending = null;
    return;
  }
  pending = trimmed;
}

export function peekPendingLookImage(): string | null {
  return pending;
}

export function takePendingLookImage(): string | null {
  const cur = pending;
  pending = null;
  return cur;
}

export function clearPendingLookImage(): void {
  pending = null;
}

/** Convert a data URL into a File for the guest inquiry attachment uploader. */
export function lookImageDataUrlToFile(dataUrl: string, filename = "look.png"): File | null {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const mime = m[1]!.toLowerCase();
  if (mime === "image/svg+xml") return null;
  try {
    const bin = atob(m[2]!);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], filename, { type: mime });
  } catch {
    return null;
  }
}
