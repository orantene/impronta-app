/**
 * The PURE view of `/r/<code>` — no I/O. Tokens only: this page sits on a
 * tenant storefront, and `text-black/50` on Impronta noir is unreadable.
 */

import type { CSSProperties } from "react";
import Link from "next/link";

import { ReceiptCopyLink } from "./receipt-copy-link";

export type ReceiptLocale = "en" | "es";

export const COPY: Record<ReceiptLocale, Record<string, string>> = {
  en: {
    eyebrow: "Receipt",
    title: "Your tickets",
    refunded: "Refunded",
    next: "What to do next",
    nextDoor: "Show this screen at the door. One code is scanned once.",
    nextSave: "Save this link. It is your ticket.",
    nextName: "If you cannot open it, we will find you by name at the door.",
    ctaDoor: "Show at the door",
    ctaEvent: "Back to the event",
    ctaHome: "Back to the site",
    copyLink: "Copy link",
    copied: "Copied",
    bought: "What you bought",
    door: "Show at the door",
    doorHelp: "One code per ticket. Each is scanned once.",
    doorHelpParty: "One code per party. Each is scanned once.",
    scan: "Scan at the door, or show this code.",
    type: "Show this code at the door. It can be typed in.",
    missing: "This ticket cannot be shown yet. Please contact the venue.",
    used: "Used",
    tba: "Date to be announced",
    private: "Keep this link private. Anyone with it can see this receipt.",
    discount: "Discount {amount}",
    free: "Free",
    party: "Party of {n}",
    ticket: "Ticket",
    admits: "admits {n}",
  },
  es: {
    eyebrow: "Recibo",
    title: "Tus entradas",
    refunded: "Reembolsado",
    next: "Qué sigue",
    nextDoor: "Mostrá esta pantalla en la puerta. Un código se escanea una vez.",
    nextSave: "Guardá este enlace. Es tu entrada.",
    nextName: "Si no podés abrirla, te buscamos por tu nombre en la puerta.",
    ctaDoor: "Mostrar en la puerta",
    ctaEvent: "Volver al evento",
    ctaHome: "Volver al sitio",
    copyLink: "Copiar enlace",
    copied: "Copiado",
    bought: "Lo que compraste",
    door: "En la puerta",
    doorHelp: "Un código por entrada. Cada uno se escanea una vez.",
    doorHelpParty: "Un código por grupo. Cada uno se escanea una vez.",
    scan: "Escaneá en la puerta, o mostrá este código.",
    type: "Mostrá este código en la puerta. Se puede tipear.",
    missing: "Esta entrada aún no se puede mostrar. Contactá al local.",
    used: "Usada",
    tba: "Fecha por anunciar",
    private: "Este enlace es privado. Quien lo tenga puede ver este recibo.",
    discount: "Descuento {amount}",
    free: "Gratis",
    party: "Grupo de {n}",
    ticket: "Entrada",
    admits: "admite {n}",
  },
};

export type ReceiptLineView = {
  id: string;
  label: string;
  qtyLabel: string;
  totalLabel: string;
};

export type ReceiptAdmissionView = {
  id: string;
  holder: string;
  when: string;
  admits: string | null;
  badge: string | null;
  token: string | null;
  qrSvg: string | null;
  canShow: boolean;
};

export type ReceiptPageModel = {
  locale: ReceiptLocale;
  isRefunded: boolean;
  createdAtLabel: string;
  totalLabel: string;
  eventHref: string | null;
  discountLabel: string | null;
  lines: ReceiptLineView[];
  admissions: ReceiptAdmissionView[];
};

const card: CSSProperties = {
  border: "1px solid var(--token-color-line)",
  background: "var(--token-color-surface-raised)",
  borderRadius: 16,
};

