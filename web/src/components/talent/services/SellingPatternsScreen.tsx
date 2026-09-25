"use client";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";

type Pattern = {
  id: string;
  title: string;
  engine: "exists" | "partial" | "missing";
  note: string;
};

const PATTERNS: Pattern[] = [
  { id: "consult", title: "Consultation then book", engine: "exists", note: "Request to book on the service form." },
  { id: "goods", title: "Goods the client takes away", engine: "exists", note: "Product with stock on the product form." },
  { id: "multi", title: "Several services in one visit", engine: "partial", note: "Packages only. No per-item pattern field." },
  { id: "scope", title: "Scoped project", engine: "partial", note: "Quote versions exist. Not stored on the item." },
  { id: "credits", title: "Credits", engine: "partial", note: "Credit engine exists. Not wired as a selling pattern." },
  { id: "class", title: "Class with seats", engine: "partial", note: "Sessions exist. Not a talent item pattern." },
  { id: "cut", title: "Timed appointment", engine: "partial", note: "Duration and instant book exist. No named pattern." },
  { id: "dinner", title: "Seated event", engine: "missing", note: "Not available." },
  { id: "logo", title: "Deliverable", engine: "missing", note: "Not available." },
  { id: "recur", title: "Recurring", engine: "missing", note: "Not available." },
  { id: "overtime", title: "Overtime", engine: "missing", note: "Not available." },
  { id: "project", title: "Revised project quote", engine: "partial", note: "v1 superseded, v2 awaiting on quote versions." },
  { id: "conflict", title: "Second client on a held time", engine: "partial", note: "No double book. Agency client stays private." },
];

export function SellingPatternsScreen({ onBack }: { onBack: () => void }) {
  const copy = useDashboardText();
  return (
    <div className="font-admin-body text-admin-ink">
      <button type="button" className="text-[13px] font-semibold" onClick={onBack}>
        ← {copy.t("Services")}
      </button>
      <h1 className="mt-4 font-admin-display text-[28px] font-semibold">{copy.t("Selling patterns")}</h1>
      <p className="mt-2 max-w-xl text-[14px] text-admin-ink-muted">
        {copy.t("How an item is sold. Engines that exist are listed. Missing ones stay not available.")}
      </p>
      <ul className="mt-6 divide-y divide-admin-border-soft overflow-hidden rounded-2xl border border-admin-border-soft bg-white">
        {PATTERNS.map((row) => (
          <li key={row.id} className="px-4 py-3">
            <p className="text-[15px] font-semibold">{copy.t(row.title)}</p>
            <p className="mt-1 text-[13px] text-admin-ink-muted">
              {row.engine === "missing" ? copy.t("Not available") : copy.t(row.note)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
