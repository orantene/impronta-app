/**
 * Inbound request sanitization for `proxy.ts` — strip client-forged
 * host-context / guest headers so only proxy-written values reach
 * `/_talent-site` (mirrors actor-header hygiene in supabase middleware).
 * Extracted to keep `proxy.ts` under the 800-line max-lines budget.
 */

import type { NextRequest } from "next/server";

import { GUEST_HEADER_NAME } from "@/lib/guest-cookie";
import {
  HOST_CONTEXT_HEADER,
  HOST_NAME_HEADER,
  HOST_TALENT_PROFILE_HEADER,
  HOST_TENANT_SLUG_HEADER,
} from "@/lib/saas/host-context";
import { PUBLIC_PATH_PREFIX_HEADER, TENANT_HEADER_NAME } from "@/lib/saas/scope";

/** `x-impronta-guest` is never trusted from the client — only re-bound from a verified cookie. */
export const HOST_CONTEXT_HEADERS_TO_STRIP = [
  HOST_CONTEXT_HEADER,
  HOST_TALENT_PROFILE_HEADER,
  HOST_NAME_HEADER,
  HOST_TENANT_SLUG_HEADER,
  TENANT_HEADER_NAME,
  PUBLIC_PATH_PREFIX_HEADER,
  GUEST_HEADER_NAME,
] as const;

export function stripInboundHostContextHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  for (const h of HOST_CONTEXT_HEADERS_TO_STRIP) headers.delete(h);
  return headers;
}

export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "unknown";
}
