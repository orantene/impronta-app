/** One-line postal address from a venue's discrete address columns; null when none is filled in. */
export function formatVenueAddress(
  v:
    | {
        address_line1?: unknown;
        address_line2?: unknown;
        city?: unknown;
        region?: unknown;
        postal_code?: unknown;
        country_code?: unknown;
      }
    | null
    | undefined,
): string | null {
  if (!v) return null;
  const clean = (x: unknown) => (typeof x === "string" ? x.trim() : "");
  const cityLine = [clean(v.postal_code), clean(v.city)].filter(Boolean).join(" ");
  const parts = [clean(v.address_line1), clean(v.address_line2), cityLine, clean(v.region), clean(v.country_code)].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}