export function ReceiptPageView(m: ReceiptPageModel) {
  const t = (k: string) => COPY[m.locale][k] ?? COPY.en[k] ?? k;
  const hasDoor = m.admissions.some((a) => a.canShow && a.token);
  const hasParty = m.admissions.some((a) => Boolean(a.admits));

  return (
    <main
      className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-14"
      style={{ color: "var(--token-color-ink)" }}
    >
      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--token-color-muted)" }}>
        {t("eyebrow")}
      </div>
      <h1 className="mt-2 text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-[1.1] tracking-tight">
        {m.isRefunded ? t("refunded") : t("title")}
      </h1>
      <p className="mt-2 text-sm" style={{ color: "var(--token-color-muted)" }}>
        {m.createdAtLabel} · {m.totalLabel}
      </p>

      {!m.isRefunded ? (
        <section className="mt-8 p-5 sm:p-6" style={card}>
          <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--token-color-muted)" }}>
            {t("next")}
          </h2>
          <ol className="mt-3 space-y-2 text-sm leading-relaxed" style={{ color: "var(--token-color-ink)" }}>
            <li>1. {t("nextSave")}</li>
            <li>2. {hasDoor ? t("nextDoor") : t("nextName")}</li>
            {hasDoor ? <li>3. {t("nextName")}</li> : null}
          </ol>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {hasDoor ? (
              <a
                href="#door"
                className="inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold"
                style={{
                  background: "var(--token-color-primary)",
                  color: "var(--token-color-primary-on, var(--primary-foreground))",
                }}
              >
                {t("ctaDoor")}
              </a>
            ) : null}
            <ReceiptCopyLink
              label={t("copyLink")}
              copiedLabel={t("copied")}
              tone={hasDoor ? "secondary" : "primary"}
            />
            {m.eventHref ? (
              <Link
                href={m.eventHref}
                className="inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold"
                style={{ color: "var(--token-color-ink)", border: "1px solid var(--token-color-line)" }}
              >
                {t("ctaEvent")}
              </Link>
            ) : (
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold"
                style={{ color: "var(--token-color-ink)", border: "1px solid var(--token-color-line)" }}
              >
                {t("ctaHome")}
              </Link>
            )}
          </div>
        </section>
      ) : null}

      <section className="mt-6 overflow-hidden" style={card}>
        <div className="px-5 pt-5 sm:px-6 sm:pt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--token-color-muted)" }}>
            {t("bought")}
          </h2>
        </div>
        <ul>
          {m.lines.map((l, i) => (
            <li
              key={l.id}
              className="flex items-baseline justify-between gap-4 px-5 py-4 sm:px-6"
              style={i > 0 ? { borderTop: "1px solid var(--token-color-line)" } : undefined}
            >
              <div>
                <div className="font-medium">{l.label}</div>
                <div className="mt-0.5 text-xs" style={{ color: "var(--token-color-muted)" }}>{l.qtyLabel}</div>
              </div>
              <div className="font-semibold">{l.totalLabel}</div>
            </li>
          ))}
        </ul>
        {m.discountLabel ? (
          <p className="px-5 pb-4 text-right text-sm sm:px-6" style={{ color: "var(--token-color-muted)" }}>
            {m.discountLabel}
          </p>
        ) : null}
      </section>

      {m.admissions.length > 0 ? (
        <section id="door" className="mt-6 scroll-mt-24">
          <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--token-color-muted)" }}>
            {t("door")}
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--token-color-muted)" }}>
            {hasParty ? t("doorHelpParty") : t("doorHelp")}
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {m.admissions.map((a) => (
              <li key={a.id} className="p-5 sm:p-6" style={{ ...card, opacity: a.canShow ? 1 : 0.65 }}>
                <div className="flex items-baseline justify-between gap-4">
                  <div>
                    <div className="font-medium">{a.holder}</div>
                    <div className="mt-0.5 text-xs" style={{ color: "var(--token-color-muted)" }}>
                      {a.when}
                      {a.admits ? ` · ${a.admits}` : null}
                    </div>
                  </div>
                  {a.badge ? (
                    <span className="text-xs font-semibold uppercase" style={{ color: "var(--token-color-muted)" }}>
                      {a.badge}
                    </span>
                  ) : null}
                </div>
                {a.canShow ? (
                  a.token ? (
                    <div className="mt-4">
                      {a.qrSvg ? (
                        <div
                          className="mx-auto w-[240px] max-w-full rounded-xl bg-white p-3"
                          aria-label="Ticket QR code"
                          role="img"
                          dangerouslySetInnerHTML={{ __html: a.qrSvg }}
                        />
                      ) : null}
                      <code
                        className="mt-3 block break-all rounded-xl px-3 py-2 font-mono text-[12px] leading-relaxed"
                        style={{
                          background: "color-mix(in srgb, var(--token-color-ink) 8%, transparent)",
                          color: "var(--token-color-ink)",
                        }}
                      >
                        {a.token}
                      </code>
                      <p className="mt-2 text-xs" style={{ color: "var(--token-color-muted)" }}>
                        {a.qrSvg ? t("scan") : t("type")}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm" style={{ color: "var(--token-color-muted)" }}>{t("missing")}</p>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="mt-8 text-xs" style={{ color: "var(--token-color-muted)" }}>{t("private")}</p>
    </main>
  );
}
