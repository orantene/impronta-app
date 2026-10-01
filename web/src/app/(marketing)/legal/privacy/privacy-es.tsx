import Link from "next/link";
import type { ReactNode } from "react";
import { LegalPage } from "@/components/marketing/legal-page";
import { PLATFORM_BRAND } from "@/lib/platform/brand";

// DRAFT PENDING LEGAL REVIEW (2026-10-01). Spanish version of the Privacy
// Policy, equivalent to ./page.tsx. No claim here may go beyond the English
// one (same retention periods, same providers, same rights). When the English
// changes, change this file in the same commit.

const linkStyle = { color: "var(--plt-ink)" } as const;

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="underline" style={linkStyle} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export function PrivacyEs() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Política de privacidad"
      lastUpdated="2026-10-01"
      lastUpdatedLabel="Última actualización"
      intro={
        <p>
          {PLATFORM_BRAND.name} es una plataforma donde talentos, agencias y otros negocios
          basados en un roster administran su perfil, sitio web, solicitudes, reservaciones y
          pagos. Esta política explica qué datos recopilamos, por qué, quién más los maneja,
          cuánto tiempo los conservamos y qué puedes pedirnos que hagamos. Escribimos estas
          páginas en lenguaje sencillo a propósito. {PLATFORM_BRAND.name} es solo para personas
          adultas (18 años o más).
        </p>
      }
      sections={[
        {
          heading: "Quiénes somos y cuál es nuestro papel",
          body: (
            <>
              <p>
                {PLATFORM_BRAND.legalName} opera {PLATFORM_BRAND.name}. Para las cuentas, el
                directorio, las reseñas, los pagos, la seguridad y la analítica del producto que
                operamos nosotros mismos, decidimos por qué y cómo se usan los datos (somos el
                responsable del tratamiento).
              </p>
              <p>
                Los talentos y las agencias administran sus propios sitios y relaciones con
                clientes en {PLATFORM_BRAND.name}. Para las solicitudes, los mensajes, las
                reservaciones y los datos de clientes que reciben a través de sus páginas, ellos
                deciden cómo se usan los datos, y nosotros los procesamos por cuenta de ellos
                para prestar el servicio. Si eres cliente de un talento o de una agencia, ellos
                son tu primer contacto para preguntas sobre esos datos.
              </p>
            </>
          ),
        },
        {
          heading: "Qué recopilamos",
          body: (
            <>
              <p>
                <strong>Datos de cuenta e identidad</strong>: nombre, nombre para mostrar,
                correo electrónico, teléfono y datos de la organización que nos proporcionas.
                Algunos campos del perfil, como la fecha de nacimiento, son opcionales y tienen
                su propio ajuste de visibilidad.
              </p>
              <p>
                <strong>Contenido del perfil y del sitio</strong>: biografía, servicios,
                precios, disponibilidad, ubicación a nivel de ciudad, fotos, video, reseñas y
                configuración del sitio. El contenido que publicas es público.
              </p>
              <p>
                <strong>Solicitudes, mensajes y reservaciones</strong>: los datos de contacto,
                el texto de los mensajes, los archivos adjuntos, las ofertas y los registros de
                reservaciones que intercambian clientes, talentos y agencias.
              </p>
              <p>
                <strong>Registros de pago</strong>: referencias de Stripe, montos, pagos a
                talentos, reembolsos y disputas. Los números de tarjeta van directamente a
                Stripe y nunca pasan por nuestros servidores. Las verificaciones de identidad y
                de cuenta bancaria para recibir pagos las conserva Stripe.
              </p>
              <p>
                <strong>Datos de uso y del dispositivo</strong>: dirección IP, tipo de
                navegador, páginas vistas y datos de rendimiento. Las cookies de analítica se
                usan solo si las aceptas (consulta{" "}
                <Link href="/legal/cookies" className="underline" style={linkStyle}>
                  Cookies
                </Link>
                ).
              </p>
              <p>
                <strong>Registros de seguridad, auditoría y errores</strong> y, para las
                funciones de IA, el texto que les envías. En la búsqueda con IA guardamos el
                texto de la consulta.
              </p>
              <p>
                <strong>Preferencias de marketing</strong>: si te suscribiste o te diste de baja
                de nuestros correos.
              </p>
              <p>
                No recopilamos datos de tutores, números de identificación oficial ni domicilios
                particulares como parte del servicio.
              </p>
            </>
          ),
        },
        {
          heading: "Cómo lo usamos",
          body: (
            <p>
              Para operar el servicio (mostrar tu sitio, entregar solicitudes y mensajes, cobrar
              y pagar, enviar correos transaccionales), para mantener segura la plataforma y
              prevenir fraude y abuso, para mejorar el producto, para mostrar a los talentos en
              nuestro directorio y marketing cuando han elegido ser descubiertos, y para cumplir
              obligaciones legales. No vendemos datos personales.
            </p>
          ),
        },
        {
          heading: "Proveedores que manejan datos por nosotros",
          body: (
            <>
              <p>Usamos estos proveedores. Cada uno recibe solo lo que necesita para hacer su trabajo.</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  <Ext href="https://vercel.com/legal/privacy-policy">Vercel</Ext>: alojamiento y
                  entrega, además de medición de páginas vistas y de rendimiento sin cookies.
                </li>
                <li>
                  <Ext href="https://supabase.com/privacy">Supabase</Ext>: base de datos, inicio
                  de sesión, almacenamiento de archivos y mensajería en tiempo real.
                </li>
                <li>
                  <Ext href="https://stripe.com/privacy">Stripe</Ext>: pagos con tarjeta, pagos a
                  talentos y facturación de suscripciones. Stripe también es un responsable
                  independiente de su propia verificación de identidad y revisiones de fraude.
                </li>
                <li>
                  <Ext href="https://resend.com/legal/privacy-policy">Resend</Ext>: envío de
                  correo electrónico.
                </li>
                <li>
                  <Ext href="https://policies.google.com/privacy">Google</Ext>: Analytics (solo
                  después de que aceptes las cookies de analítica) y Google Maps (mapas, lugares
                  e indicaciones).
                </li>
                <li>
                  <Ext href="https://sentry.io/privacy/">Sentry</Ext>: monitoreo de errores y de
                  rendimiento.
                </li>
                <li>
                  <Ext href="https://www.anthropic.com/legal/privacy">Anthropic</Ext> y{" "}
                  <Ext href="https://openai.com/policies/privacy-policy">OpenAI</Ext>: funciones
                  de IA opcionales (consulta Funciones de IA más abajo).
                </li>
                <li>
                  <Ext href="https://upstash.com/trust/privacy.pdf">Upstash</Ext>: limitación de
                  solicitudes, con identificadores cifrados mediante hash.
                </li>
                <li>
                  Contenido incrustado de servicios como YouTube, Vimeo, Spotify, SoundCloud,
                  Calendly, Instagram y TikTok, cuando una página que visitas lo incluye. Estos
                  servicios pueden recibir tu dirección IP y establecer sus propias cookies.
                </li>
              </ul>
              <p>
                Los talentos y las agencias pueden agregar sus propias etiquetas de analítica o
                publicidad a sus sitios. Es decisión suya y ellos son responsables de esas
                etiquetas.
              </p>
            </>
          ),
        },
        {
          heading: "Cookies",
          id: "cookies",
          body: (
            <p>
              Usamos cookies esenciales para mantener tu sesión iniciada y el servicio
              funcionando, cookies funcionales para recordar idioma y moneda, y cookies
              opcionales de analítica solo si das tu consentimiento. La lista completa, y cómo
              cambiar tu elección con el enlace &ldquo;Opciones de privacidad&rdquo;, está en la{" "}
              <Link href="/legal/cookies" className="underline" style={linkStyle}>
                página de Cookies
              </Link>
              .
            </p>
          ),
        },
        {
          heading: "Pagos",
          body: (
            <>
              <p>
                Los pagos con tarjeta los procesa Stripe. El talento o espacio de trabajo que
                presta el servicio es el vendedor y comerciante del pago; {PLATFORM_BRAND.name}{" "}
                ofrece la plataforma y las herramientas de procesamiento de pagos, y las
                tarifas se descuentan como se describe en los planes. Los datos de la tarjeta
                se ingresan en Stripe y nunca pasan por {PLATFORM_BRAND.name}. Conservamos los
                registros de pago descritos arriba con fines contables, fiscales y de disputas.
              </p>
              <p className="text-xs opacity-70">Pendiente de revisión legal</p>
            </>
          ),
        },
        {
          heading: "Funciones de IA",
          body: (
            <p>
              Las funciones opcionales como redactar biografías, traducir, transcribir, buscar y
              el chat de soporte envían el texto que ingresas a Anthropic u OpenAI para generar
              un resultado. Algunos espacios de trabajo usan sus propias claves de API. El texto
              del perfil también puede convertirse en representaciones para la búsqueda
              (embeddings). Si no quieres que tu texto se procese de esta manera, no uses esas
              funciones.
            </p>
          ),
        },
        {
          heading: "La red compartida",
          body: (
            <p>
              El descubrimiento compartido es opcional por organización y por perfil. Nada es
              descubrible en la red a menos que lo actives, y puedes desactivarlo en cualquier
              momento.
            </p>
          ),
        },
        {
          heading: "Cuánto tiempo conservamos los datos",
          body: (
            <>
              {/* LEGAL_REVIEW_PENDING: retention periods (owner decision 2026-10-01), see src/lib/legal/retention-config.ts */}
              <p>Conservamos los datos solo el tiempo necesario. Estos son los plazos:</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>Mensajes y reservas: 3 años después de la última actividad</li>
                <li>Cuentas eliminadas: se borran 30 días después del periodo de gracia de 14 días</li>
                <li>Registros de seguridad y errores: 90 días</li>
              </ul>
              <p>
                Las copias de respaldo las conserva nuestro proveedor de base de datos y caducan
                según su calendario. Los datos que debamos conservar por ley pueden conservarse
                por más tiempo.
              </p>
            </>
          ),
        },
        {
          heading: "Tus derechos",
          body: (
            <p>
              Puedes pedir una copia de tus datos, corregirlos o que se eliminen. Puedes editar
              tú mismo la mayoría de los datos de tu perfil. Para solicitudes de acceso,
              exportación, corrección o eliminación, escribe a{" "}
              <a
                href={`mailto:privacy@${PLATFORM_BRAND.domain}`}
                className="underline"
                style={linkStyle}
              >
                privacy@{PLATFORM_BRAND.domain}
              </a>
              . Es posible que primero necesitemos confirmar tu identidad, y respondemos en un
              plazo de un mes. Podemos conservar los registros que la ley nos obligue a
              conservar. Puedes darte de baja de los correos de marketing en cualquier momento
              con el enlace que viene en el correo.
            </p>
          ),
        },
        {
          heading: "Seguridad",
          body: (
            <p>
              Los datos en tránsito se cifran con TLS. El acceso se limita por rol y las
              acciones sensibles se registran. Ningún sistema es perfectamente seguro. Para
              reportar un problema de seguridad, escribe a{" "}
              <a
                href={`mailto:security@${PLATFORM_BRAND.domain}`}
                className="underline"
                style={linkStyle}
              >
                security@{PLATFORM_BRAND.domain}
              </a>
              .
            </p>
          ),
        },
        {
          heading: "Solo personas adultas",
          body: (
            <p>
              {PLATFORM_BRAND.name} es para personas de 18 años o más, tanto talentos como
              clientes. No recopilamos a sabiendas datos de menores de 18 años. Si crees que lo
              hemos hecho, escríbenos y los eliminaremos.
            </p>
          ),
        },
        {
          heading: "Transferencias internacionales",
          body: (
            <p>
              Nuestros proveedores operan en varios países, incluido Estados Unidos, por lo que
              tus datos pueden procesarse fuera del país donde vives. Para esas transferencias
              nos apoyamos en las salvaguardas contractuales de nuestros proveedores.
            </p>
          ),
        },
        {
          heading: "Cambios",
          body: (
            <p>
              Podemos actualizar esta política a medida que cambie el producto. La fecha al
              inicio muestra la versión más reciente, y avisaremos de los cambios importantes.
            </p>
          ),
        },
        {
          heading: "Contacto",
          body: (
            <p>
              Preguntas y solicitudes de privacidad:{" "}
              <a
                href={`mailto:privacy@${PLATFORM_BRAND.domain}`}
                className="underline"
                style={linkStyle}
              >
                privacy@{PLATFORM_BRAND.domain}
              </a>
              .
            </p>
          ),
        },
      ]}
    />
  );
}
