"use client";

import { useState } from "react";

/**
 * "Download my data" row, shared by client settings, workspace owner settings
 * and talent settings. TUL-725: no one-click download. Choosing JSON or CSV
 * opens a confirm step; confirming requests /api/account/export, which the
 * server only answers for a recent sign-in. When it says `reauth_required` the
 * person gets a "Sign in again" path instead of a raw error.
 * Self-contained EN/ES copy, same approach as AccountDeletionCard.
 */

const COPY = {
  en: {
    title: "Download my data",
    body: "Get a copy of the personal data we hold about you.",
    json: "Download (JSON)",
    csv: "Download as CSV",
    confirmTitle: "Download a copy of your data?",
    confirmBody:
      "The file contains your personal information, bookings and messages. Only download it on a device you trust, and keep it somewhere safe.",
    confirm: "Download now",
    cancel: "Cancel",
    working: "Preparing your file",
    reauth: "For your security, sign in again to download your data.",
    signIn: "Sign in again to download",
    impersonating: "Data downloads are not available while viewing as another person.",
    rateLimited: "Too many downloads. Try again later.",
    error: "We could not prepare your file. Please try again.",
  },
  es: {
    title: "Descargar mis datos",
    body: "Obtén una copia de los datos personales que tenemos sobre ti.",
    json: "Descargar (JSON)",
    csv: "Descargar como CSV",
    confirmTitle: "¿Descargar una copia de tus datos?",
    confirmBody:
      "El archivo contiene tu información personal, reservas y mensajes. Descárgalo solo en un dispositivo de confianza y guárdalo en un lugar seguro.",
    confirm: "Descargar ahora",
    cancel: "Cancelar",
    working: "Preparando tu archivo",
    reauth: "Por tu seguridad, inicia sesión de nuevo para descargar tus datos.",
    signIn: "Inicia sesión de nuevo para descargar",
    impersonating: "Las descargas de datos no están disponibles mientras ves como otra persona.",
    rateLimited: "Demasiadas descargas. Inténtalo más tarde.",
    error: "No pudimos preparar tu archivo. Inténtalo de nuevo.",
  },
} as const;

export const ACCOUNT_EXPORT_HREF = { json: "/api/account/export", csv: "/api/account/export?format=csv" } as const;

export function accountExportCopy(es: boolean) {
  return es ? COPY.es : COPY.en;
}

type Kind = keyof typeof ACCOUNT_EXPORT_HREF;
type Status = "idle" | "working" | "reauth" | "impersonating" | "rateLimited" | "error";

function filenameFrom(res: Response, kind: Kind): string {
  const m = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "");
  return m?.[1] ?? (kind === "csv" ? "tulala-data.zip" : "tulala-data.json");
}

export function AccountExportLinks({ es }: { es: boolean }) {
  const c = accountExportCopy(es);
  const [confirm, setConfirm] = useState<Kind | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const link = { fontSize: 13, fontWeight: 600, textDecoration: "underline", background: "none", border: 0, padding: 0, cursor: "pointer", color: "inherit" } as const;

  async function run(kind: Kind) {
    setStatus("working");
    try {
      const res = await fetch(ACCOUNT_EXPORT_HREF[kind], { credentials: "same-origin" });
      if (res.ok) {
        const url = URL.createObjectURL(await res.blob());
        const a = document.createElement("a");
        a.href = url;
        a.download = filenameFrom(res, kind);
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setConfirm(null);
        setStatus("idle");
        return;
      }
      const { error } = (await res.json().catch(() => ({ error: null }))) as { error: string | null };
      if (res.status === 429) setStatus("rateLimited");
      else if (error === "reauth_required") setStatus("reauth");
      else if (error === "impersonating") setStatus("impersonating");
      else setStatus("error");
    } catch {
      setStatus("error");
    }
  }

  const here = typeof window === "undefined" ? "/" : window.location.pathname + window.location.search;
  const message =
    status === "reauth" ? c.reauth
    : status === "impersonating" ? c.impersonating
    : status === "rateLimited" ? c.rateLimited
    : status === "error" ? c.error
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 12.5, opacity: 0.7 }}>{c.body}</div>
      {confirm === null ? (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <button type="button" onClick={() => { setStatus("idle"); setConfirm("json"); }} style={link}>{c.json}</button>
          <button type="button" onClick={() => { setStatus("idle"); setConfirm("csv"); }} style={link}>{c.csv}</button>
        </div>
      ) : (
        <div role="alertdialog" aria-label={c.confirmTitle} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{c.confirmTitle}</div>
          <div style={{ fontSize: 12.5, opacity: 0.8 }}>{c.confirmBody}</div>
          {message ? <div role="alert" style={{ fontSize: 12.5 }}>{message}</div> : null}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            {status === "reauth" ? (
              <a href={`/login?next=${encodeURIComponent(here)}`} style={{ ...link, display: "inline-block" }}>{c.signIn}</a>
            ) : (
              <button type="button" disabled={status === "working"} onClick={() => void run(confirm)} style={link}>
                {status === "working" ? c.working : c.confirm}
              </button>
            )}
            <button type="button" onClick={() => { setConfirm(null); setStatus("idle"); }} style={{ ...link, fontWeight: 400 }}>{c.cancel}</button>
          </div>
        </div>
      )}
    </div>
  );
}
