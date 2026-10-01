"use client";

/**
 * Talent Template Factory: one screen, one card per TALENT design. Agency and
 * business starters never appear here. Sync goes through the talent sync action
 * (gated mode); Rebuild demos reuses the release page's DemoRebuildPanel.
 */
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import { DemoRebuildPanel } from "@/app/(workspace)/platform/admin/builder-lab/themes/demo-rebuild-panel";

import { FACTORY_COPY, type FactoryLang } from "./factory-copy";
import { HOW_TO_ADD_STEPS, parityCommandFor, releaseHref, type FactoryDesignRow, type FactoryOverview } from "./factory-model";
import { actionLoadTalentFactory, actionSyncTalentCatalog, type TalentSyncJson } from "./talent-factory-actions";

const btn =
  "rounded border border-white/30 px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40";
const link = "text-white/80 underline underline-offset-4 hover:text-white";

export function TalentFactoryTab({
  locale,
  initial,
  onOpenBuilder,
}: {
  locale?: string;
  /** Pre-loaded data (tests); when omitted the tab loads through the gated action. */
  initial?: FactoryOverview;
  onOpenBuilder?: (profileCode: string | null, slug: string) => void;
}) {
  const [lang, setLang] = useState<FactoryLang>(locale === "es" ? "es" : "en");
  const t = FACTORY_COPY[lang];
  const [data, setData] = useState<FactoryOverview | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [syncJson, setSyncJson] = useState<TalentSyncJson | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (initial) return;
    let live = true;
    void actionLoadTalentFactory().then((res) => {
      if (!live) return;
      if (res.ok) setData(res.data);
      else setError(res.error);
    });
    return () => {
      live = false;
    };
  }, [initial]);

  function runSync() {
    setError(null);
    start(async () => {
      const res = await actionSyncTalentCatalog();
      if (!res.ok) return setError(res.error || t.error);
      setSyncJson(res.data);
      const fresh = await actionLoadTalentFactory();
      if (fresh.ok) setData(fresh.data);
    });
  }

  return (
    <div className="text-white" data-talent-factory>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t.title}</h2>
          <p className="mt-1 max-w-2xl text-sm text-white/60">{t.lead}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btn} onClick={() => setLang(lang === "en" ? "es" : "en")}>
            {t.language}
          </button>
          <button type="button" className={`${btn} bg-white/15 font-medium`} disabled={pending} onClick={runSync}>
            {pending ? t.syncing : t.sync}
          </button>
        </div>
      </header>
      <p className="mb-3 text-xs text-white/50">{t.syncLead}</p>

      {error ? (
        <p role="alert" className="mb-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}
      {syncJson ? (
        <div className="mb-4" data-sync-result>
          <p className="mb-1 text-xs uppercase tracking-wider text-white/40">{t.syncResult}</p>
          <pre className="overflow-x-auto rounded border border-white/10 bg-white/5 p-3 text-xs">{JSON.stringify(syncJson, null, 2)}</pre>
        </div>
      ) : null}

      {!data ? <p className="text-sm text-white/60">{t.loading}</p> : null}
      <div className="grid gap-3">
        {data?.rows.map((row) => (
          <DesignCard key={row.slug} row={row} lang={lang} mockupMode={data.mockupMode} onOpenBuilder={onOpenBuilder} />
        ))}
      </div>

      <section className="mt-6 rounded-lg border border-white/10 bg-white/5 p-4" data-how-to-add>
        <h3 className="text-sm font-medium">{t.howTitle}</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-white/70">
          {HOW_TO_ADD_STEPS.map((s) => (
            <li key={s}>{t.steps[s]}</li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-white/50">{t.fullGuide}</p>
      </section>
    </div>
  );
}

function DesignCard({
  row,
  lang,
  mockupMode,
  onOpenBuilder,
}: {
  row: FactoryDesignRow;
  lang: FactoryLang;
  mockupMode: FactoryOverview["mockupMode"];
  onOpenBuilder?: (profileCode: string | null, slug: string) => void;
}) {
  const t = FACTORY_COPY[lang];
  const cmd = parityCommandFor(row.slug);
  const [copied, setCopied] = useState(false);
  function copyCmd() {
    try {
      void navigator.clipboard.writeText(cmd);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <section className="rounded-lg border border-white/10 bg-white/5 p-4" data-factory-design={row.slug}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-medium">
          {row.title} <span className="text-xs uppercase tracking-wider text-white/40">{row.slug}</span>
        </h3>
        <span className="rounded bg-white/10 px-2 py-0.5 text-xs" data-status={row.status}>
          {t.status[row.status]}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <div>
          <dt className="text-xs text-white/40">{t.catalogVersion}</dt>
          <dd>{row.catalogVersion === null ? "-" : `v${row.catalogVersion}`}</dd>
        </div>
        <div>
          <dt className="text-xs text-white/40">{t.codeVersion}</dt>
          <dd>{`v${row.codeVersion}`}</dd>
        </div>
        <div>
          <dt className="text-xs text-white/40">{t.demos}</dt>
          <dd>{row.demoCount}</dd>
        </div>
        <div>
          <dt className="text-xs text-white/40">{t.gallery}</dt>
          <dd>{row.galleryVisible ? t.yes : t.no}</dd>
        </div>
      </dl>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <li>
          {row.latestReleaseId ? (
            <Link href={releaseHref(row.latestReleaseId, lang)} className={link}>
              {t.openReleases}
            </Link>
          ) : (
            <span className="text-white/40">{t.noRelease}</span>
          )}
        </li>
        <li>
          <a href={row.previewHref} target="_blank" rel="noreferrer" className={link}>
            {t.previewCode}
          </a>
        </li>
        <li className="text-white/70">
          {t.mockup}: <code className="text-xs">{row.mockupPath}</code> ({t.parityMap}: {row.parityMapPresent ? t.present : t.missing})
        </li>
      </ul>

      {row.authored && row.editHref ? (
        <div className="mt-3" data-edit-authored>
          <Link href={row.editHref} className={link}>
            {t.editDesign}
          </Link>
        </div>
      ) : null}

      {onOpenBuilder && !row.authored ? (
        <div className="mt-3" data-open-builder>
          <button type="button" className={btn} onClick={() => onOpenBuilder(row.referenceDemoCode, row.slug)}>
            {t.openBuilder}
            {row.referenceDemoCode ? ` (${row.referenceDemoCode})` : ` (${t.noReference})`}
          </button>
          <p className="mt-1 max-w-3xl text-xs text-white/50">{t.builderNote(row.referenceDemoCode)}</p>
        </div>
      ) : null}

      <div className="mt-4 border-t border-white/10 pt-3" data-mockup-comparison>
        <p className="text-xs uppercase tracking-wider text-white/40">{t.lastComparison}</p>
        {mockupMode === "production" ? (
          <p className="mt-1 text-sm text-white/60">{t.productionHint}</p>
        ) : row.mockupRun ? (
          <div className="mt-1 text-sm text-white/70">
            <p>
              {row.mockupRun.timestamp} · {t.openDeltas}: {row.mockupRun.openDeltas}
            </p>
            <p className="text-xs text-white/60">
              {t.layers}:{" "}
              {Object.entries(row.mockupRun.deltasByLayer)
                .map(([l, n]) => `${l} ${n}`)
                .join(", ")}
            </p>
            <p className="text-xs text-white/60">
              {t.report}: <code>{row.mockupRun.reportPath}</code>
            </p>
          </div>
        ) : (
          <p className="mt-1 text-sm text-white/60">{t.noRun}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="rounded bg-white/10 px-2 py-1 text-xs">{cmd}</code>
          <button type="button" className={btn} onClick={copyCmd}>
            {copied ? t.copied : t.copy}
          </button>
        </div>
      </div>

      {row.canRebuild ? <DemoRebuildPanel design={row.slug} lang={lang} /> : null}
    </section>
  );
}
