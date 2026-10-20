import Link from "next/link";
import { LegalPage } from "@/components/marketing/legal-page";
import { clientServiceFeePercentLabel } from "@/lib/billing/fee-config";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { withLocaleHref } from "@/i18n/pathnames";

// DRAFT PENDING LEGAL REVIEW (2026-10-01). Spanish version of the Terms page,
// equivalent to the English text in ./page.tsx. No claim here may go beyond the
// English one. When the English changes, change this file in the same commit.

export function TermsEs() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Términos de servicio"
      lastUpdated="2026-10-01"
      lastUpdatedLabel="Última actualización"
      intro={
        <p>
          Al usar {PLATFORM_BRAND.name}{" "}aceptas estos términos. Los hemos mantenido breves y
          claros, sin letra chiquita. Si algo es ambiguo, prevalece la lectura en lenguaje
          sencillo.
        </p>
      }
      sections={[
        {
          heading: "Tu cuenta",
          body: (
            <>
  <p>
                Eres responsable de mantener seguras las credenciales de tu cuenta y de las
                acciones que se realicen con ella. Todas las personas que usan{" "}
                {PLATFORM_BRAND.name}, talentos y clientes por igual, deben tener 18 años o más.
                Para cerrar tu cuenta, contacta a soporte y te ayudaremos.
              </p>
              {/* LEGAL_REVIEW_PENDING: 18+ for talents and paying clients (owner decision 2026-10-01) */}
              <p>
                Para ser talento, o cliente que paga en Tulala, debes tener 18 años o más. Si descubrimos que alguien es menor de 18, podemos cerrar la cuenta.
              </p>
            </>
          ),
        },
        {
          heading: "Tu contenido",
          body: (
            <p>
              Conservas la propiedad total de todo lo que subes: perfiles de personas,
              medios, textos del sitio, solicitudes. Le otorgas a {PLATFORM_BRAND.name} una
              licencia limitada para alojar, mostrar y distribuir ese contenido según tus
              indicaciones (sitio público del roster, red compartida, etc.).
            </p>
          ),
        },
        {
          heading: "Uso aceptable",
          body: (
            <>
              <p>No uses {PLATFORM_BRAND.name} para:</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>Alojar contenido que viole los derechos de terceros</li>
                <li>Representar o colocar a personas sin su consentimiento</li>
                <li>Acosar, perjudicar o dirigirte contra personas u organizaciones</li>
                <li>Intentar interrumpir o eludir la seguridad de la plataforma</li>
              </ul>
            </>
          ),
        },
        {
          heading: "Suscripción y facturación",
          body: (
            <p>
              Los planes de pago se cobran de forma mensual o anual. Los planes anuales se
              pagan por adelantado a diez veces la tarifa mensual, así que doce meses cuestan
              el precio de diez. Puedes cancelar en cualquier momento; el acceso continúa
              hasta el final del periodo vigente. Se aplican impuestos y localización de
              moneda según la región.
            </p>
          ),
        },
        {
          heading: "Pagos",
          body: (
            <>
              {/* LEGAL_REVIEW_PENDING: collect-and-pay-out model (TUL-43 option A, Oran 2026-10-16); counsel review pending */}
              <p>
                El talento o espacio de trabajo es el vendedor del servicio. En los pagos con tarjeta, Tulala cobra el pago del cliente mediante su procesador de pagos, Stripe, y después paga la parte del vendedor a su cuenta de cobro. El vendedor es responsable de la facturación fiscal del servicio (por ejemplo, el CFDI en México). Tulala es responsable de facturar sus propias tarifas y planes.
              </p>
              <p>
                {PLATFORM_BRAND.name} ofrece la plataforma y las herramientas de pago, mediante
                Stripe. Los datos de la tarjeta se ingresan en Stripe y nunca pasan por{" "}
                {PLATFORM_BRAND.name}. La parte del vendedor se paga una vez que el talento o
                espacio de trabajo completa el registro para recibir pagos, después de
                reembolsos y comisiones de procesamiento.
              </p>
              <p className="text-xs opacity-70">Pendiente de revisión legal</p>
              <p>
                Los reembolsos siguen la política de reembolso que el talento eligió para la
                reservación, y {PLATFORM_BRAND.name} los procesa. El detalle está en la página
                de{" "}
                <Link
                  href={withLocaleHref("/legal/refunds", "es")}
                  className="underline"
                  style={{ color: "var(--plt-ink)" }}
                >
                  Política de reembolsos
                </Link>
                . Si un cliente disputa un cargo con su banco, la disputa se presenta
                contra la cuenta de pagos de {PLATFORM_BRAND.name}, y {PLATFORM_BRAND.name} la
                gestiona ante la red de tarjetas, con la ayuda del talento para las pruebas. Si
                se pierde una disputa, {PLATFORM_BRAND.name} puede revertir el pago de esa
                transacción y puede recuperar la comisión de disputa de los pagos futuros del
                vendedor.
              </p>
              <p>
                Comisiones de procesamiento de tarjeta: cada pago con tarjeta lleva una comisión
                de procesamiento que las redes de tarjetas y Stripe no devuelven. Según la
                configuración del talento, el talento absorbe esta comisión o se suma al total
                del cliente. El monto completo, incluida cualquier comisión, siempre se muestra
                antes de que el cliente pague.
              </p>
              <p>
                Como las comisiones de procesamiento no se devuelven, un reembolso es el monto
                reembolsable según la política de reembolso del talento menos las comisiones de
                procesamiento de ese pago. Ni el talento ni {PLATFORM_BRAND.name} cubren esas
                comisiones. Si todavía no se puede confirmar la comisión real, el reembolso
                espera a que se pueda, en lugar de estimarse.
              </p>
              <p>
                Tarifa de servicio: los clientes pagan una tarifa de servicio de{" "}
                {PLATFORM_BRAND.name} de {clientServiceFeePercentLabel()} sobre el precio de la reservación. Se muestra al
                pagar, antes de que el cliente confirme, y es independiente de la comisión de
                procesamiento de tarjeta descrita arriba. Se devuelve completa cuando quien
                vende cancela la reservación y se conserva cuando cancela el cliente. Las comisiones y tarifas para talentos
                se indican en los planes.
              </p>
            </>
          ),
        },
        {
          heading: "Responsabilidades del talento",
          body: (
            <p>
              Los talentos fijan sus propios precios, disponibilidad y políticas de
              reservación, y prestan sus servicios por sí mismos. Las licencias,
              certificaciones y otras credenciales que aparecen en un perfil las declara el
              talento. {PLATFORM_BRAND.name} no las verifica, y los talentos son responsables
              de contar con las licencias que requiera su trabajo.
            </p>
          ),
        },
        {
          heading: "Plataforma de conexión",
          body: (
            <p>
              {PLATFORM_BRAND.name} ofrece la plataforma que conecta a clientes con talentos y
              agencias. No somos el proveedor de los servicios de los talentos ni parte del
              acuerdo entre un cliente y un talento.
            </p>
          ),
        },
        {
          heading: "Disponibilidad del servicio",
          body: (
            <p>
              Buscamos una disponibilidad del 99.9% con el mejor esfuerzo posible. Podemos
              realizar mantenimiento con un aviso razonable. Los acuerdos de nivel de
              servicio para clientes empresariales se pactan por separado.
            </p>
          ),
        },
        {
          heading: "Responsabilidad",
          body: (
            <p>
              {PLATFORM_BRAND.name}{" "}se ofrece &ldquo;tal cual&rdquo;. En la medida que la ley lo
              permita, nuestra responsabilidad total se limita a las tarifas pagadas en los 12
              meses anteriores a la reclamación. No somos responsables de daños indirectos ni
              consecuentes.
            </p>
          ),
        },
        {
          heading: "Cambios",
          body: (
            <p>
              Podemos actualizar estos términos a medida que el producto evolucione. Los
              cambios importantes se anunciarán con al menos 30 días de anticipación. Si sigues
              usando el servicio después de los cambios, aceptas los términos actualizados.
            </p>
          ),
        },
        {
          heading: "Contacto",
          body: (
            <p>
              Preguntas sobre estos términos:{" "}
              <a
                href={`mailto:legal@${PLATFORM_BRAND.domain}`}
                className="underline"
                style={{ color: "var(--plt-ink)" }}
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
