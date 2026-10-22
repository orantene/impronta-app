"use client";

/**
 * TUL-1474 · Settings row: "How you work with people" (the hub presets). Shows the current
 * style in plain words and links to the page where it is changed (with a confirm of what
 * changes). Owner or admin only: the server answers "not allowed" to anyone else and the row
 * then renders nothing. Separate from the "How you work" account-type card above it.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { loadWorkStyleAction } from "@/lib/server-actions/work-style";
import { choiceCopy, type WorkStyleChoice } from "@/lib/service-hub/work-style";

const UI = {
  es: { title: "Cómo trabajas con la gente", none: "Aún no lo has elegido", change: "Cambiar", choose: "Elegir", sub: "Define quién recibe las solicitudes, el precio que ve el cliente y tu parte." },
  en: { title: "How you work with people", none: "Not chosen yet", change: "Change", choose: "Choose", sub: "Sets who gets requests, the price clients see and your share." },
} as const;

export function WorkStyleSettingsRow() {
  const lang = useDashboardLocale().toLowerCase().startsWith("es") ? "es" : "en";
  const t = UI[lang];
  const pathname = usePathname() ?? "";
  const [state, setState] = useState<"loading" | "hidden" | { choice: WorkStyleChoice | null }>("loading");

  useEffect(() => {
    let cancelled = false;
    void loadWorkStyleAction().then((r) => {
      if (cancelled) return;
      // A failed read still shows the door (the page re-checks the role); only an explicit "not allowed" hides it.
      setState(r.ok ? { choice: r.choice } : r.reason === "not_allowed" ? "hidden" : { choice: null });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading" || state === "hidden") return null;
  // /<slug>/admin/... or /admin/... : the work-style page sits next to the admin root.
  const adminRoot = pathname.includes("/admin") ? pathname.slice(0, pathname.indexOf("/admin")) + "/admin" : "/admin";
  return (
    <div className="flex items-center justify-between gap-3 py-3" data-testid="work-style-settings-row">
      <div className="min-w-0">
        <p className="text-admin-13 font-medium">{t.title}</p>
        <p className="text-admin-12 text-admin-ink-muted">{state.choice ? choiceCopy(state.choice, lang).title : t.none}</p>
        <p className="text-admin-12 text-admin-ink-muted">{t.sub}</p>
      </div>
      <Link href={`${adminRoot}/work-style`} className="inline-flex min-h-[44px] shrink-0 items-center rounded-full border border-admin-line px-4 text-admin-12">
        {state.choice ? t.change : t.choose}
      </Link>
    </div>
  );
}
