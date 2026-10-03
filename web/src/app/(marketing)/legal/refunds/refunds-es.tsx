import Link from "next/link";
import { LegalPage } from "@/components/marketing/legal-page";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { withLocaleHref } from "@/i18n/pathnames";

// DRAFT PENDING LEGAL REVIEW (2026-10-01). Spanish version of the Refunds page,
// equivalent to ./page.tsx. No claim here may go beyond the English one. When
// the English changes, change this file in the same commit.

const linkStyle = { color: "var(--plt-ink)" } as const;

export function RefundsEs() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Política de reembolsos"
      lastUpdated="2026-10-01"
      lastUpdatedLabel="Última actualización"
      intro={
        <p>
          Esta página explica cómo funcionan los reembolsos cuando un cliente paga a un
          talento a través de {PLATFORM_BRAND.name}. Amplía la sección de Pagos de nuestros{" "}
          <Link href={withLocaleHref("/legal/terms", "es")} className="underline" style={linkStyle}>
            Términos del servicio
          </Link>
          . Consulta también nuestra{" "}
          <Link href={withLocaleHref("/legal/privacy", "es")} className="underline" style={linkStyle}>
            Política de privacidad
          </Link>
          .
        </p>
      }
      sections={[
        {
          heading: "Quién es el vendedor",
          body: (
            <>
              {/* LEGAL_REVIEW_PENDING: talent is merchant of record (owner decision 2026-10-01) */}
              <p>
                El talento es el comerciante registrado de cada pago con tarjeta que recibe,
                mediante su cuenta de Stripe Connect. El talento o espacio de trabajo es el
                vendedor. {PLATFORM_BRAND.name} ofrece la plataforma y las herramientas de
                procesamiento de pagos. Los datos de la tarjeta se ingresan en Stripe y nunca
                pasan por {PLATFORM_BRAND.name}.
              </p>
              <p className="text-xs opacity-70">Pendiente de revisión legal</p>
            </>
          ),
        },
        {
          heading: "Cómo se deciden los reembolsos",
          body: (
            <p>
              Los reembolsos siguen la política de reembolso que el talento eligió para la
              reservación. {PLATFORM_BRAND.name} procesa el reembolso cuando esa política
              indica que corresponde un monto. El talento define las ventanas de cancelación,
              los depósitos y cuánto (si algo) se devuelve cuando una reservación cambia o se
              cancela.
            </p>
          ),
        },
        {
          heading: "Comisiones de procesamiento de tarjeta",
          body: (
            <>
              <p>
                Cada pago con tarjeta lleva una comisión de procesamiento que las redes de
                tarjetas y Stripe no devuelven. Según la configuración del talento, el talento
                absorbe esta comisión o se suma al total del cliente. El monto completo,
                incluida cualquier comisión, siempre se muestra antes de que el cliente pague.
              </p>
              <p>
                Las comisiones de procesamiento de tarjeta no son reembolsables. Ni el talento
                ni {PLATFORM_BRAND.name} cubren esas comisiones cuando se emite un reembolso.
              </p>
            </>
          ),
        },
        {
          heading: "Qué recibes de vuelta",
          body: (
            <p>
              Un reembolso es el monto reembolsable según la política de reembolso del talento
              menos las comisiones de procesamiento de ese pago. Si aún no se puede confirmar
              la comisión real, el reembolso espera hasta poder confirmarla, en lugar de
              estimarse.
            </p>
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
          heading: "Políticas relacionadas",
          body: (
            <p>
              Las reglas de reservación y las ventanas de reembolso están en las políticas
              publicadas del talento. Las reglas de la plataforma sobre cuentas, pagos y uso
              del servicio están en los{" "}
              <Link href={withLocaleHref("/legal/terms", "es")} className="underline" style={linkStyle}>
                Términos del servicio
              </Link>
              . Cómo tratamos los registros de pago y los datos personales está en la{" "}
              <Link href={withLocaleHref("/legal/privacy", "es")} className="underline" style={linkStyle}>
                Política de privacidad
              </Link>
              .
            </p>
          ),
        },
        {
          heading: "Contacto",
          body: (
            <p>
              Preguntas sobre esta política de reembolsos:{" "}
              <a
                href={`mailto:legal@${PLATFORM_BRAND.domain}`}
                className="underline"
                style={linkStyle}
              >
                legal@{PLATFORM_BRAND.domain}
              </a>
              . Para una reservación concreta, contacta primero al talento; el talento
              define la política que aplica.
            </p>
          ),
        },
      ]}
    />
  );
}
