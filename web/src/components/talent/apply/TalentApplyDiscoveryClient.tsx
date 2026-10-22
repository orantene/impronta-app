"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useDashboardLocale } from "@/i18n/use-dashboard-locale";

import {
  submitAgencyApplication,
  submitHubApplication,
  withdrawOwnApplication,
} from "@/lib/talent/apply-actions";
import type {
  OpenApplicableAgency,
  TalentApplicationRow,
} from "@/lib/talent/apply-loaders";

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.6)",
  border:     "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  cardBg:     "#ffffff",
  surface:    "rgba(11,11,13,0.02)",
  accent:     "#0F4F3E",
  green:      "#2E7D5B",
  amber:      "#B45309",
  rust:       "#C04B23",
} as const;

const COPY = {
  view: { en: "View studio", es: "Ver estudio" },
  terms: { en: "Terms you propose (optional)", es: "Condiciones que propones (opcional)" },
  termsHint: { en: "For example: I keep 80% of each booking and the studio takes 20%.", es: "Por ejemplo: me quedo con el 80% de cada reserva y el estudio con el 20%." },
  termsPrefix: { en: "Proposed terms", es: "Condiciones propuestas" },
  submitted: { en: "Application submitted.", es: "Solicitud enviada." },
  withdrawn: { en: "Withdrawn.", es: "Retirada." },
  eyebrow: { en: "Discover", es: "Descubrir" },
  title: { en: "Apply to agencies & hubs", es: "Postula a agencias y hubs" },
  intro: {
    en: "Open opportunities at agencies and hubs that accept applications. We hide ones you're already on, ones you've already applied to, and (when applicable) everything else while you're under an exclusive relationship.",
    es: "Oportunidades abiertas en agencias y hubs que reciben solicitudes. Ocultamos donde ya estás, donde ya postulaste y, si aplica, todo lo demás mientras tengas una relación de exclusividad.",
  },
  back: { en: "← Back to My Site", es: "← Volver a Mi sitio" },
  yourApps: { en: "Your applications", es: "Tus solicitudes" },
  submittedOn: { en: "Submitted", es: "Enviada" },
  withdraw: { en: "Withdraw", es: "Retirar" },
  agenciesHeading: { en: "Agencies accepting applications", es: "Agencias que reciben solicitudes" },
  noAgencies: { en: "No agencies are currently accepting open applications.", es: "Ninguna agencia recibe solicitudes abiertas por ahora." },
  hubsHeading: { en: "Hubs", es: "Hubs" },
  noHubs: { en: "No hubs available to apply to right now.", es: "No hay hubs disponibles para postular por ahora." },
  nothing: {
    en: "Nothing to show. If you're currently exclusive with an agency, apply is disabled until that relationship ends or releases you.",
    es: "No hay nada que mostrar. Si tienes exclusividad con una agencia, postular está desactivado hasta que esa relación termine o te libere.",
  },
  applyTo: { en: "Apply to", es: "Postular a" },
  noteHub: { en: "Optional note for the hub team.", es: "Nota opcional para el equipo del hub." },
  noteAgency: { en: "Optional note for the agency team.", es: "Nota opcional para el equipo de la agencia." },
  messagePh: { en: "Why you'd be a fit, links to recent work, availability windows…", es: "Por qué encajas, enlaces a tu trabajo reciente, disponibilidad…" },
  cancel: { en: "Cancel", es: "Cancelar" },
  sending: { en: "Submitting…", es: "Enviando…" },
  send: { en: "Send application", es: "Enviar solicitud" },
  apply: { en: "Apply", es: "Postular" },
  pending: { en: "Pending", es: "Pendiente" },
  approved: { en: "Approved", es: "Aprobada" },
  rejected: { en: "Rejected", es: "Rechazada" },
  withdrawnChip: { en: "Withdrawn", es: "Retirada" },
  errAlready: { en: "You already have a pending application here.", es: "Ya tienes una solicitud pendiente aquí." },
  errExclusive: { en: "You're in an exclusive relationship right now, so applying is disabled until it ends.", es: "Tienes una relación de exclusividad ahora, así que postular está desactivado hasta que termine." },
  errClosed: { en: "This one isn't accepting applications right now.", es: "Este no recibe solicitudes por ahora." },
  errGeneric: { en: "Could not send the application. Try again.", es: "No se pudo enviar la solicitud. Inténtalo de nuevo." },
} as const;

type Lang = "en" | "es";

