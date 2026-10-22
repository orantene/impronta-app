"use client";

/**
 * TUL-1372: the workspace's roster services inside the Services widget band.
 * Request links until the listing checkout reader exists (TUL-1471b: an instant entry books in the
 * widget instead, "Reservar"): each card shows the
 * talent (or the workspace label), the price or "From", and a Request link to
 * the contact form with the service prefilled. The Service and Who filters are
 * client-side over the entries already loaded.
 */
import { useMemo, useState } from "react";

import { filterRosterEntries, rosterGridFilters, type RosterGridEntry } from "@/lib/service-hub/roster-grid";

const COPY = {
  en: { heading: "From our team", service: "Service", who: "Who", all: "All", request: "Request", book: "Book", none: "Nothing matches these filters." },
  es: { heading: "De nuestro equipo", service: "Servicio", who: "Quién", all: "Todos", request: "Solicitar", book: "Reservar", none: "Nada coincide con estos filtros." },
} as const;

export function RosterServicesGrid({ entries, locale }: { entries: readonly RosterGridEntry[]; locale: string }) {
  const t = locale.toLowerCase().startsWith("es") ? COPY.es : COPY.en;
  const [service, setService] = useState("");
  const [who, setWho] = useState("");
  const filters = useMemo(() => rosterGridFilters(entries), [entries]);
  const shown = useMemo(() => filterRosterEntries(entries, { service, who }), [entries, service, who]);
  if (entries.length === 0) return null;
  const showFilters = filters.services.length > 1 || filters.who.length > 1;
  return (
    <div className="site-builder-node--roster-services" data-roster-services="" style={{ marginTop: 24 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 18 }}>{t.heading}</h3>
      {showFilters ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }} data-roster-filters="">
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
            {t.service}
            <select value={service} onChange={(e) => setService(e.target.value)} data-roster-filter="service">
              <option value="">{t.all}</option>
              {filters.services.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
            {t.who}
            <select value={who} onChange={(e) => setWho(e.target.value)} data-roster-filter="who">
              <option value="">{t.all}</option>
              {filters.who.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      {shown.length === 0 ? (
        <p style={{ margin: 0, fontSize: 14 }}>{t.none}</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          {shown.map((e) => (
            <li key={e.id} data-roster-card="" style={{ border: "1px solid rgba(24,24,27,0.12)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
              <strong>{e.title}</strong>
              <span style={{ fontSize: 13, opacity: 0.7 }}>{e.who}</span>
              <span style={{ fontSize: 14, fontVariantNumeric: "tabular-nums" }}>{e.price}</span>
              <a href={e.href} style={{ marginTop: 4, alignSelf: "flex-start", border: "1px solid rgba(24,24,27,0.2)", borderRadius: 8, padding: "6px 12px", fontSize: 14 }}>{e.cta === "book" ? t.book : t.request}</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
