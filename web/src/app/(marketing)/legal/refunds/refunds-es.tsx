import Link from "next/link";
import { LegalPage } from "@/components/marketing/legal-page";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { withLocaleHref } from "@/i18n/pathnames";

// DRAFT PENDING LEGAL REVIEW (2026-10-02). See page.tsx.

export function RefundsEs() {
  const linkStyle = { color: "var(--plt-ink)" } as const;
  return (
    <LegalPage
      eyebrow="Legal"
      title="Política de reembolsos"
      lastUpdated="2026-10-02"
      lastUpdatedLabel="Última actualización"
      intro={
        <p>
          Esta página explica cómo funcionan los reembolsos en {PLATFORM_BRAND.name}. En
          corto: el talento elige las reglas de reembolso de cada reservación,{" "}
          {PLATFORM_BRAND.name} procesa el reembolso cuando esas reglas lo permiten, y las
          comisiones de procesamiento de tarjeta no se devuelven.
        </p>
      }
      sections={[
        {
          heading: "Quién fija las reglas",
          body: (
            <>
              {/* LEGAL_REVIEW_PENDING: talent is merchant of record (owner decision 2026-10-01) */}
              <p>
                El talento es el comerciante registrado de cada pago con tarjeta que recibe,
                mediante su cuenta de Stripe Connect. Elige una política de reembolso para la
                reservación (u oferta). {PLATFORM_BRAND.name} procesa los reembolsos que
                siguen esa política. Los contracargos, las disputas perdidas y la facturación
                fiscal siguen siendo responsabilidad del talento.
              </p>
              <p className="text-xs opacity-70">Pendiente de revisión legal</p>
            </>
          ),
        },
        {
          heading: "Presets que puede usar el talento",
          body: (
            <>
              <p>
                Los talentos suelen elegir uno de estos presets. El plazo se mide desde la
                hora de inicio reservada, salvo que la página de reservación del talento diga
                otra cosa.
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  <strong>Escalonada</strong>: reembolso total con 14 días o más de
                  anticipación; 50% entre 7 y 14 días; ninguno con menos de 7 días. El depósito
                  no es reembolsable.
                </li>
                <li>
                  <strong>Flexible</strong>: reembolso total hasta 48 horas antes; ninguno
                  después.
                </li>
                <li>
                  <strong>Estricta</strong>: depósito no reembolsable; 50% del saldo con menos
                  de 30 días; ninguno con menos de 7 días.
                </li>
                <li>
                  <strong>Manual</strong>: el talento o el espacio de trabajo decide cada caso.
                </li>
              </ul>
              <p>
                La política que aplicaba cuando el cliente pagó es la que rige los reembolsos
                posteriores de esa reservación.
              </p>
            </>
          ),
        },
        {
          heading: "Comisiones de procesamiento",
          body: (
            <>
              <p>
                Cada pago con tarjeta lleva una comisión de procesamiento que las redes y
                Stripe no devuelven. Según la configuración del talento, el talento absorbe
                esa comisión o se suma al total del cliente. El monto completo, incluida
                cualquier comisión, siempre se muestra antes de pagar.
              </p>
              <p>
                Como esas comisiones no se devuelven, un reembolso es el monto reembolsable
                bajo la política del talento menos las comisiones de procesamiento de ese
                pago. Ni el talento ni {PLATFORM_BRAND.name} cubren esas comisiones. Si la
                comisión real aún no se puede confirmar, el reembolso espera hasta poder
                hacerlo, en lugar de estimarla.
              </p>
            </>
          ),
        },
        {
          heading: "Cómo pedir un reembolso",
          body: (
            <>
              <p>
                Empieza con el talento que tomó la reservación (mensajes en su sitio o la
                confirmación). Si después necesitas ayuda de la plataforma, usa{" "}
                <Link href={withLocaleHref("/support", "es")} className="underline" style={linkStyle}>
                  Soporte
                </Link>
                .
              </p>
              <p>
                {PLATFORM_BRAND.name} no cobra a los clientes una tarifa de reservación
                aparte. Las comisiones y tarifas para talentos se indican en los planes.
              </p>
            </>
          ),
        },
        {
          heading: "Contracargos y disputas",
          body: (
            <p>
              Si un cliente disputa un cargo con su banco, los contracargos y las disputas son
              responsabilidad del talento. Si se pierde una disputa, {PLATFORM_BRAND.name}{" "}
              puede descontar el monto disputado y cualquier comisión de disputa de los pagos
              futuros del talento.
            </p>
          ),
        },
        {
          heading: "Términos relacionados",
          body: (
            <p>
              El lenguaje de pagos y de la plataforma también aparece en nuestros{" "}
              <Link href={withLocaleHref("/legal/terms", "es")} className="underline" style={linkStyle}>
                Términos de servicio
              </Link>
              . Si esta página y los Términos entran en conflicto en un punto material,
              escribe a{" "}
              <a
                href={`mailto:legal@${PLATFORM_BRAND.domain}`}
                className="underline"
                style={linkStyle}
              >
                legal@{PLATFORM_BRAND.domain}
              </a>
              .
            </p>
          ),
        },
      ]}
    />
  );
}
