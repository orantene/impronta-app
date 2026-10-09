/**
 * POST /api/public/places/street-suggest   { query, sessionToken, country? }
 *
 * PUBLIC, unauthenticated, rate-limited street-address suggestions for the
 * booking sheet. OFF unless PUBLIC_STREET_AUTOCOMPLETE_ENABLED=1 (then 404
 * `{ok:false, code:"disabled"}` and no Google call). POST so the typed text never
 * lands in a URL or a request log. Returns only {placeId, mainText, secondaryText}.
 */

import { handleStreetSuggest } from "@/lib/places/street-suggest-handler";
import {
  readStreetRouteInput,
  toStreetResponse,
} from "@/lib/places/street-suggest-route-adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return toStreetResponse(await handleStreetSuggest(await readStreetRouteInput(request)));
}
