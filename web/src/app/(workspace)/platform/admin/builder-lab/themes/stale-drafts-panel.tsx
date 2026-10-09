"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { localizeBuilderLabError } from "@/lib/talent-site/theme-releases/builder-lab-errors";
import type { FirstPublishSummary, StaleDraftRow } from "@/lib/talent-site/theme-template/stale-drafts";
import { STALE_DRAFTS_COPY } from "@/lib/talent-site/theme-template/stale-drafts-copy";
import { themeTemplateEditHref } from "@/lib/talent-site/theme-template/types";

import {
  actionDiscardDesignDraft,
  actionFirstPublishDryRun,
  actionPublishDesignAndUpdateDemos,
} from "../talent-designs/publish-actions";
import { ConfirmDialog } from "./[releaseId]/confirm-dialog";
import type { Lang } from "./copy";

const btn =
  "rounded border border-white/30 px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40";

type Pending = { kind: "publish" | "discard"; row: StaleDraftRow };

/** Publishing is offered only where the draft holds design changes on the newest snapshot. */
function canPublish(r: StaleDraftRow): boolean {
  return r.differs && (r.designChanges ?? 0) > 0 && r.reason !== "behind-latest" && r.reason !== "no-base";
}

/** Super-admin list of open factory drafts with publish-to-demos and discard. */
export function StaleDraftsPanel({ rows: initial, lang }: { rows: StaleDraftRow[]; lang: Lang }) {
  const t = STALE_DRAFTS_COPY[lang];
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [pending, setPending] = useState<Pending | null>(null);
  const [summaries, setSummaries] = useState<Record<string, FirstPublishSummary>>({});
  const [busy, startTransition] = useTransition();
  const [busyDesign, setBusyDesign] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function review(design: string) {
    setError(null);
    setBusyDesign(design);
    startTransition(async () => {
      const res = await actionFirstPublishDryRun(design);
      setBusyDesign(null);
      if (res.ok) setSummaries((s) => ({ ...s, [design]: res.data }));
      else setError(res.error ? localizeBuilderLabError(res.error, lang, res.errorEs) : t.genericError);
    });
  }

  function run(p: Pending) {
    setPending(null);
    setError(null);
    setNotice(null);
    setBusyDesign(p.row.design);
    startTransition(async () => {
      if (p.kind === "discard") {
        const res = await actionDiscardDesignDraft(p.row.design, p.row.rev);
        setBusyDesign(null);
        if (res.ok) {
          setRows((all) => all.filter((r) => r.design !== p.row.design));
          setNotice(t.discarded(p.row.design));
          router.refresh();
        } else setError(res.error ? localizeBuilderLabError(res.error, lang) : t.genericError);
        return;
      }
      const res = await actionPublishDesignAndUpdateDemos(p.row.design, p.row.rev);
      setBusyDesign(null);
      if (res.ok) {
        setRows((all) => all.filter((r) => r.design !== p.row.design));
        setNotice(t.published(p.row.design, res.data.version, res.data.demosApplied));
        router.refresh();
      } else setError(res.error ? localizeBuilderLabError(res.error, lang, res.errorEs) : t.genericError);
    });
  }

  return (
    <section className="mb-6 rounded-lg border border-white/10 bg-white/5 p-4" data-stale-drafts>
      <ConfirmDialog
        open={pending !== null}
        message={pending ? (pending.kind === "publish" ? t.confirmPublish(pending.row.design) : t.confirmDiscard(pending.row.design)) : ""}
        confirmLabel={t.confirmYes}
        cancelLabel={t.confirmCancel}
        onConfirm={() => pending && run(pending)}
        onCancel={() => setPending(null)}
      />
      <h2 className="text-lg font-medium">{t.title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-white/60">{t.lead}</p>

      {notice ? (
        <p role="status" className="mt-3 text-sm text-white/80">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? <p className="mt-3 text-sm text-white/60">{t.empty}</p> : null}

      <ul className="mt-3 grid gap-3">
        {rows.map((r) => {
          const summary = summaries[r.design];
          const working = busy && busyDesign === r.design;
          const publishBlocked = !canPublish(r) || (r.needsDryRun && !summary);
          return (
            <li key={r.design} className="rounded border border-white/10 p-3" data-stale-draft={r.design}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">
                  {r.design}{" "}
                  <span className="text-xs font-normal text-white/50">
                    {t.age(r.ageDays)}
                    {r.stale ? ` · ${t.stale}` : ""} · {t.base(r.baseVersion, r.latestSnapshot)}
                  </span>
                </p>
                <span className="rounded bg-white/10 px-2 py-0.5 text-xs" data-recommended={r.action}>
                  {t.action[r.action]}
                </span>
              </div>
              <p className="mt-1 text-sm text-white/60">
                {t.sites(r.realSites, r.demoSites)}
                {r.releaseRows === 0 ? ` · ${t.noRelease}` : ""}
              </p>
              <p className="mt-1 text-sm text-white/70">{t.reason[r.reason]}</p>
              {r.action === "delete-candidate" ? <p className="mt-1 text-xs text-white/50">{t.deleteNote}</p> : null}

              {r.needsDryRun ? (
                <div className="mt-3 rounded border border-white/20 bg-white/5 p-3" data-first-publish={r.design}>
                  <p role="note" className="text-sm font-medium text-white">
                    {t.dryRunBanner(r.design, r.realSites)}
                  </p>
                  {summary ? (
                    <div className="mt-2 text-sm text-white/80">
                      <p className="text-white/60">{t.dryRunNotOpened}</p>
                      <p className="mt-2 text-xs uppercase tracking-wider text-white/40">{t.dryRunPins}</p>
                      <ul className="mt-1 flex flex-wrap gap-2">
                        {summary.sitesByVersion.map((s) => (
                          <li key={String(s.version)} className="rounded border border-white/15 px-2 py-0.5">
                            {s.version === null ? "-" : `v${s.version}`}: {s.sites}
                          </li>
                        ))}
                      </ul>
                      {summary.pinsWithoutSnapshot.length > 0 ? (
                        <p className="mt-2 text-white/60">
                          {t.dryRunNoBase(summary.pinsWithoutSnapshot.map((v) => `v${v}`).join(", "))}
                        </p>
                      ) : null}
                      <p className="mt-2 font-medium">
                        {summary.itemCount === 0 ? t.dryRunNoItems : t.dryRunItems(summary.itemCount)}
                      </p>
                      <ul className="mt-1 grid gap-0.5 text-white/70">
                        {summary.items.map((i) => (
                          <li key={`${i.type}:${i.key}`}>
                            <span className="text-white/40">{i.type}</span> {i.key}
                          </li>
                        ))}
                      </ul>
                      {summary.contentOnly.length > 0 ? (
                        <p className="mt-2 text-xs text-white/50">
                          {t.dryRunContentOnly}: {summary.contentOnly.join(", ")}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <button type="button" className={btn} disabled={busy} onClick={() => review(r.design)}>
                        {working ? t.dryRunLoading : t.dryRunButton}
                      </button>
                      <span className="text-xs text-white/50">{t.dryRunNeeded}</span>
                    </div>
                  )}
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`${btn} bg-white/15 font-medium`}
                  disabled={busy || publishBlocked}
                  onClick={() => setPending({ kind: "publish", row: r })}
                >
                  {working ? t.working : t.publishDemos}
                </button>
                <button type="button" className={btn} disabled={busy} onClick={() => setPending({ kind: "discard", row: r })}>
                  {t.discard}
                </button>
                <Link href={themeTemplateEditHref(r.design, { lang })} className={`${btn} no-underline`}>
                  {t.edit}
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
