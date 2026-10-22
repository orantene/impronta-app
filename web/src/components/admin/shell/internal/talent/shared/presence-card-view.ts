import type { TalentPresenceStats } from "@/lib/analytics/talent-presence-stats";

export type PresenceCardView = "stats" | "unavailable" | "locked";

/**
 * Which face the card shows. It never returns "hidden": the card must not
 * vanish silently (TUL-582). Pro/Max with data -> stats; Pro/Max whose load
 * failed or came back empty -> "unavailable" (empty state); Free or an
 * unknown tier -> "locked" (Pro and Max note).
 */
export function presenceCardView(
  tier: string | null | undefined,
  stats: TalentPresenceStats | undefined | null,
): PresenceCardView {
  if (tier !== "pro" && tier !== "max") return "locked";
  return stats ? "stats" : "unavailable";
}
