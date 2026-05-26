"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  submitAgencyApplication,
  submitHubApplication,
  withdrawOwnApplication,
} from "@/lib/talent/apply-actions";
import type {
  OpenApplicableAgency,
  TalentApplicationRow,
} from "@/lib/talent/apply-loaders";

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

function StatusChip({ status }: { status: TalentApplicationRow["status"] }) {
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

export function TalentApplyDiscoveryClient({
  openAgencies,
  openHubs,
  ownApplications,
}: {
  openAgencies: OpenApplicableAgency[];
  openHubs: OpenApplicableAgency[];
  ownApplications: TalentApplicationRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeForm, setActiveForm] = useState<{
    kind: "agency" | "hub";
    tenantId: string;
    name: string;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function submit(kind: "agency" | "hub", tenantId: string) {
    startTransition(async () => {
      const result = kind === "agency"
        ? await submitAgencyApplication(tenantId, message)
        : await submitHubApplication(tenantId, message);
      if (result.ok) {
        setToast({ kind: "ok", text: "Application submitted." });
        setActiveForm(null);
        setMessage("");
        router.refresh();
      } else {
        setToast({ kind: "err", text: result.error });
      }
    });
  }

  function withdraw(kind: "agency" | "hub", id: string) {
    startTransition(async () => {
      const result = await withdrawOwnApplication(kind, id);
      if (result.ok) {
        setToast({ kind: "ok", text: "Withdrawn." });
        router.refresh();
      } else {
        setToast({ kind: "err", text: result.error });
      }
    });
  }

  const noneOpen = openAgencies.length === 0 && openHubs.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, fontFamily: FONT, maxWidth: 880, margin: "0 auto", padding: "24px 20px" }}>
      <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", color: C.accent }}>
          Discover
        </div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: C.ink, lineHeight: 1.1 }}>
          Apply to agencies & hubs
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: C.inkMuted, maxWidth: 640 }}>
          Open opportunities at agencies and hubs that accept applications. We
          hide ones you&apos;re already on, ones you&apos;ve already applied to,
          and (when applicable) everything else while you&apos;re under an
          exclusive relationship.
        </p>
        <Link href="/talent/site" style={{ fontSize: 12.5, color: C.accent, marginTop: 4 }}>
          ← Back to My Site
        </Link>
      </header>

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

      {ownApplications.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.ink }}>Your applications</h2>
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            {ownApplications.map((app, i) => (
              <div key={app.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 12, padding: "12px 14px",
                borderTop: i > 0 ? `1px solid ${C.borderSoft}` : "none",
              }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{app.agencyName}</span>
                    <span style={{ fontSize: 10.5, color: C.inkDim, textTransform: "uppercase", letterSpacing: 0.5 }}>{app.kind}</span>
                    <StatusChip status={app.status} />
                  </div>
                  {app.decisionNote && (
                    <div style={{ fontSize: 12, color: C.inkMuted }}>
                      {app.decisionNote}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: C.inkDim }}>
                    Submitted {new Date(app.submittedAt).toLocaleDateString("en-GB", { month: "short", day: "numeric" })}
                  </div>
                </div>
                {app.status === "pending" && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => withdraw(app.kind, app.id)}
                    style={{
                      padding: "6px 12px", borderRadius: 7, fontSize: 12,
                      background: "transparent", border: `1px solid ${C.border}`,
                      color: C.ink, cursor: pending ? "default" : "pointer",
                      fontFamily: FONT,
                    }}
                  >
                    Withdraw
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.ink }}>Agencies accepting applications</h2>
        {openAgencies.length === 0 ? (
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, fontSize: 13, color: C.inkMuted }}>
            No agencies are currently accepting open applications.
          </div>
        ) : (
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            {openAgencies.map((a, i) => renderApplicableRow("agency", a, i))}
          </div>
        )}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.ink }}>Hubs</h2>
        {openHubs.length === 0 ? (
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, fontSize: 13, color: C.inkMuted }}>
            No hubs available to apply to right now.
          </div>
        ) : (
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            {openHubs.map((h, i) => renderApplicableRow("hub", h, i))}
          </div>
        )}
      </section>

      {noneOpen && ownApplications.length === 0 && (
        <div style={{ fontSize: 12.5, color: C.inkMuted, textAlign: "center" }}>
          Nothing to show. If you&apos;re currently exclusive with an agency, apply
          is disabled until that relationship ends or releases you.
        </div>
      )}

      {activeForm && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed", inset: 0, background: "rgba(11,11,13,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
            zIndex: 100,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setActiveForm(null); }}
        >
          <div style={{ background: "#fff", borderRadius: 14, padding: 24, maxWidth: 480, width: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.ink }}>
              Apply to {activeForm.name}
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: C.inkMuted }}>
              Optional note for the {activeForm.kind === "hub" ? "hub" : "agency"} team.
            </p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              placeholder="Why you'd be a fit, links to recent work, availability windows…"
              style={{
                fontFamily: FONT, fontSize: 13, padding: 10,
                border: `1px solid ${C.border}`, borderRadius: 8, resize: "vertical",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => { setActiveForm(null); setMessage(""); }}
                disabled={pending}
                style={{ padding: "8px 14px", borderRadius: 7, fontSize: 13, background: "transparent", border: `1px solid ${C.border}`, color: C.ink, cursor: "pointer", fontFamily: FONT }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => submit(activeForm.kind, activeForm.tenantId)}
                disabled={pending}
                style={{ padding: "8px 14px", borderRadius: 7, fontSize: 13, background: C.ink, color: "#fff", border: "none", cursor: "pointer", fontFamily: FONT }}
              >
                {pending ? "Submitting…" : "Send application"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function renderApplicableRow(kind: "agency" | "hub", row: OpenApplicableAgency, i: number) {
    return (
      <div
        key={row.tenantId}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, padding: "12px 14px",
          borderTop: i > 0 ? `1px solid ${C.borderSoft}` : "none",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{row.displayName}</span>
          {row.slug && (
            <Link href={`/${row.slug}`} style={{ fontSize: 11.5, color: C.inkMuted, textDecoration: "none" }}>
              {row.slug}.tulala.app →
            </Link>
          )}
        </div>
        <button
          type="button"
          onClick={() => { setActiveForm({ kind, tenantId: row.tenantId, name: row.displayName }); setMessage(""); }}
          disabled={pending}
          style={{
            padding: "6px 14px", borderRadius: 7, fontSize: 12.5, fontWeight: 600,
            background: C.ink, color: "#fff", border: "none", cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          Apply
        </button>
      </div>
    );
  }
}
