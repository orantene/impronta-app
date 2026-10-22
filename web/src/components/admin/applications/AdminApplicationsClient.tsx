"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useDashboardLocale } from "@/i18n/use-dashboard-locale";

import { decideTalentApplication } from "@/lib/talent/apply-actions";
import { toggleOpenApplications } from "@/app/(workspace)/[tenantSlug]/admin/roster/applications/actions";
import type { AgencyApplicationAdminRow } from "@/lib/talent/apply-loaders";
import { applicationsCopy, type ApplicationsLang } from "./applications-copy";

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.6)",
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

function StatusChip({ status, lang }: { status: AgencyApplicationAdminRow["status"]; lang: ApplicationsLang }) {
  const copy = applicationsCopy(lang);
  const palette = {
    pending: { bg: "rgba(180,83,9,0.10)", fg: C.amber, label: copy.status.pending },
    approved: { bg: "rgba(46,125,91,0.10)", fg: C.green, label: copy.status.approved },
    rejected: { bg: "rgba(192,75,35,0.10)", fg: C.rust, label: copy.status.rejected },
    withdrawn: { bg: C.surface, fg: C.inkMuted, label: copy.status.withdrawn },
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
  acceptsApplications: initialAccepts,
}: {
  applications: AgencyApplicationAdminRow[];
  canDecide: boolean;
  showOptInHint: boolean;
  tenantSlug: string;
  acceptsApplications: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [togglePending, startToggleTransition] = useTransition();
  const [decisionFor, setDecisionFor] = useState<{ row: AgencyApplicationAdminRow; decision: "approved" | "rejected" } | null>(null);
  const [note, setNote] = useState("");
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string; rosterHref?: string } | null>(null);
  const [accepts, setAccepts] = useState(initialAccepts);
  const lang: ApplicationsLang = useDashboardLocale().toLowerCase().startsWith("es") ? "es" : "en";
  const copy = applicationsCopy(lang);

  function toggleAccepts() {
    const next = !accepts;
    setAccepts(next); // optimistic
    startToggleTransition(async () => {
      const result = await toggleOpenApplications(tenantSlug, next);
      if (!result.ok) {
        setAccepts(!next); // revert
        setToast({ kind: "err", text: result.error });
      }
    });
  }

  function decide() {
    if (!decisionFor) return;
    const { row, decision } = decisionFor;
    startTransition(async () => {
      const result = await decideTalentApplication(row.kind, row.id, decision, note);
      if (result.ok) {
        const rosterHref = decision === "approved"
          ? `/${tenantSlug}/admin/roster`
          : undefined;
        setToast({
          kind: "ok",
          text: decision === "approved"
            ? copy.approvedToast(row.talentDisplayName)
            : copy.rejectedToast(row.talentDisplayName),
          rosterHref,
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22, fontFamily: FONT }}>
      {/* Open-applications toggle */}
      {canDecide && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 16, padding: "14px 16px",
          background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12,
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{copy.acceptTitle}</span>
            <span style={{ fontSize: 12, color: C.inkMuted }}>
              {accepts ? copy.acceptOn : copy.acceptOff}
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={accepts}
            onClick={toggleAccepts}
            disabled={togglePending}
            style={{
              flexShrink: 0,
              width: 44, height: 24, borderRadius: 999,
              background: accepts ? C.green : "rgba(11,11,13,0.18)",
              border: "none", cursor: togglePending ? "default" : "pointer",
              position: "relative", transition: "background 0.15s",
              opacity: togglePending ? 0.7 : 1,
            }}
          >
            <span style={{
              position: "absolute", top: 3,
              left: accepts ? 23 : 3,
              width: 18, height: 18, borderRadius: 999,
              background: "#fff", transition: "left 0.15s",
            }} />
          </button>
        </div>
      )}

      {toast && (
        <div role="status" style={{
          padding: "10px 14px", borderRadius: 10, fontSize: 13,
          background: toast.kind === "ok" ? "rgba(46,125,91,0.10)" : "rgba(192,75,35,0.10)",
          color: toast.kind === "ok" ? C.green : C.rust,
          border: `1px solid ${toast.kind === "ok" ? "rgba(46,125,91,0.30)" : "rgba(192,75,35,0.30)"}`,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        }}>
          <span>{toast.text}</span>
          {toast.rosterHref && (
            <a
              href={toast.rosterHref}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "5px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600,
                background: C.green, color: "#fff", textDecoration: "none",
                flexShrink: 0,
              }}
            >
              {copy.openRoster}
            </a>
          )}
        </div>
      )}

      {applications.length === 0 && showOptInHint && !accepts && (
        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, color: C.inkMuted, fontSize: 13 }}>
          {copy.emptyClosed}
        </div>
      )}

      {applications.length === 0 && accepts && (
        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, color: C.inkMuted, fontSize: 13 }}>
          {copy.emptyOpen}
        </div>
      )}

      {applications.length > 0 && (
        <>
          <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.ink }}>
              {copy.pendingHeading} {pendingRows.length > 0 && <span style={{ color: C.inkDim, fontWeight: 500 }}>· {pendingRows.length}</span>}
            </h2>
            <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
              {pendingRows.length === 0 ? (
                <div style={{ padding: 16, fontSize: 13, color: C.inkMuted }}>{copy.noPending}</div>
              ) : pendingRows.map((row, i) => renderRow(row, i, true))}
            </div>
          </section>

          {decidedRows.length > 0 && (
            <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.ink }}>{copy.decidedHeading}</h2>
              <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
                {decidedRows.map((row, i) => renderRow(row, i, false))}
              </div>
            </section>
          )}
        </>
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
              {copy.dialogTitle(decisionFor.decision, decisionFor.row.talentDisplayName)}
            </h3>
            {decisionFor.decision === "approved" && (
              <p style={{ margin: 0, fontSize: 12.5, color: C.inkMuted }}>{copy.approveBody}</p>
            )}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder={copy.notePlaceholder}
              style={{ fontFamily: FONT, fontSize: 13, padding: 10, border: `1px solid ${C.border}`, borderRadius: 8, resize: "vertical" }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => { setDecisionFor(null); setNote(""); }}
                disabled={pending}
                style={{ padding: "8px 14px", borderRadius: 7, fontSize: 13, background: "transparent", border: `1px solid ${C.border}`, color: C.ink, cursor: "pointer", fontFamily: FONT }}
              >
                {copy.cancel}
              </button>
              <button
                type="button"
                onClick={decide}
                disabled={pending}
                style={{ padding: "8px 14px", borderRadius: 7, fontSize: 13, background: decisionFor.decision === "approved" ? C.green : C.rust, color: "#fff", border: "none", cursor: "pointer", fontFamily: FONT }}
              >
                {pending ? copy.saving : decisionFor.decision === "approved" ? copy.approve : copy.reject}
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
            <StatusChip status={row.status} lang={lang} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {/* Roster shortcut for approved rows */}
            {row.status === "approved" && (
              <a
                href={`/${tenantSlug}/admin/roster`}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "5px 10px", borderRadius: 7, fontSize: 11.5, fontWeight: 600,
                  background: "rgba(46,125,91,0.10)", color: C.green, textDecoration: "none",
                  border: `1px solid rgba(46,125,91,0.20)`,
                }}
              >
                {copy.goToRoster}
              </a>
            )}
            {/* Repair: approved earlier but the talent never reached the roster. Approving again adds them. */}
            {row.status === "approved" && canDecide && (
              <button
                type="button"
                onClick={() => { setDecisionFor({ row, decision: "approved" }); setNote(""); }}
                disabled={pending}
                style={{ padding: "5px 10px", borderRadius: 7, fontSize: 11.5, background: "transparent", border: `1px solid ${C.border}`, color: C.ink, cursor: "pointer", fontFamily: FONT }}
              >
                {copy.addToRoster}
              </button>
            )}
            {isPending && canDecide && (
              <>
                <button
                  type="button"
                  onClick={() => { setDecisionFor({ row, decision: "rejected" }); setNote(""); }}
                  disabled={pending}
                  style={{ padding: "6px 12px", borderRadius: 7, fontSize: 12, background: "transparent", border: `1px solid ${C.border}`, color: C.rust, cursor: "pointer", fontFamily: FONT }}
                >
                  {copy.reject}
                </button>
                <button
                  type="button"
                  onClick={() => { setDecisionFor({ row, decision: "approved" }); setNote(""); }}
                  disabled={pending}
                  style={{ padding: "6px 12px", borderRadius: 7, fontSize: 12, background: C.green, color: "#fff", border: "none", cursor: "pointer", fontFamily: FONT, fontWeight: 600 }}
                >
                  {copy.approve}
                </button>
              </>
            )}
          </div>
        </div>
        {row.message && (
          <div style={{ fontSize: 12.5, color: C.ink, background: C.surface, padding: "8px 10px", borderRadius: 6 }}>
            {row.message}
          </div>
        )}
        {row.decisionNote && (
          <div style={{ fontSize: 12, color: C.inkMuted }}>
            <em>{copy.decisionNote}</em> {row.decisionNote}
          </div>
        )}
        <div style={{ fontSize: 11, color: C.inkDim }}>
          {copy.submitted} {new Date(row.submittedAt).toLocaleDateString(copy.dateLocale, { month: "short", day: "numeric" })}
          {row.decidedAt && ` · ${copy.decided} ${new Date(row.decidedAt).toLocaleDateString(copy.dateLocale, { month: "short", day: "numeric" })}`}
        </div>
      </div>
    );
  }
}
