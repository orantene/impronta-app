// Platform Admin: Changelog sync (TUL-1391). super_admin is enforced by the admin
// layout; the action re-checks. No client JS: a plain form posts to the action.

import { syncChangelogNowAction } from "./actions";
import { changelogSyncStatusLine, loadChangelogSyncStatus, type SyncResultCode } from "./sync-status";
import { getRequestLocale } from "@/i18n/request-locale";
import { pickLocale } from "@/lib/i18n/pick-locale";

import { HQ } from "../tenants/hq-kit";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function PlatformChangelogPage({ searchParams }: Props) {
  const locale = await getRequestLocale();
  const sp = await searchParams;
  const status = await loadChangelogSyncStatus();
  const line = changelogSyncStatusLine(
    {
      result: (one(sp.result) as SyncResultCode | undefined) ?? null,
      synced: Number(one(sp.synced) ?? NaN),
      removed: Number(one(sp.removed) ?? NaN),
      errors: Number(one(sp.errors) ?? NaN),
    },
    locale === "es" ? "es" : "en",
  );
  const t = pickLocale(locale, {
    en: {
      title: "Changelog sync",
      body: "Copies Published release entries from Notion to the public changelog. It also runs every 15 minutes, and the Publish now button in Notion triggers it too.",
      published: "Published entries",
      last: "Last sync",
      never: "Never",
      button: "Sync changelog now",
    },
    es: {
      title: "Sincronizar novedades",
      body: "Copia las entradas publicadas de Notion al changelog público. También corre cada 15 minutos, y el botón Publicar ahora de Notion lo dispara.",
      published: "Entradas publicadas",
      last: "Última sincronización",
      never: "Nunca",
      button: "Sincronizar ahora",
    },
  });

  return (
    <div style={{ maxWidth: 720, color: HQ.ink, fontFamily: '"Inter", system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{t.title}</h1>
      <p style={{ color: HQ.inkMuted, fontSize: 14, lineHeight: 1.6, marginTop: 8 }}>{t.body}</p>

      <div style={{ background: HQ.card, border: `1px solid ${HQ.border}`, borderRadius: 14, padding: 20, marginTop: 20 }}>
        <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "8px 20px", margin: 0, fontSize: 14 }}>
          <dt style={{ color: HQ.inkMuted }}>{t.published}</dt>
          <dd style={{ margin: 0 }}>{status.count ?? "?"}</dd>
          <dt style={{ color: HQ.inkMuted }}>{t.last}</dt>
          <dd style={{ margin: 0 }}>{status.lastSyncedAt ? status.lastSyncedAt.replace("T", " ").slice(0, 16) + " UTC" : t.never}</dd>
        </dl>
        <form action={syncChangelogNowAction} style={{ marginTop: 16 }}>
          <button
            type="submit"
            style={{ background: HQ.green, color: HQ.bg, border: 0, borderRadius: 10, padding: "10px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            {t.button}
          </button>
        </form>
        {line ? (
          <p role="status" style={{ marginTop: 14, fontSize: 14, color: line.ok ? HQ.green : HQ.red }}>
            {line.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}
