import { DEMO_SITE_FOOTER } from "@/lib/talent/demo-talent";

/**
 * TUL-560: the one demo marker on every template — a small fixed badge in the
 * bottom-right corner, the same neutral chip on every theme. Never above or
 * inside the header, never in the layout flow. Position, launcher clearance
 * and yielding live in `FLOATING_CHROME_STACK_CSS` (`[data-demo-badge]`).
 */
export function MaxSiteDemoBadge({ locale }: { locale: string }) {
  const es = locale.toLowerCase().startsWith("es");
  return (
    <span
      data-demo-badge=""
      title={es ? DEMO_SITE_FOOTER.es : DEMO_SITE_FOOTER.en}
      style={{
        fontFamily: '"Inter", system-ui, sans-serif',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        lineHeight: 1,
        padding: "5px 9px",
        borderRadius: 999,
        color: "#fff",
        background: "rgba(11,11,13,0.62)",
        backdropFilter: "blur(6px)",
      }}
    >
      Demo
    </span>
  );
}

/** The demo footer line, localized (es / en). */
export function MaxSiteDemoFooter({ locale }: { locale: string }) {
  return (
    <p
      data-talent-max-site-demo-footer=""
      style={{
        margin: 0,
        padding: "12px 16px 0",
        textAlign: "center",
        fontSize: 12,
        color: "var(--token-color-ink-muted, rgba(11,11,13,0.55))",
      }}
    >
      {locale.toLowerCase().startsWith("es") ? DEMO_SITE_FOOTER.es : DEMO_SITE_FOOTER.en}
    </p>
  );
}
