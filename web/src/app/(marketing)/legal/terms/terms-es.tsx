import { LegalPage } from "@/components/marketing/legal-page";
import { PLATFORM_BRAND } from "@/lib/platform/brand";

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
              {/* LEGAL_REVIEW_PENDING: talent is merchant of record (owner decision 2026-10-01) */}
              <p>
                El talento es el comerciante registrado de cada pago con tarjeta que recibe, mediante su cuenta de Stripe Connect. Los contracargos, las disputas perdidas y la facturación fiscal (por ejemplo, el CFDI en México) corresponden al talento.
              </p>
              <p>
                {PLATFORM_BRAND.name} cobra los pagos con tarjeta de las reservaciones en
                nombre del talento o espacio de trabajo que presta el servicio, mediante
                Stripe Connect. Los datos de la tarjeta se ingresan en Stripe y nunca pasan
                por {PLATFORM_BRAND.name}. Pagamos al talento o espacio de trabajo una vez que
                completa el registro para recibir pagos.
              </p>
              <p>
                Los reembolsos siguen la política de reembolso que el talento eligió para la
                reservación, y {PLATFORM_BRAND.name} los procesa. Si un cliente disputa un cargo
                con su banco, el costo de una disputa perdida sale de la parte del talento. Si
                no se puede recuperar, {PLATFORM_BRAND.name} lo cubre y puede descontar el monto
                de pagos futuros.
              </p>
              <p>
                Actualmente no hay una tarifa de reservación aparte para los clientes. Las
                comisiones y tarifas se indican en los planes.
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
