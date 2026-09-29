"use client";

import { useEffect, useRef, useState } from "react";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";

import {
  TALENT_SELLER_ACTIONS,
  talentSellerActionBlock,
  type TalentSellerActionId,
} from "./talent-seller-actions-model";

export type { TalentSellerActionId };

/**
 * "+ Actions" (mockup "Messages · Actions menu"): six direct-client verbs in a
 * popover that opens upward from the composer. Wired rows open the matching
 * Messages v5 sheet; rows whose writer does not exist on the talent engine yet
 * stay visible, disabled, with a plain note (see talent-seller-actions-model).
 */
export function TalentSellerActions({
  onPick,
  hasThread,
}: {
  /** Opens the matching Messages v5 sheet / composer for the active thread. */
  onPick?: (id: TalentSellerActionId) => void;
  /** False until a conversation is open. */
  hasThread: boolean;
}) {
  const copy = useDashboardText();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative font-admin-body" data-talent-actions>
      <button
        type="button"
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-admin-border-soft bg-admin-card px-4 text-[13px] font-semibold text-admin-ink md:min-h-[36px]"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        + {copy.t("Actions")}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute bottom-[calc(100%+8px)] left-0 z-30 w-[296px] max-w-[calc(100vw-32px)] overflow-hidden rounded-xl border border-admin-border bg-admin-card shadow-admin-rest"
        >
          {TALENT_SELLER_ACTIONS.map((row, i) => {
            const block = talentSellerActionBlock(row.id, hasThread);
            return (
              <button
                key={row.id}
                type="button"
                role="menuitem"
                data-talent-action={row.id}
                disabled={!onPick || Boolean(block)}
                aria-disabled={!onPick || Boolean(block)}
                className={`block min-h-[44px] w-full px-[13px] py-2.5 text-left disabled:cursor-not-allowed ${i ? "border-t border-admin-border-soft" : ""}`}
                onClick={() => {
                  onPick?.(row.id);
                  setOpen(false);
                }}
              >
                <p className={`text-[13px] font-semibold ${block ? "text-admin-ink-muted" : "text-admin-ink"}`}>{copy.t(row.title)}</p>
                <p className="text-[11.5px] text-admin-ink-muted">{block ? copy.t(block) : copy.t(row.body)}</p>
              </button>
            );
          })}
          <p className="border-t border-admin-border-soft bg-admin-surface-alt px-[13px] py-2.5 text-[11.5px] leading-snug text-admin-ink-muted">
            {copy.t("Private notes never reach the client. Quotes, times and payment requests do.")}
          </p>
        </div>
      )}
    </div>
  );
}
