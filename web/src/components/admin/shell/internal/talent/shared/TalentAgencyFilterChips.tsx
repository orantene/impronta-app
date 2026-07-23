"use client";

import { useDashboardText } from "../../dashboard-i18n";
import { useTalentAgencyFilter } from "./use-talent-agency-filter";
import { useAdminShell } from "../../state";

type Props = {
  /** Optional per-agency unread counts keyed by agency slug. */
  unreadBySlug?: Record<string, number>;
};

export function TalentAgencyFilterChips({ unreadBySlug }: Props) {
  const copy = useDashboardText();
  const { filter, setFilter, agencies, showChips } = useTalentAgencyFilter();
  const { effectiveTalentInquiries } = useAdminShell();

  if (!showChips) return null;

  const unreadTotals = unreadBySlug ?? (() => {
    const map: Record<string, number> = {};
    for (const row of effectiveTalentInquiries) {
      const slug = "agencySlug" in row ? (row as { agencySlug?: string }).agencySlug : undefined;
      if (!slug) continue;
      map[slug] = (map[slug] ?? 0) + (row.unreadCount ?? 0);
    }
    return map;
  })();

  const allUnread = effectiveTalentInquiries.reduce(
    (sum, row) => sum + (row.unreadCount ?? 0),
    0,
  );

  return (
    <div
      className="mb-4 flex flex-wrap gap-2"
      data-tulala-talent-agency-filter
      role="group"
      aria-label={copy.t("Filter by agency")}
    >
      <FilterChip
        label={copy.t("All")}
        active={filter === "all"}
        unread={allUnread}
        onClick={() => setFilter("all")}
      />
      {agencies.map((ag) => (
        <FilterChip
          key={ag.id}
          label={ag.agencyName}
          active={filter === ag.agencySlug}
          unread={unreadTotals[ag.agencySlug] ?? 0}
          onClick={() => setFilter(ag.agencySlug)}
        />
      ))}
    </div>
  );
}

function FilterChip({
  label,
  active,
  unread,
  onClick,
}: {
  label: string;
  active: boolean;
  unread: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
        active
          ? "border-admin-ink bg-admin-ink text-white"
          : "border-admin-border-soft bg-white text-admin-ink-muted hover:bg-admin-surface-alt",
      ].join(" ")}
    >
      <span>{label}</span>
      {unread > 0 ? (
        <span
          className={[
            "min-w-[1.1rem] rounded-full px-1 text-[10px] font-bold leading-4",
            active ? "bg-white/20 text-white" : "bg-admin-coral-soft text-admin-coral-deep",
          ].join(" ")}
        >
          {unread}
        </span>
      ) : null}
    </button>
  );
}
