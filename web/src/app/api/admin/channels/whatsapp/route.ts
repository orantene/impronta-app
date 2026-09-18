/**
 * GET /api/admin/channels/whatsapp — the WhatsApp connection as the chrome
 * button reads it, over a plain fetch.
 *
 * WHY A ROUTE AND NOT THE SERVER ACTION (D-171). The identity bar's WhatsApp
 * button polled `loadWhatsAppConnection` every 8 s as a SERVER ACTION, from
 * three mounts (desktop bar, phone bar, POS header). Server actions ride the
 * Next.js router's action queue: a navigation dispatched while one is in
 * flight discards it, but the discarded action's completion advances the
 * queue past the still-running navigation, the next queued action posts to
 * and re-renders the OLD address, and its result lands after the navigation's
 * (`app-router-instance.js` `runRemainingActions`). On the counter that read
 * as: switch → Counter, tap Open drawer, and the router snapped back to the
 * Overview at `/admin` with no shift written. A fetch never enters that
 * queue. Same guard as the action; the workspace is the referer's slug or the
 * branded host (`admin-workspace-scope.ts` §3).
 */

import { NextResponse } from "next/server";

import { loadWhatsAppConnection } from "@/lib/channels/pairing-actions";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await loadWhatsAppConnection();
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
