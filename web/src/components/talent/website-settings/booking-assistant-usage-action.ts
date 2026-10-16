"use server";

import {
  loadTalentBookingAssistantSpendCentsThisMonth,
  loadTalentPlanKey,
} from "@/lib/ai/booking-assistant/turn.server";
import { bookingAssistantUsage, type BookingAssistantUsage } from "@/lib/ai/booking-assistant/usage-format";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";

/** This month's booking-assistant spend for the signed-in talent. Read-only; null when unavailable. */
export async function loadBookingAssistantUsageAction(): Promise<BookingAssistantUsage | null> {
  const scope = await requireTalentSelf();
  if (!scope.ok) return null;
  const id = scope.talentProfile.id;
  const [spent, planKey] = await Promise.all([
    loadTalentBookingAssistantSpendCentsThisMonth(id),
    loadTalentPlanKey(id),
  ]);
  return bookingAssistantUsage(spent, planKey);
}
