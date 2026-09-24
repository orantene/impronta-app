"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadTalentClients, type TalentClientRow } from "@/lib/talent/clients-actions";
import { useDashboardText } from "../../dashboard-i18n";
import { useAdminShell } from "../../state";
import { PageHeader } from "../shared/page-chrome-1";

export function TalentClientsPage() {
  const { bridgeTalentSelfProfile } = useAdminShell();
  const copy = useDashboardText();
  const router = useRouter();
  const [items, setItems] = useState<TalentClientRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const talentId = bridgeTalentSelfProfile?.id ?? null;

  useEffect(() => {
    if (!talentId) return;
    let cancelled = false;
    void loadTalentClients(talentId).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error);
        setItems([]);
        return;
      }
      setItems(res.items);
    });
    return () => {
      cancelled = true;
    };
  }, [talentId]);

  return (
    <div>
      <PageHeader
        title={copy.t("Clients")}
        subtitle={copy.t("People who booked or messaged you")}
      />
      {!talentId && (
        <p className="px-1 py-4 font-admin-body text-[13px] text-admin-ink-muted">
          {copy.t("Your clients will appear here once your talent profile is set up.")}
        </p>
      )}
      {talentId && items === null && (
        <p className="px-1 py-4 font-admin-body text-[13px] text-admin-ink-muted">{copy.t("Loading")}</p>
      )}
      {error && (
        <p className="px-1 py-4 font-admin-body text-[13px] text-admin-ink">
          {error} {copy.t("Refresh the page and try again.")}
        </p>
      )}
      {items && items.length === 0 && !error && (
        <p className="px-1 py-4 font-admin-body text-[13px] text-admin-ink-muted">
          {copy.t("No one has booked or messaged you yet.")}
        </p>
      )}
      {items && items.length > 0 && (
        <ul className="divide-y divide-admin-border-soft rounded-[12px] border border-admin-border-soft bg-white">
          {items.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => {
                  if (row.conversationHref) router.push(row.conversationHref);
                }}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left font-admin-body"
              >
                <span>
                  <span className="block text-[14px] font-semibold text-admin-ink">{row.name}</span>
                  <span className="block text-[12px] text-admin-ink-muted">
                    {row.visitCount > 0
                      ? copy.t("Visits") + ` · ${row.visitCount}`
                      : copy.t("Messaged you")}
                    {row.lastVisit
                      ? ` · ${new Date(row.lastVisit).toLocaleDateString()}`
                      : ""}
                  </span>
                </span>
                <span className="text-[12px] text-admin-ink-muted">
                  {row.amountOwedCents == null
                    ? copy.t("Nothing owed on file")
                    : `${row.currency ?? ""} ${Math.round(row.amountOwedCents / 100)}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
