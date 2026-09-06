import {
  EVENTBRITE_TERMS,
  ticketFeeRows,
  TULALA_RATE_FALLBACK,
} from "@/lib/marketing/ticket-fee-comparison";

/**
 * The ticket fee table on the pricing page.
 *
 * Deliberately here and not on the ticketing feature page. Ticketing is still
 * `status: "coming"`, so a page that invites someone to switch would be
 * inviting them to something they cannot buy. On pricing this is a statement
 * about HOW WE CHARGE, which needs no shipped product, on a page every
 * visitor already reaches.
 *
 * Every figure is expressed as what the TRANSACTION CARRIES, never as what
 * anybody pays, because Eventbrite lets an organiser pass fees to the
 * attendee and most do. "What you pay" would be wrong for them, on the one
 * page whose whole job is being checkable.
 */
export function TicketFeeTable({
  locale,
  tulalaRate,
}: {
  locale: string;
  /** Live platform take as a fraction, from platform_commission_config. */
  tulalaRate?: number;
}) {
  const es = locale === "es";
  // Resolved ONCE, then used by both the table and the prose below. Letting
  // each caller apply its own `?? FALLBACK` is how the sentence and the table
  // drift apart again, which is the whole defect this component exists to fix.
  const rate = tulalaRate ?? TULALA_RATE_FALLBACK;
  const rows = ticketFeeRows(rate);

  // The TABLE reads the live rate; this sentence used to hardcode it. That is
  // the more dangerous half: a stale table is obvious at a glance, a stale
  // sentence naming the rate in words is not, and that sentence is the one a
  // reader quotes back at us. Both halves now come from the same number.
  // (This comment deliberately avoids spelling the rate out: the guard below
  // is a blunt substring match on purpose, and a rule you can argue your way
  // around is not a rule.)
  //
  // The buyer's share is HALF of the take by current config
  // (client_surcharge_bps 300 of default_take_bps 600). Derived rather than
  // typed, so the split cannot silently stop matching the engine.
  const pctText = `${Math.round(rate * 1000) / 10}%`;
  const tenTotal = (10 * rate).toFixed(2);
  const tenHalf = (10 * (rate / 2)).toFixed(2);

  const t = es
    ? {
        notYet:
          "La venta de boletos todavía no está disponible. Esta tabla dice lo que costará un boleto cuando se lance.",
        notYetLink: "Ver el estado en Funciones",
        eyebrow: "Lo que carga un boleto",
        title: "Una cuota fija castiga más a los boletos baratos",
        lede: "Eventbrite cobra un porcentaje más $1.79 fijos por boleto. Una cuota fija es un porcentaje que se encoge mientras el boleto sube de precio, así que pesa poco en un boleto caro y muchísimo en uno barato. La nuestra es un porcentaje plano, igual a cualquier precio.",
        face: "Precio del boleto",
        them: "Carga en Eventbrite",
        us: "Carga aquí",
        share: "del precio",
        ours: `Nuestro ${pctText} incluye el procesamiento de tarjeta y es igual en todos los planes, incluido el gratis. En un boleto de $10 eso es $${tenTotal} en total: $${tenHalf} que se le suman al comprador y $${tenHalf} que salen del vendedor.`,
        theirs: `Eventbrite, boletos pagados en Estados Unidos, revisado el ${EVENTBRITE_TERMS.checkedOn}: ${EVENTBRITE_TERMS.es}`,
        verify: "Revisa su página de precios",
        note: "Los precios cambian. Si algo aquí ya no es correcto, dinos y lo corregimos.",
      }
    : {
        notYet:
          "Ticketing is not available yet. This table states what a ticket will cost when it ships.",
        notYetLink: "See its status on Features",
        eyebrow: "What a ticket carries",
        title: "A flat fee punishes cheap tickets hardest",
        lede: "Eventbrite charges a percentage plus a flat $1.79 per ticket. A flat fee is a percentage that shrinks as the ticket gets dearer, so it barely registers on an expensive ticket and takes a quarter of a cheap one. Ours is a flat percentage, the same share at any price.",
        face: "Ticket price",
        them: "Carried on Eventbrite",
        us: "Carried here",
        share: "of face",
        ours: `Our ${pctText} includes card processing and is the same on every plan, including free. On a $10 ticket that is $${tenTotal} in total: $${tenHalf} added to the buyer and $${tenHalf} from the seller.`,
        theirs: `Eventbrite, US paid tickets, checked ${EVENTBRITE_TERMS.checkedOn}: ${EVENTBRITE_TERMS.en}`,
        verify: "Check their pricing page",
        note: "Prices change. If anything here is out of date, tell us and we will fix it.",
      };

  const featuresHref = es ? "/es/funciones/ticketing" : "/features/ticketing";

  return (
    <div className="mx-auto max-w-3xl">
      {/* The qualifier is ABOVE the table and inside the same block, so the
          numbers cannot be read without it. Ticketing has no purchase path at
          all — /events and /events/<slug> are live but the detail page is an
          honest price list by design — while this table compares our fee to a
          competitor's. Without this line the two read as a live offer, two
          clicks from a feature hub that correctly says "coming". */}
      <p
        className="plt-body"
        style={{
          color: "var(--plt-muted)",
          border: "1px solid var(--plt-border)",
          borderRadius: 8,
          padding: "10px 14px",
          marginBottom: 20,
          fontSize: 14,
        }}
      >
        {t.notYet}{" "}
        <a href={featuresHref} style={{ color: "inherit", textDecoration: "underline" }}>
          {t.notYetLink}
        </a>
      </p>
      <p className="plt-eyebrow" style={{ color: "var(--plt-muted)" }}>
        {t.eyebrow}
      </p>
      <h2
        className="plt-display mt-4"
        style={{ fontSize: "clamp(1.6rem, 3.6vw, 2.2rem)", color: "var(--plt-ink)" }}
      >
        {t.title}
      </h2>
      <p
        className="plt-body mt-4"
        style={{ fontSize: "1rem", lineHeight: 1.7, color: "var(--plt-ink-soft)" }}
      >
        {t.lede}
      </p>

      <div
        className="mt-8 overflow-x-auto rounded-[14px]"
        style={{ border: "1px solid var(--plt-hairline)" }}
      >
        <table className="w-full border-collapse" style={{ minWidth: "460px" }}>
          <thead>
            <tr style={{ background: "var(--plt-bg-raised)" }}>
              <th className="plt-eyebrow p-3 text-left" style={{ color: "var(--plt-muted)" }}>
                {t.face}
              </th>
              <th className="plt-eyebrow p-3 text-left" style={{ color: "var(--plt-muted)" }}>
                {t.them}
              </th>
              <th className="plt-eyebrow p-3 text-left" style={{ color: "var(--plt-forest)" }}>
                {t.us}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.faceValue}
                style={{
                  borderTop: "1px solid var(--plt-hairline)",
                  // The rows the copy leads on are emphasised. Every row stays:
                  // the table's honesty is the reason it persuades.
                  background: r.headline ? "var(--plt-bg-raised)" : undefined,
                }}
              >
                <td
                  className="p-3"
                  style={{
                    color: "var(--plt-ink)",
                    fontWeight: r.headline ? 600 : 400,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  ${r.faceValue}
                </td>
                <td
                  className="p-3"
                  style={{ color: "var(--plt-ink-soft)", fontVariantNumeric: "tabular-nums" }}
                >
                  ${r.eventbrite.toFixed(2)}{" "}
                  <span style={{ color: "var(--plt-muted)", fontSize: "0.85em" }}>
                    {r.eventbritePct}% {t.share}
                  </span>
                </td>
                <td
                  className="p-3"
                  style={{
                    color: "var(--plt-forest)",
                    fontWeight: r.headline ? 600 : 400,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  ${r.tulala.toFixed(2)}{" "}
                  <span style={{ color: "var(--plt-muted)", fontSize: "0.85em" }}>
                    {r.tulalaPct}% {t.share}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p
        className="plt-body mt-5"
        style={{ fontSize: "0.9375rem", lineHeight: 1.6, color: "var(--plt-ink-soft)" }}
      >
        {t.ours}
      </p>
      <p className="mt-3" style={{ fontSize: "0.8125rem", color: "var(--plt-muted)" }}>
        {t.theirs}{" "}
        <a
          href={EVENTBRITE_TERMS.sourceUrl}
          rel="nofollow noopener"
          target="_blank"
          style={{ color: "var(--plt-forest)" }}
        >
          {t.verify}
        </a>
        . {t.note}
      </p>
    </div>
  );
}
