"use client";

/**
 * Pending roster join requests (Tenant Registration Engine, S5).
 *
 * Lists talent who registered from the public site while the workspace was in
 * approval/exclusive mode (agency_talent_roster status='pending'). Manager+ can
 * approve (→ active, + exclusivity when in exclusive mode) or decline (→ removed)
 * via decideJoinRequest.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { decideJoinRequest } from "@/app/(workspace)/[tenantSlug]/admin/roster/registration/actions";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { JoinTermsStep } from "@/components/admin/service-hub/JoinTermsStep";
import type { JoinTermsInput } from "@/lib/service-hub/join-terms";
import { joinTermsCopy, joinTermsOutcomeNotice, joinTermsLocale } from "@/lib/service-hub/join-terms-copy";

type JoinRequest = { id: string; talentName: string; requestedAt: string };

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  border: "rgba(24,24,27,0.12)",
  cardBg: "#ffffff",
  surface: "rgba(11,11,13,0.02)",
  accent: "#0F4F3E",
  green: "#2E7D5B",
  rust: "#C04B23",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export function JoinRequestsList({
  tenantSlug,
  canManage,
  requests,
  onChanged,
}: {
  tenantSlug: string;
  canManage: boolean;
  requests: JoinRequest[];
  /**
   * Called after a successful approve/reject. The standalone page relies on
   * router.refresh() (server re-render); inside the SPA shell the host loads
   * this data client-side, so it passes a reloader here instead.
   */
  onChanged?: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // TUL-1476: Approve first opens the owner's terms step for that request.
  const locale = joinTermsLocale(useDashboardLocale());
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [terms, setTerms] = useState<JoinTermsInput | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function decide(id: string, decision: "approve" | "reject") {
    if (!canManage) return;
    setError(null);
    setNotice(null);
    setBusyId(id);
    startTransition(async () => {
      const res = await decideJoinRequest(tenantSlug, id, decision, decision === "approve" ? terms : null);
      setBusyId(null);
      if (res.ok) {
        setReviewId(null);
        setNotice(joinTermsOutcomeNotice(res.terms, locale));
        if (onChanged) onChanged();
        else router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <section style={{ fontFamily: FONT, display: "flex", flexDirection: "column", gap: 12, maxWidth: 720 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 650, color: C.ink }}>
          {t("dashboard.adminWorkspace.registration.pendingTitle")}
        </h2>
        <span style={{ fontSize: 12.5, color: C.inkMuted }}>
          {requests.length === 0
            ? t("dashboard.adminWorkspace.registration.pendingNone")
            : interpolate(t("dashboard.adminWorkspace.registration.pendingWaiting"), {
                count: requests.length,
              })}
        </span>
      </div>

      {error ? (
        <p style={{ margin: 0, fontSize: 12.5, color: C.rust }}>{error}</p>
      ) : null}
      {notice ? (
        <p style={{ margin: 0, fontSize: 12.5, color: C.green }}>{notice}</p>
      ) : null}

      {requests.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12.5, color: C.inkMuted }}>
          {t("dashboard.adminWorkspace.registration.pendingEmptyBody")}
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {requests.map((r) => {
            const rowBusy = pending && busyId === r.id;
            return (
              <li
                key={r.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 12,
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: C.cardBg,
                  border: `1px solid ${C.border}`,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>
                    {r.talentName}
                  </span>
                  <span style={{ fontSize: 12, color: C.inkMuted }}>
                    {interpolate(t("dashboard.adminWorkspace.registration.requestedOn"), {
                      date: formatDate(r.requestedAt),
                    })}
                  </span>
                </div>
                {canManage ? (
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => decide(r.id, "reject")}
                      disabled={rowBusy}
                      style={{
                        padding: "7px 14px",
                        borderRadius: 999,
                        border: `1px solid ${C.border}`,
                        background: C.surface,
                        color: C.ink,
                        fontSize: 12.5,
                        fontWeight: 600,
                        cursor: rowBusy ? "default" : "pointer",
                        fontFamily: FONT,
                      }}
                    >
                      {t("dashboard.adminWorkspace.registration.decline")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (reviewId === r.id) {
                          decide(r.id, "approve");
                          return;
                        }
                        setTerms(null);
                        setReviewId(r.id);
                      }}
                      disabled={rowBusy}
                      style={{
                        padding: "7px 16px",
                        borderRadius: 999,
                        border: "none",
                        background: rowBusy ? "rgba(15,79,62,0.5)" : C.accent,
                        color: "#fff",
                        fontSize: 12.5,
                        fontWeight: 600,
                        cursor: rowBusy ? "default" : "pointer",
                        fontFamily: FONT,
                      }}
                    >
                      {rowBusy
                        ? "…"
                        : reviewId === r.id && terms?.send
                          ? joinTermsCopy(locale).confirmApprove
                          : t("dashboard.adminWorkspace.registration.approve")}
                    </button>
                  </div>
                ) : null}
                {canManage && reviewId === r.id ? (
                  <div style={{ flexBasis: "100%" }}>
                    <JoinTermsStep tenantSlug={tenantSlug} locale={locale} value={terms} onChange={setTerms} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
