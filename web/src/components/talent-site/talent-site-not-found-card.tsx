import type { TalentNotFoundCopy } from "@/lib/talent-site/talent-not-found-copy";

/**
 * GRK-028 / TUL-547 — the 404 card on a talent site host. Neutral chrome (no
 * Tulala brand, no sign-in): the eyebrow is the site's own name and the only
 * action goes back to the site's home.
 */
export function TalentSiteNotFoundCard({
  copy,
  homeHref = "/",
}: {
  copy: TalentNotFoundCopy;
  homeHref?: string;
}) {
  return (
    <div
      lang={copy.lang}
      data-talent-not-found=""
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
            color: "rgba(11,11,13,0.45)",
            letterSpacing: 0.8,
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          {copy.eyebrow}
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
          {copy.heading}
        </h1>
        <p
          style={{
            fontFamily: '"Inter", system-ui, sans-serif',
            fontSize: 14,
            color: "rgba(11,11,13,0.62)",
            lineHeight: 1.55,
            marginTop: 10,
            marginBottom: 0,
          }}
        >
          {copy.body}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 24 }}>
          <a
            href={homeHref}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "9px 18px",
              borderRadius: 999,
              background: "#0B0B0D",
              color: "#ffffff",
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 13.5,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            {copy.home}
          </a>
        </div>
      </div>
    </div>
  );
}
