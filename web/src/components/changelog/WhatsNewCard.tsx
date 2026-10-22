import { cookies } from "next/headers";

import { dismissWhatsNewAction } from "@/lib/changelog/whats-new-actions";
import {
  dismissCookieName,
  loadWhatsNewRows,
  parseDismissedMs,
  selectWhatsNew,
  type WhatsNewViewer,
} from "@/lib/changelog/whats-new";
import { getRequestLocale } from "@/i18n/request-locale";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { logServerError } from "@/lib/server/safe-error";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";

/**
 * TUL-1395: the "What's new" card on the PRIVATE talent and business dashboards.
 * A server component with no client JS (the dismiss button is a plain form), so it adds
 * nothing to the admin bundle. It is mounted only from those two dashboard pages and never
 * from a public talent or agency site, so white-label clients never see Tulala news.
 *
 * Fixed to the bottom-right corner above the support launcher, so it cannot disturb the
 * shell layout whichever way the shell hosts its children.
 */

type Props =
  | { kind: "talent" }
  | { kind: "business"; tenantId: string };

async function viewerPlan(props: Props, userId: string): Promise<"free" | "paid"> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return "free";
    if (props.kind === "talent") {
      const { data, error } = await admin
        .from("talent_profiles")
        .select("talent_plan_key")
        .eq("user_id", userId)
        .limit(1);
      if (error) {
        logServerError("whats-new.talent-plan", error);
        return "free";
      }
      const key = (data?.[0] as { talent_plan_key?: string | null } | undefined)?.talent_plan_key ?? null;
      return key && key !== "talent_basic" ? "paid" : "free";
    }
    const { data, error } = await admin.from("agencies").select("plan_tier").eq("id", props.tenantId).maybeSingle();
    if (error) {
      logServerError("whats-new.business-plan", error);
      return "free";
    }
    const tier = (data as { plan_tier?: string | null } | null)?.plan_tier ?? "free";
    return tier && tier !== "free" ? "paid" : "free";
  } catch (err) {
    logServerError("whats-new.plan", err);
    return "free";
  }
}

export async function WhatsNewCard(props: Props) {
  const session = await getCachedActorSession();
  if (!session.user) return null;
  const locale = (await getRequestLocale()) === "es" ? "es" : "en";
  const jar = await cookies();
  const dismissed = parseDismissedMs(jar.get(dismissCookieName(session.user.id))?.value);

  const viewer: WhatsNewViewer = {
    audiences: props.kind === "talent" ? ["Talent"] : ["Business", "Agency", "Workspace"],
    plan: await viewerPlan(props, session.user.id),
    locale,
  };
  const items = selectWhatsNew(await loadWhatsNewRows(), viewer, dismissed);
  if (items.length === 0) return null;

  const es = locale === "es";
  const t = es
    ? { title: "Novedades", tryIt: "Probar", all: "Ver todo", dismiss: "Cerrar", unread: "Hay novedades sin leer" }
    : { title: "What's new", tryIt: "Try it", all: "See all", dismiss: "Dismiss", unread: "Unread updates" };
  const base = `https://${PLATFORM_BRAND.domain}`;
  const allHref = es ? `${base}/es/novedades` : `${base}/changelog`;
  const top = items[0];
  const tryHref = top.helpUrl ?? (es ? `${base}/es/novedades/${top.id}` : `${base}/changelog/${top.id}`);
  const newest = Math.max(...items.map((i) => i.publishedMs));

  return (
    <aside
      aria-label={t.title}
      data-testid="whats-new-card"
      style={{
        position: "fixed",
        right: 16,
        bottom: 88,
        zIndex: 40,
        width: "min(340px, calc(100vw - 32px))",
        background: "var(--color-admin-surface, #fff)",
        color: "var(--color-admin-ink, #1a1a17)",
        border: "1px solid rgba(0,0,0,0.12)",
        borderRadius: 14,
        boxShadow: "0 8px 28px rgba(0,0,0,0.14)",
        padding: 14,
        fontFamily: '"Inter", system-ui, sans-serif',
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span role="img" aria-label={t.unread} style={{ width: 8, height: 8, borderRadius: 999, background: "#e5484d", flexShrink: 0 }} />
        <strong style={{ fontSize: 13, flex: 1 }}>{t.title}</strong>
        <form action={dismissWhatsNewAction}>
          <input type="hidden" name="upTo" value={String(newest)} />
          <button type="submit" aria-label={t.dismiss} style={{ border: 0, background: "transparent", cursor: "pointer", fontSize: 18, lineHeight: 1, color: "inherit", padding: 4 }}>
            ×
          </button>
        </form>
      </div>
      {top.coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- small remote changelog image
        <img src={top.coverImageUrl} alt="" loading="lazy" style={{ width: "100%", borderRadius: 10, marginTop: 10, maxHeight: 120, objectFit: "cover" }} />
      ) : null}
      <p style={{ margin: "10px 0 0", fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{top.title}</p>
      {top.summary ? <p style={{ margin: "4px 0 0", fontSize: 13, lineHeight: 1.45, opacity: 0.75 }}>{top.summary}</p> : null}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
        <a href={tryHref} style={{ background: "#1a1a17", color: "#fff", borderRadius: 999, padding: "7px 14px", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
          {t.tryIt}
        </a>
        <a href={allHref} style={{ fontSize: 13, color: "inherit", textDecoration: "underline" }}>
          {t.all}
        </a>
      </div>
    </aside>
  );
}
