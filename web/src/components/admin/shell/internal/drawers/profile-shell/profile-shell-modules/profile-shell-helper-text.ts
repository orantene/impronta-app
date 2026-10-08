/** Helper line under a type-specific field group heading (extracted from the drawer). */
export function detailsGroupHelperText(label: string): string {
  const normalized = label.toLowerCase();

  if (normalized.includes("physical") || normalized.includes("casting")) {
    return "Casting facts, measurements, and profile details used for matching.";
  }
  if (normalized.includes("equipment") || normalized.includes("tools")) {
    return "Gear, tools, and setup details clients need before booking.";
  }
  if (normalized.includes("operational")) {
    return "Practical requirements that keep bookings clear and predictable.";
  }
  if (normalized.includes("music")) {
    return "Genres, set format, and music-specific booking details.";
  }
  if (normalized.includes("performer")) {
    return "Act format, performance style, and production needs.";
  }
  if (normalized.includes("singer")) {
    return "Vocal, repertoire, and live performance details.";
  }

  return "Type-specific profile fields for this category.";
}
