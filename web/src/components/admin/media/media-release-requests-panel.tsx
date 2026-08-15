"use client";

/**
 * media-release-requests-panel.tsx — the workspace half of the two-key rule.
 *
 * Talents you represent can ask to use photos YOU own outside your site. Each
 * open request lands here with who asked, how many photos, and where they want
 * to use them. Approving writes the owner key and the photos become usable on
 * the next resolve; declining changes nothing; revoking pulls a live release
 * back and the photos come down everywhere outside this workspace.
 *
 * Deliberately outside `components/admin/shell/**` (frozen against new inline
 * styles), like the phase 1 ownership chip. Tailwind admin-* tokens only, and
 * every action shows explicit pending / done / error state — the admin edit-UX
 * rule is no silent waits.
 */

import { useCallback, useEffect, useState } from "react";

import { useT } from "@/i18n/use-t";
import {
  actionDecideMediaReleaseRequest,
  actionListMediaReleaseRequests,
  actionRevokeMediaRelease,
  type MediaReleaseRequestSummary,
} from "@/lib/server-actions/admin-media-release";

type Busy = { requestId: string; kind: "approve" | "deny" | "revoke" } | null;

export function MediaReleaseRequestsPanel() {
  const t = useT();
  const [requests, setRequests] = useState<MediaReleaseRequestSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRequests(null);
    setLoadError(null);
    const res = await actionListMediaReleaseRequests();
    if (!res.ok) {
      setLoadError(res.error);
      setRequests([]);
      return;
    }
    setRequests(res.data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const decide = async (request: MediaReleaseRequestSummary, approve: boolean) => {
    setBusy({ requestId: request.requestId, kind: approve ? "approve" : "deny" });
    setError(null);
    setDone(null);
    const res = await actionDecideMediaReleaseRequest({
      requestId: request.requestId,
      approve,
    });
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDone(
      approve
        ? t("dashboard.mediaReleaseRequests.approved").replace("{count}", String(res.data.granted))
        : t("dashboard.mediaReleaseRequests.denied"),
    );
    await load();
  };

  const revoke = async (request: MediaReleaseRequestSummary) => {
    setBusy({ requestId: request.requestId, kind: "revoke" });
    setError(null);
    setDone(null);
    const res = await actionRevokeMediaRelease({
      talentProfileId: request.talentProfileId,
      assetIds: request.assetIds,
    });
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDone(
      t("dashboard.mediaReleaseRequests.revoked").replace("{count}", String(res.data.revoked)),
    );
    await load();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-admin-border-soft bg-admin-indigo-soft p-3">
        <div className="text-[12.5px] font-semibold text-admin-indigo-deep">
          {t("dashboard.mediaReleaseRequests.title")}
        </div>
        <div className="mt-1 text-[11.5px] leading-relaxed text-admin-ink-muted">
          {t("dashboard.mediaReleaseRequests.body")}
        </div>
      </div>

      {requests === null && (
        <div className="text-[12px] text-admin-ink-muted">
          {t("dashboard.mediaReleaseRequests.loading")}
        </div>
      )}

      {loadError && (
        <div className="rounded-lg border border-admin-border bg-admin-surface-alt p-3 text-[12px] text-admin-red">
          {loadError}
        </div>
      )}

      {requests !== null && requests.length === 0 && !loadError && (
        <div className="rounded-lg border border-dashed border-admin-border bg-admin-surface-alt p-4 text-center text-[12px] text-admin-ink-muted">
          {t("dashboard.mediaReleaseRequests.empty")}
        </div>
      )}

      {requests !== null &&
        requests.map((request) => {
          const pendingHere = busy?.requestId === request.requestId;
          const isOpen = request.status === "pending";
          const where = request.targetTenantName
            ? t("dashboard.mediaReleaseRequests.targetNamed").replace(
                "{workspace}",
                request.targetTenantName,
              )
            : t("dashboard.mediaReleaseRequests.targetAnywhere");
          return (
            <div
              key={request.requestId}
              className="rounded-lg border border-admin-border-soft bg-admin-surface p-3"
            >
              <div className="text-[12.5px] font-semibold text-admin-ink">
                {t("dashboard.mediaReleaseRequests.heading")
                  .replace("{talent}", request.talentName)
                  .replace("{count}", String(request.assetIds.length))}
              </div>
              <div className="mt-1 text-[11.5px] text-admin-ink-muted">{where}</div>
              {request.message && (
                <div className="mt-2 rounded border border-admin-border-soft bg-admin-surface-alt p-2 text-[11.5px] text-admin-ink-dim">
                  {request.message}
                </div>
              )}

              {!isOpen && (
                <div className="mt-1 text-[11.5px] font-semibold text-admin-green">
                  {t("dashboard.mediaReleaseRequests.activeRelease")}
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {isOpen && (
                  <button
                    type="button"
                    onClick={() => decide(request, true)}
                    disabled={pendingHere}
                    className="cursor-pointer rounded-lg bg-admin-indigo-deep px-3 py-1.5 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-admin-fill disabled:text-admin-ink-muted"
                  >
                    {pendingHere && busy?.kind === "approve"
                      ? t("dashboard.mediaReleaseRequests.working")
                      : t("dashboard.mediaReleaseRequests.approve")}
                  </button>
                )}
                {isOpen && (
                  <button
                    type="button"
                    onClick={() => decide(request, false)}
                    disabled={pendingHere}
                    className="cursor-pointer rounded-lg border border-admin-border bg-admin-surface px-3 py-1.5 text-[12px] font-semibold text-admin-ink-dim disabled:cursor-not-allowed disabled:text-admin-ink-muted"
                  >
                    {pendingHere && busy?.kind === "deny"
                      ? t("dashboard.mediaReleaseRequests.working")
                      : t("dashboard.mediaReleaseRequests.decline")}
                  </button>
                )}
                {!isOpen && (
                  <button
                    type="button"
                    onClick={() => revoke(request)}
                    disabled={pendingHere}
                    className="cursor-pointer rounded-lg border border-admin-border bg-admin-surface px-3 py-1.5 text-[12px] font-semibold text-admin-red disabled:cursor-not-allowed disabled:text-admin-ink-muted"
                    title={t("dashboard.mediaReleaseRequests.revokeHint")}
                  >
                    {pendingHere && busy?.kind === "revoke"
                      ? t("dashboard.mediaReleaseRequests.working")
                      : t("dashboard.mediaReleaseRequests.revoke")}
                  </button>
                )}
              </div>
            </div>
          );
        })}

      {(done || error) && (
        <div className={`text-[11.5px] ${error ? "text-admin-red" : "text-admin-ink-muted"}`}>
          {error ?? done}
        </div>
      )}
    </div>
  );
}
