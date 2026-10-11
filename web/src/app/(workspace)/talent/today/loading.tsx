/**
 * Hoy route page-slot skeleton. The shell (top bar / nav) is already painted
 * by the layout Suspense fallback; this fills only the content area with the
 * same clock-free TodaySkeleton used by dynamic() + hydration (TUL-536).
 */
import { TodaySkeleton } from "@/components/admin/shell/internal/talent/pages/today-skeleton";

export default function TalentTodayLoading() {
  return (
    <div className="mx-auto w-full max-w-[1240px] px-[16px] pb-[96px] pt-[28px] min-[721px]:px-[28px]">
      <TodaySkeleton />
    </div>
  );
}
