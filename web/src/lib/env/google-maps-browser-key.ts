/**
 * Google Maps / Places keys are often pasted in .env with quotes; strip them.
 * Used for the homepage Maps JavaScript API key (server + optional client fallback).
 */
export function normalizeGoogleApiKeyInput(raw: string | undefined | null): string | undefined {
  const s = raw?.trim();
  if (!s) return undefined;
  const unquoted = s.replace(/^['"]+|['"]+$/g, "").trim();
  return unquoted.length > 0 ? unquoted : undefined;
}

/** Key sent to the browser for Maps JS: public var first, else server Places key. */
export function readGoogleMapsBrowserKey(): string | undefined {
  return (
    normalizeGoogleApiKeyInput(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) ??
    normalizeGoogleApiKeyInput(process.env.GOOGLE_PLACES_API_KEY)
  );
}
