"use client";

/**
 * DemoAskPanel — stands in for the Tulala chat launcher in the prototype.
 *
 * On the LIVE profile, Ask / Chat now opens TalentProfileChatLauncher with
 * pending offering + visitor contact. This harness has no launcher (no tenant,
 * guest cookies, Supabase), so this panel listens for `tulala:ask-question`
 * and shows what the visitor would land in — plus the exact payload.
 *
 * It sends nothing and stores nothing.
 */

import { useEffect, useState } from "react";

import { useFocusTrap } from "@/app/t/[profileCode]/_chat/use-focus-trap";

type AskDetail = {
  talentName?: string;
  sourcePage?: string;
  offeringId?: string | null;
  offeringTitle?: string | null;
  from?: string;
  selection?: {
    variantLabel?: string | null;
    addOnLabels?: string[];
    slotLabel?: string | null;
    totalCents?: number | null;
  } | null;
  visitor?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
  demo?: boolean;
};

export function DemoAskPanel() {
  const [ask, setAsk] = useState<AskDetail | null>(null);
  const trapRef = useFocusTrap<HTMLDivElement>(ask !== null);

  useEffect(() => {
    const on = (e: Event) => setAsk(((e as CustomEvent).detail ?? {}) as AskDetail);
    window.addEventListener("tulala:ask-question", on);
    return () => window.removeEventListener("tulala:ask-question", on);
  }, []);

  useEffect(() => {
    if (!ask) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAsk(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ask]);

  if (!ask) return null;

  const bits = [
    ask.offeringTitle,
    ask.selection?.variantLabel,
    ...(ask.selection?.addOnLabels ?? []),
    ask.selection?.slotLabel,
  ].filter(Boolean);

  return (
    <div
      ref={trapRef}
      className="ask-back"
      role="dialog"
      aria-modal="true"
      aria-label="Preguntar a Jorg Beauty"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setAsk(null);
      }}
    >
      <div className="ask-panel">
        <header>
          <div>
            <p>Mensajes · Tulala</p>
            <h2>Jorg Beauty</h2>
          </div>
          <button type="button" onClick={() => setAsk(null)} aria-label="Cerrar">
            ✕
          </button>
        </header>

        <div className="ask-body">
          <div className="ask-bubble">
            ¡Hola! Contame qué tenés en mente y te ayudo a elegir el servicio.
          </div>
          {bits.length ? <div className="ask-chip">Sobre: {bits.join(" · ")}</div> : null}
          {ask.visitor?.name || ask.visitor?.phone ? (
            <p className="ask-note">
              {ask.visitor.name ? `Nombre: ${ask.visitor.name}` : null}
              {ask.visitor.name && ask.visitor.phone ? " · " : null}
              {ask.visitor.phone ? `WhatsApp: ${ask.visitor.phone}` : null}
            </p>
          ) : null}
          <label className="ask-field">
            <span>Tu pregunta</span>
            <textarea rows={3} placeholder="Ej: tengo las pestañas finas, ¿me conviene 2D o clásicas?" />
          </label>
          <p className="ask-note">
            Demostración. En el perfil real este botón abre el chat de Tulala y la conversación
            queda en la bandeja de Jorgelina, con el servicio como contexto. Aquí no se envía nada.
          </p>
          <details className="ask-payload">
            <summary>Ver lo que se envió al chat</summary>
            <pre>{JSON.stringify(ask, null, 2)}</pre>
          </details>
        </div>
      </div>
    </div>
  );
}
