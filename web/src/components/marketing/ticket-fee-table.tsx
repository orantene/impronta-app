import {
  EVENTBRITE_TERMS,
  ticketFeeRows,
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
export function TicketFeeTable({ locale }: { locale: string }) {
  const es = locale === "es";
  const rows = ticketFeeRows();

  const t = es
    ? {
        eyebrow: "Lo que carga un boleto",
        title: "Una cuota fija castiga más a los boletos baratos",
        lede: "Eventbrite cobra un porcentaje más $1.79 fijos por boleto. Una cuota fija es un porcentaje que se encoge mientras el boleto sube de precio, así que pesa poco en un boleto caro y muchísimo en uno barato. La nuestra es un porcentaje plano, igual a cualquier precio.",
        face: "Precio del boleto",
        them: "Carga en Eventbrite",
        us: "Carga aquí",
        share: "del precio",
        ours: "Nuestro seis por ciento incluye el procesamiento de tarjeta y es igual en todos los planes, incluido el gratis. En un boleto de $10 eso es $0.60 en total: $0.30 que se le suman al comprador y $0.30 que salen del vendedor.",
        theirs: `Eventbrite, boletos pagados en Estados Unidos, revisado el ${EVENTBRITE_TERMS.checkedOn}: ${EVENTBRITE_TERMS.es}`,
        verify: "Revisa su página de precios",
        note: "Los precios cambian. Si algo aquí ya no es correcto, dinos y lo corregimos.",
      }
    : {
        eyebrow: "What a ticket carries",
        title: "A flat fee punishes cheap tickets hardest",
        lede: "Eventbrite charges a percentage plus a flat $1.79 per ticket. A flat fee is a percentage that shrinks as the ticket gets dearer, so it barely registers on an expensive ticket and takes a quarter of a cheap one. Ours is a flat percentage, the same share at any price.",
        face: "Ticket price",
        them: "Carried on Eventbrite",
        us: "Carried here",
        share: "of face",
        ours: "Our six percent includes card processing and is the same on every plan, including free. On a $10 ticket that is $0.60 in total: $0.30 added to the buyer and $0.30 from the seller.",
        theirs: `Eventbrite, US paid tickets, checked ${EVENTBRITE_TERMS.checkedOn}: ${EVENTBRITE_TERMS.en}`,
        verify: "Check their pricing page",
        note: "Prices change. If anything here is out of date, tell us and we will fix it.",
      };

  return (
    <div className="mx-auto max-w-3xl">
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
