/**
 * Platform HQ · Suggested service prices (TUL-633)
 * /platform/admin/price-suggestions
 *
 * What a talent charges HER clients, used to pre-fill signup ("Suggested, tap to change").
 * Drafts are invisible to the product until approved here. Super-admin gated.
 */

import { notFound } from "next/navigation";

import { getRequestLocale } from "@/i18n/request-locale";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { saveSuggestionAction } from "./actions";

export const dynamic = "force-dynamic";

type Row = {
  id: string; country_code: string; service_key: string; currency: string;
  amount_minor: number; duration_minutes: number | null; status: "draft" | "approved"; source_note: string | null;
};

const COPY = {
  en: { title: "Suggested service prices", intro: "Prices a talent charges her own clients, shown at signup as a suggestion she can change. Only approved rows go live.", service: "Service", price: "Price", minutes: "Minutes", status: "Status", draft: "Draft", approved: "Approved", save: "Save", basis: "Basis", none: "No rows yet." },
  es: { title: "Precios sugeridos de servicios", intro: "Precios que un talento cobra a sus propios clientes, mostrados al registrarse como sugerencia que puede cambiar. Solo las filas aprobadas se publican.", service: "Servicio", price: "Precio", minutes: "Minutos", status: "Estado", draft: "Borrador", approved: "Aprobado", save: "Guardar", basis: "Base", none: "Aún no hay filas." },
} as const;

export default async function PriceSuggestionsPage() {
  const session = await getCachedActorSession();
  if (!isPlatformAdmin(session.profile)) notFound();
  const locale = await getRequestLocale();
  const t = locale === "es" ? COPY.es : COPY.en;
  const db = createServiceRoleClient();
  const { data } = db
    ? await db.from("service_price_suggestions").select("*").order("country_code").order("service_key")
    : { data: [] as Row[] };
  const rows = (data ?? []) as Row[];
  const byCountry = new Map<string, Row[]>();
  for (const r of rows) byCountry.set(r.country_code, [...(byCountry.get(r.country_code) ?? []), r]);
  const names = new Intl.DisplayNames([locale === "es" ? "es" : "en"], { type: "region" });

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-white">{t.title}</h1>
        <p className="max-w-2xl text-sm text-white/60">{t.intro}</p>
      </header>
      {rows.length === 0 && <p className="text-sm text-white/60">{t.none}</p>}
      {[...byCountry.entries()].map(([cc, list]) => (
        <section key={cc} className="space-y-2">
          <h2 className="text-sm font-medium text-white">{names.of(cc) ?? cc} <span className="text-white/40">({cc})</span></h2>
          <div className="divide-y divide-white/10 rounded-lg border border-white/10">
            {list.map((r) => (
              <form key={r.id} action={saveSuggestionAction} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm text-white/80">
                <input type="hidden" name="id" value={r.id} />
                <span className="min-w-48 flex-1" title={r.source_note ?? undefined}>{r.service_key}</span>
                <label className="flex items-center gap-1">
                  <span className="sr-only">{t.price}</span>
                  <input name="amount" inputMode="decimal" defaultValue={(r.amount_minor / 100).toString()} className="w-24 rounded border border-white/15 bg-transparent px-2 py-1" />
                  <span className="text-white/50">{r.currency}</span>
                </label>
                <label className="flex items-center gap-1">
                  <span className="sr-only">{t.minutes}</span>
                  <input name="duration" inputMode="numeric" defaultValue={r.duration_minutes ?? ""} className="w-16 rounded border border-white/15 bg-transparent px-2 py-1" />
                  <span className="text-white/50">min</span>
                </label>
                <label className="sr-only" htmlFor={`s-${r.id}`}>{t.status}</label>
                <select id={`s-${r.id}`} name="status" defaultValue={r.status} className="rounded border border-white/15 bg-transparent px-2 py-1">
                  <option value="draft" className="text-black">{t.draft}</option>
                  <option value="approved" className="text-black">{t.approved}</option>
                </select>
                <button type="submit" className="rounded border border-white/20 px-3 py-1 text-white hover:bg-white/10">{t.save}</button>
              </form>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
