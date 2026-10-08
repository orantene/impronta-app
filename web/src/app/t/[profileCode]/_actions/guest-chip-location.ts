
/**
 * Format a city + locationStatus into the same string that
 * formatEventLocation() in inquiry-intent.ts produces (venue·city).
 * We keep it simple here: just the city for MVP chip-level granularity;
 * the InquiryDrawer handles the full venue/address format.
 */
export function formatChipLocation(city: string | null | undefined, status: string | undefined): string | null {
  const trimmedCity = city?.trim() ?? null;
  if (!trimmedCity) {
    if (status === "online") return "Online";
    return null;
  }
  return trimmedCity;
}

