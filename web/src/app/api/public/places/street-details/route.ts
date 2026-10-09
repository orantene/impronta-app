/**
 * POST /api/public/places/street-details   { placeId, sessionToken }
 *
 * Companion to street-suggest: the formatted address for the chosen suggestion,
 * sent with the SAME session token so Google bills one session. Same flag, same
 * limiter, same fail-closed rules. Returns only {placeId, formattedAddress}.
 */

import { handleStreetDetails } from "@/lib/places/street-suggest-handler";
import {
  readStreetRouteInput,
  toStreetResponse,
} from "@/lib/places/street-suggest-route-adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return toStreetResponse(await handleStreetDetails(await readStreetRouteInput(request)));
}