function errorText(code: string, lang: Lang): string {
  if (code === "duplicate_pending") return COPY.errAlready[lang];
  if (code === "exclusivity_block") return COPY.errExclusive[lang];
  if (code === "target_not_open" || code === "target_not_found" || code === "target_not_hub") return COPY.errClosed[lang];
  return COPY.errGeneric[lang];
}

/** The proposed terms ride in the application note, so the studio reads them next to the request. */
export function applicationNote(terms: string, message: string, lang: "en" | "es"): string {
  const t = terms.trim();
  const m = message.trim();
  return t ? `${COPY.termsPrefix[lang]}: ${t}${m ? `\n\n${m}` : ""}` : m;
}

const FONT = '"Inter", system-ui, sans-serif';

function StatusChip({ status, lang }: { status: TalentApplicationRow["status"]; lang: Lang }) {
  const palette = {
    pending: { bg: "rgba(180,83,9,0.10)", fg: C.amber, label: COPY.pending[lang] },
    approved: { bg: "rgba(46,125,91,0.10)", fg: C.green, label: COPY.approved[lang] },
    rejected: { bg: "rgba(192,75,35,0.10)", fg: C.rust, label: COPY.rejected[lang] },
    withdrawn: { bg: C.surface, fg: C.inkMuted, label: COPY.withdrawnChip[lang] },
  }[status];
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 999,
      background: palette.bg, color: palette.fg,
      fontSize: 11, fontWeight: 600, letterSpacing: 0.2,
    }}>{palette.label}</span>
  );
}

