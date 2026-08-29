"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/use-t";
import { proposeReservationTimeAction } from "@/lib/server-actions/reservation-propose";

export function ProposeTimeButton({
  tenantSlug,
  inquiryId,
  timezone = "UTC",
}: {
  tenantSlug: string;
  inquiryId: string;
  timezone?: string;
}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          height: 32,
          padding: "0 10px",
          borderRadius: 6,
          border: "1px solid rgba(24,24,27,0.12)",
          background: "#fff",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {t("dashboard.adminThread.proposeTime")}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label={t("dashboard.adminThread.proposeTime")}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(11,11,13,0.35)",
            zIndex: 80,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              startTransition(async () => {
                const starts = startsAt ? new Date(startsAt).toISOString() : "";
                const ends = endsAt ? new Date(endsAt).toISOString() : "";
                const r = await proposeReservationTimeAction({
                  tenantSlug,
                  inquiryId,
                  startsAt: starts,
                  endsAt: ends,
                  timezone,
                });
                if (!r.ok) {
                  setError(r.error);
                  return;
                }
                setOpen(false);
                router.refresh();
              });
            }}
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 20,
              width: "min(420px, 100%)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 650 }}>{t("dashboard.adminThread.proposeTime")}</div>
            <p style={{ margin: 0, fontSize: 12, color: "rgba(11,11,13,0.55)" }}>
              {t("dashboard.adminThread.proposeTimeHint")}
            </p>
            <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
              {t("dashboard.adminThread.proposeStarts")}
              <input
                type="datetime-local"
                required
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </label>
            <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
              {t("dashboard.adminThread.proposeEnds")}
              <input
                type="datetime-local"
                required
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </label>
            {error ? (
              <p style={{ margin: 0, fontSize: 12, color: "#A33A3A" }}>{error}</p>
            ) : null}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setOpen(false)} disabled={pending}>
                {t("dashboard.adminThread.proposeTimeCancel")}
              </button>
              <button type="submit" disabled={pending}>
                {t("dashboard.adminThread.proposeTimeSubmit")}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
