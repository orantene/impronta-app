"use client";

/**
 * Client in-chat talent picker (feature 2.10) — the Lineup-tab UI.
 *
 * Renders a "Suggest talent" button that opens an inline dropdown of the
 * agency's visible roster (minus talent already on the lineup). Clicking "+ Add"
 * calls clientAddTalentToInquiryAction and, on success, triggers a refetch via
 * onAdded. Only mounted when the inquiry is in a mutable phase (the parent
 * gates this) — the server action re-validates everything.
 */

import { useMemo, useState, useTransition } from "react";
import { clientAddTalentToInquiryAction } from "../_actions/client-add-talent-actions";

export type LineupRosterOption = { id: string; name: string; primaryTypeLabel?: string; city?: string };

export function LineupAddTalentPicker({
  tenantSlug,
  inquiryId,
  roster,
  excludeIds,
  onAdded,
}: {
  tenantSlug: string;
  inquiryId: string;
  roster: LineupRosterOption[];
  excludeIds: string[];
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const options = useMemo(() => {
    const taken = new Set(excludeIds);
    return roster.filter((r) => !taken.has(r.id));
  }, [roster, excludeIds]);

  if (roster.length === 0) return null;

  const handleAdd = (talentId: string) => {
    setError(null);
    setPendingId(talentId);
    startTransition(async () => {
      const res = await clientAddTalentToInquiryAction(tenantSlug, inquiryId, talentId);
      setPendingId(null);
      if (res.ok) {
        setOpen(false);
        onAdded();
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div style={{ position: "relative", marginTop: 4 }}>
      <button
        type="button"
        onClick={() => { setError(null); setOpen((v) => !v); }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 12px",
          borderRadius: 8,
          border: "1px solid rgba(15,79,62,0.22)",
          background: "rgba(15,79,62,0.04)",
          color: "#0F4F3E",
          fontSize: 12.5,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> Suggest talent
      </button>

      {open ? (
        <div
          style={{
            marginTop: 8,
            borderRadius: 10,
            border: "1px solid rgba(11,11,13,0.12)",
            background: "#fff",
            boxShadow: "0 8px 24px rgba(11,11,13,0.12)",
            overflow: "hidden",
            maxHeight: 280,
            overflowY: "auto",
          }}
        >
          {options.length === 0 ? (
            <div style={{ padding: "12px 14px", fontSize: 12.5, color: "rgba(11,11,13,0.55)" }}>
              Everyone on the roster is already on this lineup.
            </div>
          ) : (
            options.map((r) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 12px",
                  borderBottom: "1px solid rgba(11,11,13,0.05)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0B0B0D", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.name}
                  </div>
                  {r.primaryTypeLabel ? (
                    <div style={{ fontSize: 11, color: "rgba(11,11,13,0.5)", marginTop: 1 }}>{r.primaryTypeLabel}</div>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={busy && pendingId === r.id}
                  onClick={() => handleAdd(r.id)}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 7,
                    border: "1px solid rgba(15,79,62,0.25)",
                    background: "#0F4F3E",
                    color: "#fff",
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: busy ? "default" : "pointer",
                    opacity: busy && pendingId === r.id ? 0.6 : 1,
                    whiteSpace: "nowrap",
                  }}
                >
                  {busy && pendingId === r.id ? "Adding…" : "+ Add"}
                </button>
              </div>
            ))
          )}
        </div>
      ) : null}

      {error ? (
        <div style={{ marginTop: 6, fontSize: 12, color: "#991B1B" }}>{error}</div>
      ) : null}
    </div>
  );
}
