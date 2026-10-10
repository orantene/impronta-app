/**
 * Branded "page not found" 404.
 *
 * Rendered by the middleware (proxy.ts) when a request hits a KNOWN host
 * (marketing / app / agency / hub / talent_site) on a path that isn't served
 * there — a mistyped or stale URL. The middleware rewrites here with a 404
 * status instead of returning bare "Not found" text, so a wrong URL lands on
 * branded chrome with a clear way home, never a dead end.
 *
 * GRK-028 / TUL-547: on a talent_site host with a Spanish locale, copy and the
 * primary CTA stay on that site (home `/`), never the English Tulala marketing
 * chrome. Other hosts keep the absolute marketing / app links.
 *
 * Lives outside every tenant-aware route group so it renders safely without a
 * host context (mirrors `/_host-unregistered`). Whitelisted in the proxy
 * short-circuit so the rewrite doesn't recurse.
 */
import type { Metadata } from "next";
import { headers } from "next/headers";

import { getAppUrl, getSiteUrl } from "@/lib/auth-flow";
import { LOCALE_HEADER } from "@/i18n/request-locale";
import { HOST_CONTEXT_HEADER } from "@/lib/saas/host-context";

export const metadata: Metadata = {
  title: "Page not found — Tulala",
  robots: { index: false, follow: false },
};

const COPY = {
  en: {
    eyebrow: "Tulala",
    heading: "Page not found",
    body: "The page you're looking for doesn't exist or may have moved. Head back to the homepage, or sign in to your workspace.",
    home: "Go to homepage",
    signIn: "Sign in",
    talentEyebrow: "This site",
    talentBody: "That page isn't on this site. Head back home to keep browsing.",
    talentHome: "Back to home",
  },
  es: {
    eyebrow: "Tulala",
    heading: "Página no encontrada",
    body: "La página que buscas no existe o se movió. Vuelve al inicio, o inicia sesión en tu espacio de trabajo.",
    home: "Ir al inicio",
    signIn: "Iniciar sesión",
    talentEyebrow: "Este sitio",
    talentBody: "Esa página no está en este sitio. Vuelve al inicio para seguir navegando.",
    talentHome: "Volver al inicio",
  },
} as const;

export default async function PageNotFound() {
  const h = await headers();
  const isTalentSite = h.get(HOST_CONTEXT_HEADER) === "talent_site";
  const localeRaw = (h.get(LOCALE_HEADER) ?? "en").toLowerCase();
  const lang = localeRaw.startsWith("es") ? "es" : "en";
  const t = COPY[lang];

  const site = getSiteUrl();
  const app = getAppUrl();
  const primaryHref = isTalentSite ? "/" : site;
  const primaryLabel = isTalentSite ? t.talentHome : t.home;
  const eyebrow = isTalentSite ? t.talentEyebrow : t.eyebrow;
  const body = isTalentSite ? t.talentBody : t.body;

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        background: "#FAFAF7",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#ffffff",
          border: "1px solid rgba(24,24,27,0.10)",
          borderRadius: 16,
          padding: "32px 32px",
        }}
      >
        <p
          style={{
            fontFamily: '"Inter", system-ui, sans-serif',
            fontSize: 11,
            fontWeight: 600,
            color: "rgba(11,11,13,0.38)",
            letterSpacing: 0.8,
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          {eyebrow}
        </p>
        <h1
          style={{
            fontFamily: '"Inter", system-ui, sans-serif',
            fontSize: 26,
            fontWeight: 600,
            color: "#0B0B0D",
            letterSpacing: -0.4,
            marginTop: 12,
            marginBottom: 0,
          }}
        >
          {t.heading}
        </h1>
        <p
          style={{
            fontFamily: '"Inter", system-ui, sans-serif',
            fontSize: 13.5,
            color: "rgba(11,11,13,0.60)",
            lineHeight: 1.55,
            marginTop: 10,
            marginBottom: 0,
          }}
        >
          {body}
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 24 }}>
          <a
            href={primaryHref}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "9px 18px",
              borderRadius: 999,
              background: "#0F4F3E",
              color: "#ffffff",
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 13.5,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            {primaryLabel}
          </a>
          {isTalentSite ? null : (
            <a
              href={`${app}/login`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "9px 18px",
                borderRadius: 999,
                background: "#ffffff",
                border: "1px solid rgba(24,24,27,0.14)",
                color: "#0B0B0D",
                fontFamily: '"Inter", system-ui, sans-serif',
                fontSize: 13.5,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              {t.signIn}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
