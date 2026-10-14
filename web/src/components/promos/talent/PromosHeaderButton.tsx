"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { getPromoAttention } from "@/lib/promos/actions";
import { promoCopy } from "@/lib/promos/copy/talent";
import { TagIcon } from "./ui";

/**
 * Header tag icon (D1) -> /talent/promos, with a dot when a promo is sold out,
 * ending soon, or a suggestion waits. One light read on mount; a failure just
 * hides the dot.
 */
export function PromosHeaderButton({ size = "md" }: { size?: "sm" | "md" }) {
  const copy = promoCopy(useDashboardLocale());
  const [attention, setAttention] = useState(false);

  useEffect(() => {
    let alive = true;
    void getPromoAttention()
      .then((r) => {
        if (alive) setAttention(r.attention);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const box = size === "sm" ? "h-[34px] w-[34px]" : "h-[36px] w-[36px]";
  return (
    <Link
      href="/talent/promos"
      data-tulala-promos-link
      aria-label={attention ? copy.t("header.aria_attention") : copy.t("header.aria")}
      className={`relative inline-flex ${box} shrink-0 items-center justify-center rounded-[10px] text-admin-ink`}
    >
      <TagIcon size={18} />
      {attention ? (
        <span aria-hidden className="absolute right-[6px] top-[6px] h-[8px] w-[8px] rounded-full bg-rose-500 ring-2 ring-white" />
      ) : null}
    </Link>
  );
}
