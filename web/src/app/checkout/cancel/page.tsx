import Link from "next/link";

import { getRequestLocale } from "@/i18n/request-locale";

export const dynamic = "force-dynamic";

/**
 * TUL-350 slice 2: Stripe cancel return. Localized from the request locale,
 * themed with the host's CSS variables, and honest: nothing was charged.
 * The page is served on whichever host the payer paid from.
 */
export default async function CheckoutCancelPage() {
  const locale = await getRequestLocale();
  const es = locale.toLowerCase().startsWith("es");
  return (
    <main
      data-checkout-state="cancelled"
      style={{
        minHeight: "60vh",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 16, padding: 32,
        fontFamily: '"Inter", system-ui, sans-serif',
        color: "var(--foreground, #0B0B0D)",
        background: "var(--background, transparent)",
        textAlign: "center",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 56, height: 56, borderRadius: 999,
          border: "1px solid var(--border, rgba(11,11,13,0.2))",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontSize: 28, fontWeight: 700,
        }}
      >
        !
      </div>
      <h1 style={{ fontSize: 22, margin: 0, fontWeight: 600 }}>
        {es ? "Pago cancelado" : "Payment cancelled"}
      </h1>
      <p style={{ fontSize: 14, color: "var(--muted-foreground, rgba(11,11,13,0.6))", maxWidth: 480, margin: 0 }}>
        {es
          ? "No se hizo ningún cargo. Puedes volver y elegir de nuevo cuando quieras."
          : "No charge was made. You can go back and choose again whenever you are ready."}
      </p>
      <Link
        href="/"
        style={{
          marginTop: 8, padding: "9px 16px", borderRadius: 999,
          background: "var(--primary, #0B0B0D)", color: "var(--primary-foreground, #fff)",
          fontSize: 13, fontWeight: 600, textDecoration: "none",
        }}
      >
        {es ? "Volver al inicio" : "Back to home"}
      </Link>
    </main>
  );
}
