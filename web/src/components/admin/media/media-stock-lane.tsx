"use client";

/**
 * MediaStockLane — the read-only "Lifestyle stock / Fotos de estilo de vida"
 * folder on every workspace's Media page (Templates & Imagery, Layer 3).
 *
 * VIRTUAL FOLDER (D-TPL-6): nothing here is a row the tenant owns. The lane
 * reads `actionListLifestyleStock` (platform stock for this workspace's
 * business type, family pack as fallback). Tenants can look, open, copy a
 * photo's address and favourite it; there is no rename, move, delete or
 * upload, because the shelf is shared by every workspace of the type.
 *
 * Push to existing tenants is the read itself: a photo platform admin adds
 * is on every shelf on the next open. (A "new since you last looked" badge
 * is deferred; see 02-handoff.md.) Admin-* token classes only, no hex.
 */

import { useEffect, useMemo, useState } from "react";

import { actionListLifestyleStock, type LifestyleStockShelf } from "@/app/(workspace)/[tenantSlug]/admin/media/stock-actions";
import { interpolate } from "@/i18n/interpolate";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { useT } from "@/i18n/use-t";
import type { LifestyleStockPhoto } from "@/lib/media/platform-stock";

const ROLE_ORDER = ["hero", "wide", "portrait", "gallery", "team", "detail"] as const;

// Literal keys (the message-key-usage gate reads call sites, not templates).
const ROLE_LABEL_KEY: Record<(typeof ROLE_ORDER)[number], string> = {
  hero: "dashboard.adminMedia.stock.role.hero",
  wide: "dashboard.adminMedia.stock.role.wide",
  portrait: "dashboard.adminMedia.stock.role.portrait",
  gallery: "dashboard.adminMedia.stock.role.gallery",
  team: "dashboard.adminMedia.stock.role.team",
  detail: "dashboard.adminMedia.stock.role.detail",
};

export function MediaStockLane() {
  const t = useT();
  const locale: "es" | "en" = useDashboardLocale() === "es" ? "es" : "en";
  const [shelf, setShelf] = useState<LifestyleStockShelf | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<LifestyleStockPhoto | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    actionListLifestyleStock().then((res) => {
      if (!alive) return;
      if (res.ok) {
        setShelf(res.data);
      } else {
        setError(res.error);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const byRole = useMemo(() => {
    const map = new Map<string, LifestyleStockPhoto[]>();
    for (const p of shelf?.photos ?? []) map.set(p.role, [...(map.get(p.role) ?? []), p]);
    return ROLE_ORDER.map((role) => [role, map.get(role) ?? []] as const).filter(([, list]) => list.length > 0);
  }, [shelf]);

  const copy = async (p: LifestyleStockPhoto) => {
    try {
      await navigator.clipboard.writeText(p.url);
      setCopied(p.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-admin-ink text-base font-semibold">{t("dashboard.adminMedia.stock.title")}</h2>
          <p className="text-admin-ink-muted text-xs">
            {shelf ? interpolate(t("dashboard.adminMedia.stock.subtitle"), { type: shelf.typeId, family: shelf.family }) : t("dashboard.adminMedia.stock.loading")}
          </p>
        </div>
        <span className="text-admin-ink-muted rounded-full border border-admin-border-soft px-2 py-0.5 text-[11px]">{t("dashboard.adminMedia.stock.readOnly")}</span>
      </div>

      {error ? <p className="text-admin-coral text-sm">{error}</p> : null}
      {shelf && shelf.photos.length === 0 ? <p className="text-admin-ink-muted text-sm">{t("dashboard.adminMedia.stock.empty")}</p> : null}

      {byRole.map(([role, list]) => (
        <section key={role} className="mb-6">
          <p className="text-admin-ink-muted mb-2 text-[11px] font-bold uppercase tracking-wider">
            {t(ROLE_LABEL_KEY[role])} <span className="font-normal">· {list.length}</span>
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {list.map((p) => (
              <figure key={p.id} className="group relative overflow-hidden rounded-lg border border-admin-border-soft bg-admin-surface">
                <button type="button" onClick={() => setOpen(p)} className="block w-full" aria-label={p.alt[locale]}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- stock URL from the shared bucket; unoptimised by design */}
                  <img src={p.url} alt={p.alt[locale]} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                </button>
                <figcaption className="flex flex-col gap-0.5 px-2 py-1.5 text-[11px]">
                  <span className="text-admin-ink-muted truncate" title={p.alt[locale]}>{p.alt[locale]}</span>
                  <button type="button" onClick={() => copy(p)} className="text-admin-ink self-start underline-offset-2 hover:underline">
                    {copied === p.id ? t("dashboard.adminMedia.stock.copied") : t("dashboard.adminMedia.stock.copyUrl")}
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}

      {open ? (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={() => setOpen(null)}>
          <div className="max-h-full max-w-5xl overflow-auto rounded-lg bg-admin-surface p-3" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element -- lightbox of a shared-bucket URL */}
            <img src={open.url} alt={open.alt[locale]} className="max-h-[80vh] w-auto" />
            <div className="text-admin-ink-muted mt-2 flex flex-wrap justify-between gap-2 text-xs">
              <span>{open.alt[locale]}</span>
              <span>
                {open.source} · {open.licence}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