export function TalentApplyDiscoveryClient({
  openAgencies,
  openHubs,
  ownApplications,
}: {
  openAgencies: OpenApplicableAgency[];
  openHubs: OpenApplicableAgency[];
  ownApplications: TalentApplicationRow[];
}) {
  const router = useRouter();
  const lang = useDashboardLocale().toLowerCase().startsWith("es") ? "es" : "en";
  const [terms, setTerms] = useState("");
  const [pending, startTransition] = useTransition();
  const [activeForm, setActiveForm] = useState<{
    kind: "agency" | "hub";
    tenantId: string;
    name: string;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function submit(kind: "agency" | "hub", tenantId: string) {
    startTransition(async () => {
      const result = kind === "agency"
        ? await submitAgencyApplication(tenantId, applicationNote(terms, message, lang))
        : await submitHubApplication(tenantId, applicationNote(terms, message, lang));
      if (result.ok) {
        setToast({ kind: "ok", text: COPY.submitted[lang] });
        setActiveForm(null);
        setMessage("");
        setTerms("");
        router.refresh();
      } else {
        setToast({ kind: "err", text: errorText(result.code, lang) });
      }
    });
  }

  function withdraw(kind: "agency" | "hub", id: string) {
    startTransition(async () => {
      const result = await withdrawOwnApplication(kind, id);
      if (result.ok) {
        setToast({ kind: "ok", text: COPY.withdrawn[lang] });
        router.refresh();
      } else {
        setToast({ kind: "err", text: errorText(result.code, lang) });
      }
    });
  }

  const noneOpen = openAgencies.length === 0 && openHubs.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, fontFamily: FONT, maxWidth: 880, margin: "0 auto", padding: "24px 20px" }}>
      <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", color: C.accent }}>
          {COPY.eyebrow[lang]}
        </div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: C.ink, lineHeight: 1.1 }}>
          {COPY.title[lang]}
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: C.inkMuted, maxWidth: 640 }}>
          {COPY.intro[lang]}
        </p>
        <Link href="/talent/site" style={{ fontSize: 12.5, color: C.accent, marginTop: 4 }}>
          {COPY.back[lang]}
        </Link>
      </header>

      {toast && (
        <div role="status" style={{
          padding: "10px 14px", borderRadius: 10, fontSize: 13,
          background: toast.kind === "ok" ? "rgba(46,125,91,0.10)" : "rgba(192,75,35,0.10)",
          color: toast.kind === "ok" ? C.green : C.rust,
          border: `1px solid ${toast.kind === "ok" ? "rgba(46,125,91,0.30)" : "rgba(192,75,35,0.30)"}`,
        }}>
          {toast.text}
        </div>
      )}

      {ownApplications.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.ink }}>{COPY.yourApps[lang]}</h2>
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            {ownApplications.map((app, i) => (
              <div key={app.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 12, padding: "12px 14px",
                borderTop: i > 0 ? `1px solid ${C.borderSoft}` : "none",
              }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{app.agencyName}</span>
                    <span style={{ fontSize: 10.5, color: C.inkDim, textTransform: "uppercase", letterSpacing: 0.5 }}>{app.kind === "hub" ? "hub" : lang === "es" ? "agencia" : "agency"}</span>
                    <StatusChip status={app.status} lang={lang} />
                  </div>
                  {app.decisionNote && (
                    <div style={{ fontSize: 12, color: C.inkMuted }}>
                      {app.decisionNote}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: C.inkDim }}>
                    {COPY.submittedOn[lang]} {new Date(app.submittedAt).toLocaleDateString(lang === "es" ? "es-MX" : "en-GB", { month: "short", day: "numeric" })}
                  </div>
                </div>
                {app.status === "pending" && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => withdraw(app.kind, app.id)}
                    style={{
                      padding: "6px 12px", borderRadius: 7, fontSize: 12,
                      background: "transparent", border: `1px solid ${C.border}`,
                      color: C.ink, cursor: pending ? "default" : "pointer",
                      fontFamily: FONT,
                    }}
                  >
                    {COPY.withdraw[lang]}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.ink }}>{COPY.agenciesHeading[lang]}</h2>
        {openAgencies.length === 0 ? (
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, fontSize: 13, color: C.inkMuted }}>
            {COPY.noAgencies[lang]}
          </div>
        ) : (
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            {openAgencies.map((a, i) => renderApplicableRow("agency", a, i))}
          </div>
        )}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.ink }}>{COPY.hubsHeading[lang]}</h2>
        {openHubs.length === 0 ? (
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, fontSize: 13, color: C.inkMuted }}>
            {COPY.noHubs[lang]}
          </div>
        ) : (
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            {openHubs.map((h, i) => renderApplicableRow("hub", h, i))}
          </div>
        )}
      </section>

      {noneOpen && ownApplications.length === 0 && (
        <div style={{ fontSize: 12.5, color: C.inkMuted, textAlign: "center" }}>
          {COPY.nothing[lang]}
        </div>
      )}

      {activeForm && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed", inset: 0, background: "rgba(11,11,13,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
            zIndex: 100,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setActiveForm(null); }}
        >
          <div style={{ background: "#fff", borderRadius: 14, padding: 24, maxWidth: 480, width: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.ink }}>
              {COPY.applyTo[lang]} {activeForm.name}
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: C.inkMuted }}>
              {activeForm.kind === "hub" ? COPY.noteHub[lang] : COPY.noteAgency[lang]}
            </p>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: C.inkMuted }}>
              {COPY.terms[lang]}
              <input
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                placeholder={COPY.termsHint[lang]}
                maxLength={300}
                style={{ fontFamily: FONT, fontSize: 13, padding: 10, border: `1px solid ${C.border}`, borderRadius: 8 }}
              />
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              placeholder={COPY.messagePh[lang]}
              style={{
                fontFamily: FONT, fontSize: 13, padding: 10,
                border: `1px solid ${C.border}`, borderRadius: 8, resize: "vertical",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => { setActiveForm(null); setMessage(""); }}
                disabled={pending}
                style={{ padding: "8px 14px", borderRadius: 7, fontSize: 13, background: "transparent", border: `1px solid ${C.border}`, color: C.ink, cursor: "pointer", fontFamily: FONT }}
              >
                {COPY.cancel[lang]}
              </button>
              <button
                type="button"
                onClick={() => submit(activeForm.kind, activeForm.tenantId)}
                disabled={pending}
                style={{ padding: "8px 14px", borderRadius: 7, fontSize: 13, background: C.ink, color: "#fff", border: "none", cursor: "pointer", fontFamily: FONT }}
              >
                {pending ? COPY.sending[lang] : COPY.send[lang]}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function renderApplicableRow(kind: "agency" | "hub", row: OpenApplicableAgency, i: number) {
    return (
      <div
        key={row.tenantId}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, padding: "12px 14px",
          borderTop: i > 0 ? `1px solid ${C.borderSoft}` : "none",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{row.displayName}</span>
          {row.slug && (
            <Link href={`/w/${row.slug}`} style={{ fontSize: 11.5, color: C.inkMuted, textDecoration: "none" }}>
              {COPY.view[lang]} →
            </Link>
          )}
        </div>
        <button
          type="button"
          onClick={() => { setActiveForm({ kind, tenantId: row.tenantId, name: row.displayName }); setMessage(""); }}
          disabled={pending}
          style={{
            padding: "6px 14px", borderRadius: 7, fontSize: 12.5, fontWeight: 600,
            background: C.ink, color: "#fff", border: "none", cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          {COPY.apply[lang]}
        </button>
      </div>
    );
  }
}
