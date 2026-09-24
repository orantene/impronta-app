"use client";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";

const FLOWS = [
  { id: "agency_job", title: "Agency job", rule: "Accept or decline. Agency client stays private." },
  { id: "conflict", title: "Conflict", rule: "No double book. The second client is not charged." },
  { id: "online_book", title: "Online book", rule: "If the slot is taken, the booking is refused." },
  { id: "manual_book", title: "Manual book", rule: "You pick the client, the service and a free time." },
  { id: "reschedule", title: "Reschedule", rule: "Deposit kept. The old time is released." },
  { id: "complete", title: "Finish and collect", rule: "Cash and transfers are collected, never payouts." },
  { id: "project", title: "Project quote", rule: "v1 superseded, v2 awaiting." },
];

export function WorkFlowsScreen({ onBack }: { onBack?: () => void }) {
  const copy = useDashboardText();
  return (
    <div className="font-admin-body text-admin-ink">
      {onBack && (
        <button type="button" className="text-[13px] font-semibold" onClick={onBack}>
          ← {copy.t("Today")}
        </button>
      )}
      <h1 className="mt-4 font-admin-display text-[24px] font-semibold">{copy.t("Work flows")}</h1>
      <ul className="mt-4 divide-y divide-admin-border-soft overflow-hidden rounded-2xl border border-admin-border-soft bg-white">
        {FLOWS.map((flow) => (
          <li key={flow.id} className="px-4 py-3">
            <p className="text-[15px] font-semibold">{copy.t(flow.title)}</p>
            <p className="mt-1 text-[13px] text-admin-ink-muted">{copy.t(flow.rule)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
