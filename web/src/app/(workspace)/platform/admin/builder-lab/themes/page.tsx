/**
 * Platform HQ · Builder Lab · Designs (theme release manager, list).
 * /platform/admin/builder-lab/themes?lang=es
 *
 * Every talent design with its current catalog version, how many sites are
 * pinned to each version, and its open releases. Read-only. Super-admin gated
 * by the (workspace)/platform/admin layout AND re-checked here. No colour
 * literals (hex ratchet): Tailwind white/alpha utilities only.
 */
import Link from "next/link";
import { notFound } from "next/navigation";

import { isPlatformAdmin } from "@/lib/access/platform-role";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadDesignsOverview } from "@/lib/talent-site/theme-releases/manager/release-manager.server";

import { COPY, langOf } from "./copy";
import { DemoRebuildPanel } from "./demo-rebuild-panel";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function BuilderLabThemesPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const session = await getCachedActorSession();
  if (!isPlatformAdmin(session.profile)) notFound();
  const lang = langOf((await searchParams).lang);
  const t = COPY[lang];
  const admin = createServiceRoleClient();
  const designs = admin ? await loadDesignsOverview(admin) : [];
  const q = lang === "es" ? "?lang=es" : "";

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8 text-white">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-white/50">{t.eyebrow}</p>
          <h1 className="text-2xl font-semibold">{t.designsTitle}</h1>
          <p className="mt-1 max-w-2xl text-sm text-white/60">{t.designsLead}</p>
        </div>
        <div className="flex items-center gap-4 text-sm text-white/60">
          <Link href={lang === "es" ? "/platform/admin/builder-lab/themes" : "/platform/admin/builder-lab/themes?lang=es"} className="underline-offset-4 hover:underline">
            {lang === "es" ? "English" : "Español"}
          </Link>
          <Link href="/platform/admin/builder-lab" className="underline-offset-4 hover:underline">
            ← {t.back}
          </Link>
        </div>
      </header>

      <div className="grid gap-3">
        {designs.map((d) => (
          <section key={d.slug} className="rounded-lg border border-white/10 bg-white/5 p-4" data-design={d.slug}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-medium">
                {d.title} <span className="text-xs uppercase tracking-wider text-white/40">{d.slug}</span>
              </h2>
              <span className="text-sm text-white/70">
                {t.current}: <strong className="text-white">v{d.version}</strong>
              </span>
            </div>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wider text-white/40">{t.sitesOn}</p>
                {d.sitesByVersion.length === 0 ? (
                  <p className="mt-1 text-sm text-white/50">{t.noSites}</p>
                ) : (
                  <ul className="mt-1 flex flex-wrap gap-2 text-sm">
                    {d.sitesByVersion.map((s) => (
                      <li key={String(s.version)} className="rounded border border-white/15 px-2 py-0.5">
                        {s.version === null ? t.unpinned : `v${s.version}`}: {s.sites}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-white/40">{t.openReleases}</p>
                {d.openReleases.length === 0 ? (
                  <p className="mt-1 text-sm text-white/50">{t.noReleases}</p>
                ) : (
                  <ul className="mt-1 grid gap-1 text-sm">
                    {d.openReleases.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-2">
                        <span>
                          v{r.from_version} to v{r.to_version}
                        </span>
                        <span className="rounded bg-white/10 px-1.5 py-0.5 text-xs">{t.channel[r.channel]}</span>
                        <span className="text-xs text-white/50">
                          {t.status[r.status]} · {r.rollout_pct}%
                        </span>
                        <Link
                          href={`/platform/admin/builder-lab/themes/${r.id}${q}`}
                          className="text-white/80 underline-offset-4 hover:underline"
                        >
                          {t.open}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <DemoRebuildPanel design={d.slug} lang={lang} />
          </section>
        ))}
      </div>
    </div>
  );
}
