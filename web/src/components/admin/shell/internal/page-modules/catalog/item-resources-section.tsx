"use client";

/**
 * TUL-1375 · "Resources this service uses": the chairs, rooms, stations, beds, bays or
 * units a booking of this service holds. Every booking path holds them for the booked
 * time, so two bookings can never share one. Only spaces set up for booking (with a
 * capacity pool) are listed.
 *
 * Desktop: chips wrap in rows inside the card. 390: chips wrap to full-width lines; each
 * chip is a 44px tap target.
 */
import { useEffect, useState } from "react";

import { useT } from "@/i18n/use-t";
import {
  loadOfferingResourcesAction,
  setOfferingResourcesAction,
  type BookableResource,
} from "@/lib/resources/offering-resources-actions";
import { CARD, Note, SectionHead } from "./catalog-ui";

export function ItemResourcesSection({ tenantId, offeringId, disabled }: { tenantId: string; offeringId: string; disabled: boolean }) {
  const t = useT();
  const [resources, setResources] = useState<BookableResource[] | null>(null);
  const [linked, setLinked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (disabled) return;
    let alive = true;
    void loadOfferingResourcesAction(tenantId, offeringId).then((res) => {
      if (!alive) return;
      if (!res.ok) {
        setError(t("dashboard.catalog.resources.error"));
        setResources([]);
        return;
      }
      setResources(res.resources);
      setLinked(res.linked);
    });
    return () => {
      alive = false;
    };
  }, [tenantId, offeringId, disabled, t]);

  async function toggle(id: string) {
    const next = linked.includes(id) ? linked.filter((x) => x !== id) : [...linked, id];
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await setOfferingResourcesAction(tenantId, offeringId, next);
      if (!res.ok) {
        setError(t("dashboard.catalog.resources.error"));
        return;
      }
      setLinked(res.linked);
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${CARD} mt-[16px] p-[16px]`} data-testid="catalog-item-resources">
      <SectionHead title={t("dashboard.catalog.resources.title")} intro={t("dashboard.catalog.resources.intro")} />
      {disabled ? (
        <Note>{t("dashboard.catalog.resources.saveFirst")}</Note>
      ) : resources === null ? null : resources.length === 0 ? (
        <Note>{t("dashboard.catalog.resources.none")}</Note>
      ) : (
        <div className="flex flex-wrap gap-[8px]" role="group" aria-label={t("dashboard.catalog.resources.title")}>
          {resources.map((r) => {
            const on = linked.includes(r.id);
            return (
              <button
                key={r.id}
                type="button"
                aria-pressed={on}
                disabled={busy}
                onClick={() => void toggle(r.id)}
                className={`min-h-[44px] rounded-full border px-[14px] text-[13px] ${on ? "border-admin-ink bg-admin-ink text-white" : "border-admin-border bg-admin-card text-admin-ink"}`}
              >
                {r.name}
              </button>
            );
          })}
        </div>
      )}
      {error ? <Note tone="warn">{error}</Note> : saved ? <Note>{t("dashboard.catalog.resources.saved")}</Note> : null}
    </section>
  );
}
