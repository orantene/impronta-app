/**
 * Phase 5 — preview cookie helpers.
 *
 * Name:   impronta_preview
 * Value:  signed JWT (see ./jwt.ts)
 * Flags:  HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=900 (15 min)
 *
 * Do NOT expose the cookie to client JS. All reads go via middleware or
 * server actions; the UI shows preview state via a server-side check.
 */

export const PREVIEW_COOKIE_NAME = "impronta_preview";
export const PREVIEW_COOKIE_MAX_AGE_SECONDS = 15 * 60;

export interface PreviewCookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax" | "strict";
  path: string;
  maxAge: number;
}

export const PREVIEW_COOKIE_OPTIONS: PreviewCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: PREVIEW_COOKIE_MAX_AGE_SECONDS,
};
