/**
 * Platform HQ · Builder Lab · Release (theme release manager).
 * /platform/admin/builder-lab/themes/<releaseId>?lang=es
 *
 * Item list, dry run, channel buttons and rollout for one design release.
 * Super-admin gated by the (workspace)/platform/admin layout AND re-checked
 * here. The dry run is read-only; channel changes are refused without a fresh
 * dry run (see manager/channel.ts).
 */
import Link from "next/link";
import { notFound } from "next/navigation";

import { isPlatformAdmin } from "@/lib/access/platform-role";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { dryRunIsFresh, type DryRunReport } from "@/lib/talent-site/theme-releases/manager/dry-run";
import { loadRelease } from "@/lib/talent-site/theme-releases/manager/release-manager.server";

import { COPY, langOf } from "../copy";
import { DemoRebuildPanel } from "../demo-rebuild-panel";
import { demosFor } from "@/lib/talent-site/demos/registry";
import type { DemoDesign } from "@/lib/talent-site/demos/types";
import { ReleasePanel } from "./release-panel";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function BuilderLabReleasePage({
  params,
  searchParams,
}: {
  params: Promise<{ releaseId: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const session = await getCachedActorSession();
  if (!isPlatformAdmin(session.profile)) notFound();
  const { releaseId } = await params;
  const lang = langOf((await searchParams).lang);
  const admin = createServiceRoleClient();
  const release = admin ? await loadRelease(admin, releaseId) : null;
  if (!release) notFound();
  const t = COPY[lang];
  const fresh = dryRunIsFresh(release);
  const q = lang === "es" ? "?lang=es" : "";

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-8 text-white">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-white/50">{t.eyebrow}</p>
          <h1 className="text-2xl font-semibold">
            {t.releaseTitle}: {release.design_slug} {t.versionMove} {release.from_version} to {release.to_version}
          </h1>
        </div>
        <Link href={`/platform/admin/builder-lab/themes${q}`} className="text-sm text-white/60 underline-offset-4 hover:underline">
          ← {t.designsLink}
        </Link>
      </header>
      <ReleasePanel
        lang={lang}
        release={{
          id: release.id,
          channel: release.channel,
          status: release.status,
          rolloutPct: release.rollout_pct,
          notes: { en: release.notes?.en ?? "", es: release.notes?.es ?? "" },
          items: release.items ?? [],
        }}
        report={release.dry_run_report ? (fresh.ok ? { fresh: true, data: fresh.report } : { fresh: false, data: release.dry_run_report as DryRunReport }) : null}
      />
      {demosFor(release.design_slug as DemoDesign).length > 0 ? (
        <section className="mt-8 rounded-lg border border-white/10 bg-white/5 p-4">
          <DemoRebuildPanel design={release.design_slug} lang={lang} />
        </section>
      ) : null}
    </div>
  );
}
