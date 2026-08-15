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
  actionListMediaReleaseHistory,
  actionListMediaReleaseRequests,
  actionRevokeMediaRelease,
  type MediaReleaseHistoryEntry,
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
  /** Partial-success detail from an approval whose watermark bake failed for
   *  some photos (A4). The count in `done` is already correct; without this the
   *  reason those photos are missing is dropped on the floor. */
  const [warning, setWarning] = useState<string | null>(null);
  /**
   * Per-request "require watermark" ticks (phase 4). Kept per request id
   * rather than as one panel-wide toggle: releasing editorial to one hub with
   * a mark and to another without is a normal thing to want, and a shared
   * checkbox would silently carry a decision across cards.
   */
  const [watermark, setWatermark] = useState<Record<string, boolean>>({});
  /**
   * B15 — what this workspace already answered. Declines, releases it later
   * ended, and asks the talent withdrew all used to vanish without a trace, so
   * "did we already say no to this?" had no answer anywhere in the product.
   *
   * Loaded separately from the open queue and collapsed by default: the
   * actionable half must not wait on history, and a failed history read must
   * not take the approve/decline buttons down with it.
   */
  const [history, setHistory] = useState<MediaReleaseHistoryEntry[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

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

  const loadHistory = useCallback(async () => {
    setHistory(null);
    const res = await actionListMediaReleaseHistory();
    setHistory(res.ok ? res.data : []);
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

  // Fetch the history only once the reader asks for it, then keep it fresh
  // after every decision — a decline that does not appear under "Past
  // decisions" is the same disappearing act this section exists to end.
  useEffect(() => {
    if (!historyOpen) return;
    void loadHistory();
  }, [historyOpen, loadHistory, done]);

  const decide = async (request: MediaReleaseRequestSummary, approve: boolean) => {
    setBusy({ requestId: request.requestId, kind: approve ? "approve" : "deny" });
    setError(null);
    setDone(null);
    setWarning(null);
    const watermarkRequired = approve && watermark[request.requestId] === true;
    const res = await actionDecideMediaReleaseRequest({
      requestId: request.requestId,
      approve,
      watermarkRequired,
    });
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDone(
      approve
        ? (watermarkRequired
            ? t("dashboard.mediaReleaseRequests.approvedWatermarked")
            : t("dashboard.mediaReleaseRequests.approved")
          ).replace("{count}", String(res.data.granted))
        : t("dashboard.mediaReleaseRequests.denied"),
    );
    if (res.data.warning) setWarning(res.data.warning);
    await load();
  };

  const revoke = async (request: MediaReleaseRequestSummary) => {
    setBusy({ requestId: request.requestId, kind: "revoke" });
    setError(null);
    setDone(null);
    setWarning(null);
    const res = await actionRevokeMediaRelease({
      talentProfileId: request.talentProfileId,
      assetIds: request.assetIds,
      // Scope the revoke to the hub this card names (A6/D-6). Without it the
      // action falls back to the legacy revoke-everywhere semantic and ending
      // a release to hub B silently kills the live releases to C and D.
      targetTenantId: request.targetTenantId,
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

              {isOpen && (
                <label className="mt-3 flex cursor-pointer items-start gap-2 text-[11.5px] text-admin-ink-dim">
                  <input
                    type="checkbox"
                    checked={watermark[request.requestId] === true}
                    disabled={pendingHere}
                    onChange={(e) =>
                      setWatermark((prev) => ({
                        ...prev,
                        [request.requestId]: e.target.checked,
                      }))
                    }
                    className="mt-0.5 cursor-pointer accent-admin-indigo-deep"
                  />
                  <span>
                    <span className="font-semibold text-admin-ink">
                      {t("dashboard.mediaReleaseRequests.watermarkLabel")}
                    </span>
                    <span className="block text-admin-ink-muted">
                      {t("dashboard.mediaReleaseRequests.watermarkHint")}
                    </span>
                    {/*
                      B14 — the tick is a ONE-WAY decision per release. There
                      is no "edit the watermark on an approved release": the
                      only way back is revoke-and-redo. That was true before
                      and said nowhere.
                    */}
                    <span className="mt-1 block font-medium text-admin-indigo-deep">
                      {t("dashboard.mediaReleaseRequests.watermarkPermanentHint")}
                    </span>
                  </span>
                </label>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {isOpen && (
                  <button
                    type="button"
                    onClick={() => decide(request, true)}
                    disabled={pendingHere}
                    className="cursor-pointer rounded-lg bg-admin-indigo-deep px-3 py-1.5 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-admin-fill disabled:text-admin-ink-dim"
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
                    /* B4 — the token names read backwards: `-dim` is 0.38
                       alpha and `-muted` is 0.72, so the old pair made the
                       DISABLED state twice as loud as the live one. Enabled
                       `-muted`, disabled `-dim`. */
                    className="cursor-pointer rounded-lg border border-admin-border bg-admin-surface px-3 py-1.5 text-[12px] font-semibold text-admin-ink-muted disabled:cursor-not-allowed disabled:text-admin-ink-dim"
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
                    className="cursor-pointer rounded-lg border border-admin-border bg-admin-surface px-3 py-1.5 text-[12px] font-semibold text-admin-red disabled:cursor-not-allowed disabled:text-admin-ink-dim"
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

      {warning && !error && (
        <div className="text-[11.5px] leading-snug text-[#2c5fdb]">{warning}</div>
      )}

      {/* B15 — past decisions. Read-only by design: there is no un-decline and
          no un-revoke, and re-approving means the talent asks again. */}
      <details
        className="rounded-lg border border-admin-border-soft bg-admin-surface"
        open={historyOpen}
        onToggle={(e) => setHistoryOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer px-3 py-2 text-[12px] font-semibold text-admin-ink">
          {t("dashboard.mediaReleaseRequests.historyTitle")}
        </summary>
        <div className="border-t border-admin-border-soft px-3 py-2">
          <div className="mb-2 text-[11px] text-admin-ink-muted">
            {t("dashboard.mediaReleaseRequests.historyHint")}
          </div>
          {history === null && (
            <div className="text-[11.5px] text-admin-ink-muted">
              {t("dashboard.mediaReleaseRequests.historyLoading")}
            </div>
          )}
          {history !== null && history.length === 0 && (
            <div className="text-[11.5px] text-admin-ink-muted">
              {t("dashboard.mediaReleaseRequests.historyEmpty")}
            </div>
          )}
          {history !== null && history.length > 0 && (
            <ul className="flex flex-col gap-2">
              {history.map((entry) => (
                <li
                  key={entry.requestId}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-admin-border-soft pb-2 last:border-b-0 last:pb-0"
                >
                  <span className="text-[11.5px] text-admin-ink">
                    {t("dashboard.mediaReleaseRequests.historyEntry")
                      .replace("{talent}", entry.talentName)
                      .replace("{count}", String(entry.assetCount))}
                    <span className="ml-1 text-admin-ink-muted">
                      {entry.targetTenantName
                        ? t("dashboard.mediaReleaseRequests.targetNamed").replace(
                            "{workspace}",
                            entry.targetTenantName,
                          )
                        : t("dashboard.mediaReleaseRequests.targetAnywhere")}
                    </span>
                  </span>
                  <span className="text-[11px] text-admin-ink-muted">
                    {t(
                      entry.outcome === "declined"
                        ? "dashboard.mediaReleaseRequests.outcomeDeclined"
                        : entry.outcome === "withdrawn"
                          ? "dashboard.mediaReleaseRequests.outcomeWithdrawn"
                          : "dashboard.mediaReleaseRequests.outcomeRevoked",
                    )}
                    {" · "}
                    {entry.decidedAt.slice(0, 10)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </div>
  );
}
