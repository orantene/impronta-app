/**
 * TUL-1930: the Free "Mi presencia" locked state as a real upsell: one benefit line, blurred sample numbers
 * (decorative, aria-hidden, never real data) and a primary button to the plans page.
 */
import Link from "next/link";

export function PresenceLockedUpsell({ es }: { es: boolean }) {
  const sample = [
    { label: es ? "Visitas" : "Visits", value: "128" },
    { label: es ? "Solicitudes" : "Requests", value: "9" },
    { label: es ? "Confirmadas" : "Confirmed", value: "3" },
  ];
  return (
    <section
      aria-label={es ? "Mi presencia, ultimos 30 dias" : "My presence, last 30 days"}
      className="rounded-admin-lg border border-admin-border bg-admin-card p-4"
    >
      <h2 className="text-sm font-semibold text-admin-ink">{es ? "Mi presencia" : "My presence"}</h2>
      <p className="mt-1 text-sm text-admin-ink-muted">
        {es
          ? "Mira cuántas personas visitan tu perfil, de dónde llegan y cuántas reservan."
          : "See how many people visit your profile, where they come from and how many book."}
      </p>
      <div aria-hidden="true" className="pointer-events-none mt-3 grid select-none grid-cols-3 gap-4 blur-sm">
        {sample.map((m) => (
          <div key={m.label} className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs text-admin-ink-muted">{m.label}</span>
            <span className="text-2xl font-semibold tabular-nums text-admin-ink">{m.value}</span>
          </div>
        ))}
      </div>
      <Link
        href="/talent/plan"
        className="mt-3 inline-flex items-center justify-center rounded-admin-md bg-admin-ink px-3 py-1.5 text-sm font-medium text-admin-card"
      >
        {es ? "Ver planes Pro" : "See Pro plans"}
      </Link>
    </section>
  );
}
