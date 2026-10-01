import Link from "next/link";
import { LegalPage } from "@/components/marketing/legal-page";
import { PLATFORM_BRAND } from "@/lib/platform/brand";

// DRAFT PENDING LEGAL REVIEW (2026-10-01). Spanish version of the Cookies page,
// equivalent to ./page.tsx. Cookie names and durations are the same rows; keep
// both files in step whenever a cookie or storage key is added.

type Row = readonly [name: string, purpose: string, who: string, duration: string];

const ESSENTIAL: readonly Row[] = [
  ["sb-*-auth-token, sb-*-code-verifier", "Mantiene tu sesión iniciada; seguridad del inicio de sesión", "Supabase", "Hasta unos 400 días"],
  ["impronta_guest", "Identidad de chat como invitado y de talentos guardados", "Tulala", "400 días"],
  ["impronta_impersonation, impronta_preview, impronta_edit, impronta_invite", "Funciones de personal, vista previa, edición e invitaciones", "Tulala", "De 15 minutos a 8 horas"],
  ["__stripe_mid, __stripe_sid", "Prevención de fraude durante los pagos", "Stripe", "1 año / 30 minutos"],
  ["Registro de consentimiento (almacenamiento local)", "Recuerda tu elección sobre las cookies", "Tulala", "Hasta que lo borres"],
];

const FUNCTIONAL: readonly Row[] = [
  ["locale, locale_auto, locale-suggest-dismissed, tulala-currency", "Idioma y moneda", "Tulala", "Hasta 400 días"],
  ["impronta.active_tenant_id, tulala.talent.active_tenant_id", "Recuerda tu espacio de trabajo activo", "Tulala", "De 90 a 365 días"],
  ["Almacenamiento del navegador para borradores", "Borradores de reservaciones y chat, autoguardado de formularios, correo recordado para iniciar sesión, favoritos", "Tulala", "Sesión de la pestaña o hasta que se borre"],
  ["Caché sin conexión (service worker)", "Permite que la app muestre una página sin conexión", "Tulala", "Por versión"],
];

const OPTIONAL: readonly Row[] = [
  ["_ga, _ga_*", "Analítica: cómo se usan las páginas", "Google", "2 años"],
  ["impronta_vid", "Identificador de visitante para pruebas A/B", "Tulala", "365 días"],
  ["Identificador de visita (almacenamiento de sesión)", "Eventos de analítica propia", "Tulala", "Sesión de la pestaña"],
  ["_fbp, _ttp, li_*, _gcl_*", "Publicidad, solo si un talento o agencia agrega esas etiquetas a su propio sitio", "Meta, TikTok, LinkedIn, Google", "Hasta 13 meses"],
];

function CookieTable({ rows }: { rows: readonly Row[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm" style={{ minWidth: 560 }}>
        <thead>
          <tr>
            <th className="py-2 pr-3 font-semibold">Nombre</th>
            <th className="py-2 pr-3 font-semibold">Finalidad</th>
            <th className="py-2 pr-3 font-semibold">La establece</th>
            <th className="py-2 font-semibold">Dura</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]} className="align-top">
              <td className="py-2 pr-3 break-words">{r[0]}</td>
              <td className="py-2 pr-3">{r[1]}</td>
              <td className="py-2 pr-3">{r[2]}</td>
              <td className="py-2">{r[3]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CookiesEs() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Cookies y almacenamiento"
      lastUpdated="2026-10-01"
      lastUpdatedLabel="Última actualización"
      intro={
        <p>
          {PLATFORM_BRAND.name} usa cookies y almacenamiento similar del navegador para
          mantener tu sesión iniciada, recordar tus ajustes y, solo si lo aceptas, medir cómo
          se usa el producto. Esta página enumera lo que usamos. Consulta también nuestro{" "}
          <Link href="/legal/privacy" className="underline" style={{ color: "var(--plt-ink)" }}>
            Política de privacidad
          </Link>
          .
        </p>
      }
      sections={[
        {
          heading: "Esenciales",
          body: (
            <>
              <p>Son necesarias para el inicio de sesión, la seguridad y los pagos. No requieren consentimiento.</p>
              <CookieTable rows={ESSENTIAL} />
            </>
          ),
        },
        {
          heading: "Funcionales",
          body: (
            <>
              <p>Recuerdan tus elecciones y borradores. No se usan para publicidad.</p>
              <CookieTable rows={FUNCTIONAL} />
            </>
          ),
        },
        {
          heading: "Opcionales",
          body: (
            <>
              <p>
                Las cookies de analítica y de publicidad son opcionales. La analítica se activa
                solo después de que la aceptes, y los píxeles de publicidad permanecen apagados
                hasta que des tu consentimiento.
              </p>
              <CookieTable rows={OPTIONAL} />
              <p>
                Los talentos y las agencias pueden agregar sus propias etiquetas a sus sitios.
                Es decisión suya, y la misma elección de consentimiento está pensada para
                aplicarse a ellas.
              </p>
            </>
          ),
        },
        {
          heading: "Tus opciones",
          body: (
            <>
              <p>
                Usa el enlace &ldquo;Opciones de privacidad&rdquo; del pie de página para aceptar o
                rechazar las cookies opcionales en cualquier momento. También tratamos una señal
                de Global Privacy Control de tu navegador como una solicitud de rechazar las
                cookies opcionales. Además, puedes bloquear o borrar las cookies en la
                configuración de tu navegador, aunque algunas partes del servicio podrían dejar
                de funcionar.
              </p>
              <p>
                Parte del contenido incrustado, como videos, mapas y reproductores de música,
                puede establecer sus propias cookies al cargarse. Esas las controla el
                proveedor.
              </p>
            </>
          ),
        },
        {
          heading: "Contacto",
          body: (
            <p>
              Preguntas:{" "}
              <a
                href={`mailto:privacy@${PLATFORM_BRAND.domain}`}
                className="underline"
                style={{ color: "var(--plt-ink)" }}
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
