"use client";

import { useEffect, useState } from "react";

import { useAdminShell } from "@/components/admin/shell/internal/state";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { getPromoAttention } from "@/lib/promos/actions";
import { promoCopy } from "@/lib/promos/copy/talent";
import { TagIcon } from "./ui";

/**
 * Header tag icon (D1) -> opens the promos drawer (shell drawer id "promos"), with a dot when a promo is sold out,
 * ending soon, or a suggestion waits. One light read on mount; a failure just
 * hides the dot.
 */
export function PromosHeaderButton({ size = "md" }: { size?: "sm" | "md" }) {
  const copy = promoCopy(useDashboardLocale());
  const { openDrawer } = useAdminShell();
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
    <button
      type="button"
      onClick={() => openDrawer("promos")}
      data-tulala-promos-link
      title={copy.t("header.label")}
      aria-label={attention ? copy.t("header.aria_attention") : copy.t("header.aria")}
      // The visible box matches its neighbours; the pseudo-element grows the hit area to 44px.
      className={`relative inline-flex ${box} shrink-0 items-center justify-center rounded-[10px] text-admin-ink after:absolute after:left-1/2 after:top-1/2 after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']`}
    >
      <TagIcon size={18} />
      {attention ? (
        <span aria-hidden className="absolute right-[6px] top-[6px] h-[8px] w-[8px] rounded-full bg-rose-500 ring-2 ring-white" />
      ) : null}
    </button>
  );
}
