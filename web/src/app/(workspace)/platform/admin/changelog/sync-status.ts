import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

/** What the Sync changelog now page shows (TUL-1391). Pure line builder + one read. */

export type SyncResultCode = "ok" | "partial" | "failed" | "forbidden" | "no_notion" | "no_db";

export type SyncOutcome = {
  result: SyncResultCode | null;
  synced: number;
  removed: number;
  errors: number;
};

const KNOWN: readonly string[] = ["ok", "partial", "failed", "forbidden", "no_notion", "no_db"];

export function changelogSyncStatusLine(
  o: SyncOutcome,
  lang: "en" | "es",
): { ok: boolean; text: string } | null {
  if (!o.result || !KNOWN.includes(o.result)) return null;
  const n = (v: number) => (Number.isFinite(v) ? v : 0);
  const es = lang === "es";
  switch (o.result) {
    case "ok":
      return {
        ok: true,
        text: es
          ? `Listo. ${n(o.synced)} actualizadas, ${n(o.removed)} quitadas.`
          : `Done. ${n(o.synced)} updated, ${n(o.removed)} removed.`,
      };
    case "partial":
      return {
        ok: false,
        text: es
          ? `Terminó con ${n(o.errors)} errores. ${n(o.synced)} actualizadas.`
          : `Finished with ${n(o.errors)} errors. ${n(o.synced)} updated.`,
      };
    case "no_notion":
      return {
        ok: false,
        text: es ? "Falta la conexión con Notion en el servidor." : "The Notion connection is not set up on the server.",
      };
    case "no_db":
      return { ok: false, text: es ? "La base de datos no está disponible." : "The database is not available." };
    case "forbidden":
      return { ok: false, text: es ? "Solo para administradores de la plataforma." : "Platform admins only." };
    default:
      return { ok: false, text: es ? "La sincronización falló. Intenta de nuevo." : "The sync failed. Try again." };
  }
}

export async function loadChangelogSyncStatus(): Promise<{ count: number | null; lastSyncedAt: string | null }> {
  const admin = createServiceRoleClient();
  if (!admin) return { count: null, lastSyncedAt: null };
  const { data, error, count } = await admin
    .from("changelog_entries")
    .select("synced_at", { count: "exact" })
    .eq("status", "published")
    .order("synced_at", { ascending: false })
    .limit(1);
  if (error) {
    logServerError("platform.changelog.status", error);
    return { count: null, lastSyncedAt: null };
  }
  const last = (data?.[0] as { synced_at?: string } | undefined)?.synced_at ?? null;
  return { count: count ?? 0, lastSyncedAt: last };
}
