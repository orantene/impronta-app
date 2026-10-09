import "server-only";

import { NextResponse } from "next/server";
import { resolveStreetClientIp, type StreetHandlerOutput } from "./street-suggest-handler";

/** Shared Request/Response plumbing for the two public street routes. */

export type StreetRouteInput = { body: unknown; ip: string; host: string };

const MAX_BODY_BYTES = 2048;

export async function readStreetRouteInput(request: Request): Promise<StreetRouteInput> {
  let body: unknown = null;
  try {
    const text = await request.text();
    if (text.length <= MAX_BODY_BYTES) body = JSON.parse(text);
  } catch {
    body = null;
  }
  const host = (request.headers.get("host") ?? "").trim().toLowerCase();
  return { body, ip: resolveStreetClientIp(request.headers), host };
}

export function toStreetResponse<B>(out: StreetHandlerOutput<B>): NextResponse {
  return NextResponse.json(out.body, {
    status: out.status,
    headers: { "Cache-Control": "no-store", ...(out.headers ?? {}) },
  });
}
