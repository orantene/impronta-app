"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { listOwnApplications, type OwnApplicationRow } from "@/lib/talent/apply-actions";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import {
  LOCAL_NETWORKS,
  networkState,
  setNetworkState,
  type LocalNetwork,
  type LocalNetworkState,
} from "@/lib/talent/local-networks";

export function DiscoverNetworksPanel({ talentId }: { talentId: string | null }) {
  const copy = useDashboardText();
  const [selected, setSelected] = useState<LocalNetwork | null>(null);
  const [hideOpen, setHideOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [applications, setApplications] = useState<OwnApplicationRow[]>([]);
  const [, bump] = useState(0);
  const refresh = () => bump((n) => n + 1);
  useEffect(() => {
    if (!talentId) return;
    void listOwnApplications().then((res) => {
      if (res.ok) setApplications(res.items);
    });
  }, [talentId]);

  if (!talentId) {
    return <p className="text-[14px] text-admin-ink-muted">{copy.t("Not available")}</p>;
  }

  if (selected) {
    const state = networkState(talentId, selected.id);
    return (
      <NetworkDetail
        network={selected}
        state={state}
        hideOpen={hideOpen}
        leaveOpen={leaveOpen}
        onBack={() => {
          setSelected(null);
          setHideOpen(false);
          setLeaveOpen(false);
        }}
        onJoin={() => {
          setNetworkState(talentId, selected.id, selected.access === "open" ? "joined" : "pending");
          refresh();
        }}
        onHide={() => setHideOpen(true)}
        onConfirmHide={() => {
          setNetworkState(talentId, selected.id, "hidden");
          setHideOpen(false);
          refresh();
        }}
        onShow={() => {
          setNetworkState(talentId, selected.id, "joined");
          refresh();
        }}
        onLeave={() => setLeaveOpen(true)}
        onConfirmLeave={() => {
          setNetworkState(talentId, selected.id, "none");
          setLeaveOpen(false);
          refresh();
        }}
        onCancelDialog={() => {
          setHideOpen(false);
          setLeaveOpen(false);
        }}
      />
    );
  }

  return (
    <div className="font-admin-body">
      <p className="mb-4 text-[13px] text-admin-ink-muted">
        {copy.t("Local seed only. These networks are not live for other talents.")}
      </p>
      {applications.length > 0 && (
        <p className="mb-3 text-[12px] text-admin-ink-muted">
          {copy.t("Applications")} · {applications.length}
        </p>
      )}
      <ul className="divide-y divide-admin-border-soft overflow-hidden rounded-2xl border border-admin-border-soft bg-white">
        {LOCAL_NETWORKS.map((net) => {
          const state = networkState(talentId, net.id);
          return (
            <li key={net.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                onClick={() => setSelected(net)}
              >
                <span>
                  <span className="block text-[15px] font-semibold text-admin-ink">{net.name}</span>
                  <span className="block text-[12px] text-admin-ink-muted">
                    {net.city} · {copy.t(net.fee)}
                  </span>
                </span>
                <span className="text-[12px] font-semibold text-admin-ink-muted">
                  {state === "none" ? copy.t(net.access === "open" ? "Open to join" : "Apply") : copy.t(labelFor(state))}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function labelFor(state: LocalNetworkState): string {
  if (state === "joined") return "Joined";
  if (state === "pending") return "Application sent";
  if (state === "hidden") return "Hidden";
  return "";
}

function NetworkDetail({
  network,
  state,
  hideOpen,
  leaveOpen,
  onBack,
  onJoin,
  onHide,
  onConfirmHide,
  onShow,
  onLeave,
  onConfirmLeave,
  onCancelDialog,
}: {
  network: LocalNetwork;
  state: LocalNetworkState;
  hideOpen: boolean;
  leaveOpen: boolean;
  onBack: () => void;
  onJoin: () => void;
  onHide: () => void;
  onConfirmHide: () => void;
  onShow: () => void;
  onLeave: () => void;
  onConfirmLeave: () => void;
  onCancelDialog: () => void;
}) {
  const copy = useDashboardText();
  const hideStates = useMemo(
    () => [
      copy.t("Your listing there is hidden"),
      copy.t("You stay a member"),
      copy.t("Existing bookings stay as they are"),
      copy.t("You can show it again in one tap"),
      copy.t("Stats stay not shared"),
    ],
    [copy],
  );
  return (
    <div className="font-admin-body text-admin-ink">
      <button type="button" className="text-[13px] font-semibold" onClick={onBack}>
        ← {copy.t("Discover networks")}
      </button>
      <h2 className="mt-4 font-admin-display text-[24px] font-semibold">{network.name}</h2>
      <p className="mt-1 text-[13px] text-admin-ink-muted">
        {network.summary} · {network.city} · {copy.t(network.fee)}
      </p>
      <p className="mt-3 text-[13px] font-semibold">{copy.t(labelFor(state) || (network.access === "open" ? "Open to join" : "Apply"))}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {state === "none" && (
          <button type="button" className="rounded-full bg-admin-ink px-4 py-2 text-[13px] font-semibold text-white" onClick={onJoin}>
            {network.access === "open" ? copy.t("Join") : copy.t("Apply")}
          </button>
        )}
        {state === "joined" && (
          <>
            <button type="button" className="rounded-full border border-admin-border-soft px-4 py-2 text-[13px]" onClick={onHide}>
              {copy.t("Hide")}
            </button>
            <button type="button" className="rounded-full border border-admin-border-soft px-4 py-2 text-[13px]" onClick={onLeave}>
              {copy.t("Leave network")}
            </button>
          </>
        )}
        {state === "hidden" && (
          <button type="button" className="rounded-full bg-admin-ink px-4 py-2 text-[13px] font-semibold text-white" onClick={onShow}>
            {copy.t("Show again")}
          </button>
        )}
        {state === "pending" && (
          <p className="text-[13px] text-admin-ink-muted">{copy.t("Your application is waiting.")}</p>
        )}
      </div>

      {hideOpen && (
        <Dialog title={copy.t("Hide this listing?")} onCancel={onCancelDialog} onConfirm={onConfirmHide} confirm={copy.t("Hide")}>
          <ul className="space-y-1 text-[13px]">
            {hideStates.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Dialog>
      )}
      {leaveOpen && (
        <Dialog title={copy.t("Leave this network?")} onCancel={onCancelDialog} onConfirm={onConfirmLeave} confirm={copy.t("Leave network")}>
          <p className="text-[13px]">
            {copy.t("Your listing there is removed. Existing bookings stay exactly as they are. Hiding keeps the membership.")}
          </p>
        </Dialog>
      )}
    </div>
  );
}

function Dialog({
  title,
  children,
  onCancel,
  onConfirm,
  confirm,
}: {
  title: string;
  children: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  confirm: string;
}) {
  const copy = useDashboardText();
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" className="w-full max-w-[440px] rounded-2xl bg-white p-5">
        <h3 className="font-admin-display text-[20px]">{title}</h3>
        <div className="mt-3">{children}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="px-3 py-2 text-[13px]" onClick={onCancel}>
            {copy.t("Cancel")}
          </button>
          <button type="button" className="rounded-full bg-admin-ink px-4 py-2 text-[13px] text-white" onClick={onConfirm}>
            {confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
