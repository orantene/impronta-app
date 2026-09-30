"use client";

import { useState } from "react";

import type { DryRunReport, SiteDryRunResult } from "@/lib/talent-site/theme-releases/manager/dry-run";

import { COPY, type Lang } from "../copy";

function Tile({ label, value, tone }: { label: string; value: number; tone?: "warn" | "bad" }) {
  return (
    <div
      className={`rounded border px-3 py-2 ${
        tone === "bad" ? "border-red-300/40 bg-red-400/10" : tone === "warn" ? "border-white/30 bg-white/10" : "border-white/10 bg-white/5"
      }`}
    >
      <div className="text-xl font-semibold">{value}</div>
      <div className="text-xs text-white/60">{label}</div>
    </div>
  );
}

function Row({ site, lang }: { site: SiteDryRunResult; lang: Lang }) {
  const t = COPY[lang];
  const [open, setOpen] = useState(false);
  const detail = site.kept.length + site.conflicts.length > 0 || site.error;
  return (
    <li className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm" data-site={site.profileCode}>
      <button
        type="button"
        className="flex w-full flex-wrap items-center gap-2 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        disabled={!detail}
      >
        <strong>{site.displayName}</strong>
        <span className="text-xs text-white/50">{site.profileCode}</span>
        {site.isDemo ? <span className="rounded bg-white/15 px-1.5 text-xs">{t.demoTag}</span> : null}
        <span className="text-xs text-white/50">v{site.pinnedVersion ?? "?"}</span>
        {!site.isDemo && site.noBase ? <span className="text-xs text-white/60">{t.noBaseTag}</span> : null}
        <span className="ml-auto text-xs">
          {site.status === "auto"
            ? t.auto
            : site.status === "clean"
              ? t.clean
              : site.status === "kept"
                ? t.kept
                : site.status === "conflicts"
                  ? t.conflicts
                  : t.errors}
          {` · ${site.counts.applied}/${site.counts.kept}/${site.counts.conflicts}`}
        </span>
      </button>
      {open ? (
        <ul className="mt-2 grid gap-1 text-xs text-white/70">
          {site.error ? <li>{site.error}</li> : null}
          {site.conflicts.map((c, i) => (
            <li key={`c${i}`}>
              {t.conflictWhat}: {c.key}
              {c.prop ? ` (${c.prop})` : ""}
            </li>
          ))}
          {site.kept.map((c, i) => (
            <li key={`k${i}`}>
              {t.keptWhat}: {c.key}
              {c.prop ? ` (${c.prop})` : ""}
              {c.reason ? `, ${c.reason}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function DryRunView({ report, lang, stale }: { report: DryRunReport; lang: Lang; stale: boolean }) {
  const t = COPY[lang];
  const s = report.summary;
  return (
    <div>
      {stale ? <p className="mb-2 text-sm text-white/80">{t.dryStale}</p> : null}
      {s.noBase > 0 ? (
        <p className="mb-2 text-sm text-white/80">
          {s.noBase} {t.noBase}
        </p>
      ) : null}
      <p className="mb-2 text-xs text-white/50">
        {t.dryAt}: {new Date(report.generatedAt).toLocaleString(lang === "es" ? "es-MX" : "en-US")}
      </p>
      <p className="mb-1 text-xs uppercase tracking-wider text-white/40">{t.demosRow}</p>
      <p className="mb-2 text-xs text-white/60">{t.demosAutoLead}</p>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <Tile label={t.total} value={s.demos.total} />
        <Tile label={t.auto} value={s.demos.auto ?? 0} />
        <Tile label={t.errors} value={s.demos.errors} tone={s.demos.errors > 0 ? "bad" : undefined} />
      </div>
      <p className="mb-1 text-xs uppercase tracking-wider text-white/40">{t.talentsRow}</p>
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
        <Tile label={t.total} value={s.total - s.demos.total} />
        <Tile label={t.clean} value={s.clean} />
        <Tile label={t.kept} value={s.kept} tone="warn" />
        <Tile label={t.conflicts} value={s.conflicts} tone={s.conflicts > 0 ? "warn" : undefined} />
        <Tile label={t.errors} value={s.errors - s.demos.errors} tone={s.errors - s.demos.errors > 0 ? "bad" : undefined} />
      </div>
      <p className="mb-1 text-xs uppercase tracking-wider text-white/40">{t.drill}</p>
      <ul className="grid gap-1">
        {report.sites.map((site) => (
          <Row key={site.siteId} site={site} lang={lang} />
        ))}
      </ul>
    </div>
  );
}
