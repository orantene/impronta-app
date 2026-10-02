"use client";

/**
 * "Políticas" link for the booking sheet and checkout. Opens the talent's
 * policy in a sheet laid OVER the booking: a button, never a link, so nothing
 * navigates and the booking's own state (chosen option, slot, contact fields)
 * is never unmounted. Decision 6.1.
 *
 * Portalled to <body> above the booking sheet; Escape and the backdrop close
 * only this sheet.
 */

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { TalentPolicyDocument } from "@/components/public-booking/TalentPolicyDocument";
import { pickLocale } from "@/lib/i18n/pick-locale";
import type { PolicyPageModel } from "@/lib/talent-policies/public";

type Load = { status: "idle" } | { status: "loading" } | { status: "ready"; model: PolicyPageModel } | { status: "error" };

export function PolicyLinkSheet({ talentProfileId, locale }: { talentProfileId: string | null | undefined; locale: string }) {
  const [open, setOpen] = useState(false);
  const [load, setLoad] = useState<Load>({ status: "idle" });

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open || !talentProfileId || load.status !== "idle") return;
    setLoad({ status: "loading" });
    const qs = new URLSearchParams({ talent: talentProfileId, doc: "booking", locale });
    fetch(`/api/public/talent-policy?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("policy_fetch_failed"))))
      .then((body: { model?: PolicyPageModel }) => setLoad(body.model ? { status: "ready", model: body.model } : { status: "error" }))
      .catch(() => setLoad({ status: "error" }));
  }, [open, talentProfileId, locale, load.status]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, close]);

  if (!talentProfileId) return null;
  const label = pickLocale(locale, { en: "Policies", es: "Políticas" });
  const closeLabel = pickLocale(locale, { en: "Close", es: "Cerrar" });

  return (
    <>
      <button
        type="button"
        data-policy-link=""
        onClick={() => setOpen(true)}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          font: "inherit",
          fontSize: 12.5,
          textDecoration: "underline",
          color: "inherit",
          opacity: 0.75,
        }}
      >
        {label}
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div role="dialog" aria-modal="true" aria-label={label} data-policy-sheet="" style={{ position: "fixed", inset: 0, zIndex: 120, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
              <button
                type="button"
                aria-label={closeLabel}
                onClick={close}
                style={{ position: "absolute", inset: 0, border: "none", cursor: "pointer", background: "color-mix(in srgb, CanvasText 44%, transparent)" }}
              />
              <div
                style={{
                  position: "relative",
                  width: "min(560px, 100vw)",
                  maxHeight: "86vh",
                  overflowY: "auto",
                  background: "var(--token-color-background, Canvas)",
                  color: "var(--token-color-ink, CanvasText)",
                  borderRadius: "18px 18px 0 0",
                  padding: "22px 20px 28px",
                  boxSizing: "border-box",
                }}
              >
                <button type="button" onClick={close} data-policy-close="" style={{ position: "absolute", top: 12, right: 14, background: "none", border: "none", cursor: "pointer", font: "inherit", fontSize: 13, color: "inherit" }}>
                  {closeLabel}
                </button>
                {load.status === "ready" ? (
                  <TalentPolicyDocument model={load.model} headingTag="h2" />
                ) : (
                  <p style={{ margin: "24px 0", fontSize: 14 }}>
                    {load.status === "error"
                      ? pickLocale(locale, { en: "The policies could not be loaded. Try again in a moment.", es: "No se pudieron cargar las políticas. Intenta de nuevo en un momento." })
                      : pickLocale(locale, { en: "Loading…", es: "Cargando…" })}
                  </p>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
