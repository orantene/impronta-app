"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { decideTalentApplication } from "@/lib/talent/apply-actions";
import type { AgencyApplicationAdminRow } from "@/lib/talent/apply-loaders";

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  cardBg:     "#ffffff",
  surface:    "rgba(11,11,13,0.02)",
  accent:     "#0F4F3E",
  green:      "#2E7D5B",
  amber:      "#B45309",
  rust:       "#C04B23",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

function StatusChip({ status }: { status: AgencyApplicationAdminRow["status"] }) {
  const palette = {
    pending: { bg: "rgba(180,83,9,0.10)", fg: C.amber, label: "Pending" },
    approved: { bg: "rgba(46,125,91,0.10)", fg: C.green, label: "Approved" },
    rejected: { bg: "rgba(192,75,35,0.10)", fg: C.rust, label: "Rejected" },
    withdrawn: { bg: C.surface, fg: C.inkMuted, label: "Withdrawn" },
  }[status];
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 999,
      background: palette.bg, color: palette.fg,
      fontSize: 11, fontWeight: 600, letterSpacing: 0.2,
    }}>{palette.label}</span>
  );
}

export function AdminApplicationsClient({
  applications,
  canDecide,
  showOptInHint,
  tenantSlug,
}: {
  applications: AgencyApplicationAdminRow[];
  canDecide: boolean;
  showOptInHint: boolean;
  tenantSlug: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [decisionFor, setDecisionFor] = useState<{ row: AgencyApplicationAdminRow; decision: "approved" | "rejected" } | null>(null);
  const [note, setNote] = useState("");
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function decide() {
    if (!decisionFor) return;
    const { row, decision } = decisionFor;
    startTransition(async () => {
      const result = await decideTalentApplication(row.kind, row.id, decision, note);
      if (result.ok) {
        setToast({
          kind: "ok",
          text: decision === "approved"
            ? `Approved ${row.talentDisplayName}. Add them to the roster from the Roster tab.`
            : `Rejected ${row.talentDisplayName}.`,
        });
        setDecisionFor(null);
        setNote("");
        router.refresh();
      } else {
        setToast({ kind: "err", text: result.error });
      }
    });
  }

  const pendingRows = applications.filter((a) => a.status === "pending");
  const decidedRows = applications.filter((a) => a.status !== "pending");

  if (applications.length === 0) {
    return (
      <div style={{ fontFamily: FONT }}>
        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, color: C.inkMuted, fontSize: 13 }}>
          No applications yet.
          {showOptInHint && (
            <div style={{ marginTop: 8, color: C.ink, fontSize: 12.5 }}>
              <strong>Tip:</strong> applications are off by default. Flip
              <code style={{ background: C.surface, padding: "1px 5px", borderRadius: 4, fontSize: 11.5, margin: "0 4px" }}>
                agencies.accepts_open_applications = TRUE
              </code>
              for this tenant to start receiving them.
              {tenantSlug && (
                <span style={{ color: C.inkDim }}> (Settings UI for this toggle is a follow-up.)</span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22, fontFamily: FONT }}>
      {toast && (
        <div role="status" style={{
          padding: "10px 14px", borderRadius: 10, fontSize: 13,
          background: toast.kind === "ok" ? "rgba(46,125,91,0.10)" : "rgba(192,75,35,0.10)",
          color: toast.kind === "ok" ? C.green : C.rust,
          border: `1px solid ${toast.kind === "ok" ? "rgba(46,125,91,0.30)" : "rgba(192,75,35,0.30)"}`,
        }}>
          {toast.text}
        </div>
      )}

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.ink }}>
          Pending {pendingRows.length > 0 && <span style={{ color: C.inkDim, fontWeight: 500 }}>· {pendingRows.length}</span>}
        </h2>
        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          {pendingRows.length === 0 ? (
            <div style={{ padding: 16, fontSize: 13, color: C.inkMuted }}>No pending applications.</div>
          ) : pendingRows.map((row, i) => renderRow(row, i, true))}
        </div>
      </section>

      {decidedRows.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.ink }}>Decided</h2>
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            {decidedRows.map((row, i) => renderRow(row, i, false))}
          </div>
        </section>
      )}

      {decisionFor && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed", inset: 0, background: "rgba(11,11,13,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 100,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) { setDecisionFor(null); setNote(""); } }}
        >
          <div style={{ background: "#fff", borderRadius: 14, padding: 24, maxWidth: 480, width: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.ink }}>
              {decisionFor.decision === "approved" ? "Approve" : "Reject"} {decisionFor.row.talentDisplayName}?
            </h3>
            {decisionFor.decision === "approved" && (
              <p style={{ margin: 0, fontSize: 12.5, color: C.inkMuted }}>
                This flips the application status to <strong>approved</strong>. Add
                the talent to your roster from the Roster tab to create the
                roster row with the right contract terms.
              </p>
            )}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder="Optional note to the talent…"
              style={{ fontFamily: FONT, fontSize: 13, padding: 10, border: `1px solid ${C.border}`, borderRadius: 8, resize: "vertical" }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => { setDecisionFor(null); setNote(""); }}
                disabled={pending}
                style={{ padding: "8px 14px", borderRadius: 7, fontSize: 13, background: "transparent", border: `1px solid ${C.border}`, color: C.ink, cursor: "pointer", fontFamily: FONT }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={decide}
                disabled={pending}
                style={{ padding: "8px 14px", borderRadius: 7, fontSize: 13, background: decisionFor.decision === "approved" ? C.green : C.rust, color: "#fff", border: "none", cursor: "pointer", fontFamily: FONT }}
              >
                {pending ? "Saving…" : decisionFor.decision === "approved" ? "Approve" : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function renderRow(row: AgencyApplicationAdminRow, i: number, isPending: boolean) {
    return (
      <div key={row.id} style={{
        display: "flex", flexDirection: "column", gap: 6,
        padding: "12px 14px",
        borderTop: i > 0 ? `1px solid ${C.borderSoft}` : "none",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{row.talentDisplayName}</span>
            {row.talentProfileCode && (
              <span style={{ fontSize: 11, color: C.inkMuted, fontFamily: "ui-monospace, monospace" }}>{row.talentProfileCode}</span>
            )}
            <span style={{ fontSize: 10.5, color: C.inkDim, textTransform: "uppercase", letterSpacing: 0.5 }}>{row.kind}</span>
            <StatusChip status={row.status} />
          </div>
          {isPending && canDecide && (
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                onClick={() => { setDecisionFor({ row, decision: "rejected" }); setNote(""); }}
                disabled={pending}
                style={{ padding: "6px 12px", borderRadius: 7, fontSize: 12, background: "transparent", border: `1px solid ${C.border}`, color: C.rust, cursor: "pointer", fontFamily: FONT }}
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => { setDecisionFor({ row, decision: "approved" }); setNote(""); }}
                disabled={pending}
                style={{ padding: "6px 12px", borderRadius: 7, fontSize: 12, background: C.green, color: "#fff", border: "none", cursor: "pointer", fontFamily: FONT, fontWeight: 600 }}
              >
                Approve
              </button>
            </div>
          )}
        </div>
        {row.message && (
          <div style={{ fontSize: 12.5, color: C.ink, background: C.surface, padding: "8px 10px", borderRadius: 6 }}>
            {row.message}
          </div>
        )}
        {row.decisionNote && (
          <div style={{ fontSize: 12, color: C.inkMuted }}>
            <em>Decision note:</em> {row.decisionNote}
          </div>
        )}
        <div style={{ fontSize: 11, color: C.inkDim }}>
          Submitted {new Date(row.submittedAt).toLocaleDateString("en-GB", { month: "short", day: "numeric" })}
          {row.decidedAt && ` · decided ${new Date(row.decidedAt).toLocaleDateString("en-GB", { month: "short", day: "numeric" })}`}
        </div>
      </div>
    );
  }
}
