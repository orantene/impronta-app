"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { loadPromosPage, type PromoListItem, type PromosPageData } from "@/lib/promos/actions";
import { promoCopy, type PromoCopy } from "@/lib/promos/copy/talent";
import { money } from "@/lib/promos/results/copy";
import { progressOf } from "@/lib/promos/talent-view";
import { offerLabel } from "./describe";
import { TagIcon, UI } from "./ui";

/** Status dot colour; only live promos are listed, but the dot keeps the row honest. */
export function statusDotClass(status: PromoListItem["status"]): string {
  switch (status) {
    case "live": return "bg-emerald-500";
    case "paused": return "bg-amber-500";
    case "sold_out": return "bg-rose-500";
    default: return "bg-neutral-400";
  }
}

/** The talent's active promos, newest first. */
export function activePromos(promos: readonly PromoListItem[]): PromoListItem[] {
  return promos.filter((p) => p.status === "live");
}

/**
 * Loads the promos page data once the drawer opens. The first request can be
 * aborted by the shell's startup refresh and never settle, so it retries.
 * `injected` skips the server action entirely (fixtures, tests).
 */
function useDrawerData(open: boolean, injected: PromosPageData | undefined) {
  const [data, setData] = useState<PromosPageData | null>(injected ?? null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await loadPromosPage();
      if (r.ok) {
        setData(r.data);
        setFailed(false);
      } else setFailed(true);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (injected) setData(injected);
  }, [injected]);

  useEffect(() => {
    if (!open || injected) return;
    void load();
  }, [open, injected, load]);

  useEffect(() => {
    if (!open || injected || data || failed) return;
    let tries = 0;
    const t = setInterval(() => {
      tries += 1;
      if (tries > 4) clearInterval(t);
      else void load();
    }, 2500);
    return () => clearInterval(t);
  }, [open, injected, data, failed, load]);

  return { data, failed, retry: load };
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" data-promos-drawer-skeleton>
      <div className="h-4 w-3/4 animate-pulse rounded bg-neutral-200" />
      <div className="h-14 animate-pulse rounded-xl bg-neutral-100" />
      <div className="h-14 animate-pulse rounded-xl bg-neutral-100" />
    </div>
  );
}

function PromoRow({ item, copy }: { item: PromoListItem; copy: PromoCopy }) {
  const prog = progressOf(item.promo, item.used);
  const usedText = prog.max === null
    ? copy.t("card.used_open", { used: prog.used })
    : copy.t("card.used", { used: prog.used, max: prog.max });
  return (
    <li className={`${UI.card} flex min-w-0 items-center gap-3 p-3`}>
      <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusDotClass(item.status)}`} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`truncate text-[14px] font-semibold ${UI.ink}`}>{item.name}</span>
        <span className={`truncate text-[12px] ${UI.muted}`}>{usedText}</span>
      </span>
      <span className="shrink-0 rounded-full bg-[var(--tc-soft,#e6f4f1)] px-2.5 py-1 text-[12px] font-semibold text-[var(--tc-ink,#1c1c1e)]">
        {offerLabel(item.promo, copy)}
      </span>
    </li>
  );
}

export function PromosDrawer({
  open,
  onClose,
  data: injected,
}: {
  open: boolean;
  onClose: () => void;
  /** Ready-made data; when given, the server action is never called. */
  data?: PromosPageData;
}) {
  const copy = promoCopy(useDashboardLocale());
  const { data, failed, retry } = useDrawerData(open, injected);
  const active = data ? activePromos(data.promos) : [];
  const month = data?.results.month;

  const summary = data && month
    ? month.bookings > 0
      ? copy.t("drawer.summary", { bookings: month.bookings, earned: money(month.earnedCents, data.currency, copy.locale) })
      : copy.t("month.empty")
    : null;

  const newButton = (
    <Link href="/talent/promos?picker=1" onClick={onClose} className={`${UI.primary} w-full`} data-promos-drawer-new>
      {copy.t("drawer.new")}
    </Link>
  );

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" aria-describedby={undefined} className="flex w-full max-w-full flex-col gap-4 overflow-x-hidden overflow-y-auto bg-[var(--tc-canvas,#fafafa)] p-4 sm:max-w-sm" data-promos-drawer>
        <div className="flex items-center gap-2 pr-8">
          <TagIcon size={18} />
          <SheetTitle className={UI.title}>{copy.t("drawer.title")}</SheetTitle>
        </div>
        <SheetDescription className="sr-only">{copy.t("drawer.title")}</SheetDescription>

        {failed && !data ? (
          <div className="flex flex-col gap-3">
            <p role="alert" className={`${UI.card} break-words p-4 text-[14px] ${UI.ink}`}>{copy.t("page.error")}</p>
            <button type="button" className={`${UI.secondary} self-start`} onClick={() => void retry()}>{copy.t("page.retry")}</button>
          </div>
        ) : !data ? (
          <Skeleton />
        ) : (
          <>
            <p className={`break-words text-[13px] ${UI.muted}`}>{summary}</p>
            {active.length === 0 ? (
              <p className={`${UI.card} p-4 text-[14px] ${UI.ink}`}>{copy.t("drawer.empty")}</p>
            ) : (
              <section aria-label={copy.t("drawer.active")} className="flex flex-col gap-2">
                <ul className="flex flex-col gap-2">
                  {active.map((it) => <PromoRow key={it.id} item={it} copy={copy} />)}
                </ul>
              </section>
            )}
            {newButton}
            <Link href="/talent/promos" onClick={onClose} className={`self-center text-[13px] font-medium underline ${UI.muted}`} data-promos-drawer-all>
              {copy.t("drawer.all")}
            </Link>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
