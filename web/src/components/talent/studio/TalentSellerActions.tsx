"use client";

import { useState } from "react";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";

const ACTIONS = [
  {
    id: "quote",
    title: "Send a quote",
    body: "Pick services from your catalogue. Prices stay in your currency. The quote holds 24 hours.",
  },
  { id: "time", title: "Propose a time", body: "Checks your calendar first." },
  { id: "deposit", title: "Request a deposit", body: "Secure link. Card or transfer." },
  { id: "file", title: "Send a photo or file", body: "The client sees it." },
  { id: "note", title: "Add a private note", body: "Only you." },
  { id: "client", title: "Save client details", body: "Name, phone, preferences." },
] as const;

export type TalentSellerActionId = (typeof ACTIONS)[number]["id"];

export function TalentSellerActions({
  onPick,
  disabledReason,
}: {
  /** Opens the matching Messages v5 sheet / composer for the active thread. */
  onPick?: (id: TalentSellerActionId) => void;
  /** Shown when Actions cannot run (no open conversation). */
  disabledReason?: string | null;
}) {
  const copy = useDashboardText();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative font-admin-body">
      <button
        type="button"
        className="rounded-full border border-admin-border-soft bg-white px-3 py-1.5 text-[13px] font-semibold"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        + {copy.t("Actions")}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-2xl border border-admin-border-soft bg-white p-2 shadow-admin-rest">
          {disabledReason ? (
            <p className="px-3 py-2 text-[12px] text-admin-ink-muted">{copy.t(disabledReason)}</p>
          ) : null}
          {ACTIONS.map((row) => (
            <button
              key={row.id}
              type="button"
              disabled={!onPick || Boolean(disabledReason)}
              className="block w-full rounded-xl px-3 py-2 text-left disabled:opacity-50"
              onClick={() => {
                onPick?.(row.id);
                setOpen(false);
              }}
            >
              <p className="text-[14px] font-semibold text-admin-ink">{copy.t(row.title)}</p>
              <p className="text-[12px] text-admin-ink-muted">{copy.t(row.body)}</p>
            </button>
          ))}
          <p className="px-3 py-2 text-[12px] text-admin-ink-muted">
            {copy.t("Private notes never reach the client. Quotes, times and payment requests do.")}
          </p>
        </div>
      )}
    </div>
  );
}
