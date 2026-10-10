/**
 * Resolve which talent the booking assistant should bill + ground against.
 *
 * Guest early drafts deliberately omit inquiry_participants (lineup lives on
 * interpreted_query.talent.selected_ids). Prefer a participant row when present;
 * otherwise take the first selected_ids entry.
 */

export function resolveBookingAssistantTalentId(input: {
  fromParticipants: string | null | undefined;
  selectedIds: readonly string[] | null | undefined;
}): string | null {
  const fromPart =
    typeof input.fromParticipants === "string" && input.fromParticipants.trim()
      ? input.fromParticipants.trim()
      : null;
  if (fromPart) return fromPart;
  const ids = input.selectedIds ?? [];
  for (const id of ids) {
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return null;
}
