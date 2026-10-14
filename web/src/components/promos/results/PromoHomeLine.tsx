import Link from "next/link";
import type { MonthRollup } from "@/lib/promos/results/compute";
import { homeLineText, type Lang } from "@/lib/promos/results/copy";

/** One line for talent home. Renders nothing when there were no promo bookings this month. */
export function PromoHomeLine(props: { rollup: MonthRollup; currency: string; lang: Lang; href: string }) {
  const text = homeLineText(props.rollup, props.currency, props.lang);
  if (!text) return null;
  return (
    <Link href={props.href} className="block min-h-11 py-3 text-sm text-muted-foreground hover:text-foreground">
      {text}
    </Link>
  );
}
