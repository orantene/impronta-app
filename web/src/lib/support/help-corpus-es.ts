import type { HelpEntry } from "@/components/admin/shell/internal/help-registry";

/**
 * Spanish (Mexico) twins of every TALENT_HELP entry, so a talent who asks in
 * Spanish is grounded on Spanish text with the exact Spanish labels of the
 * dashboard (taken from dashboard-i18n*.ts and messages/es.json), not on
 * English text with Spanish labels inside.
 *
 * Same slugs as TALENT_HELP: a locale swap replaces an entry in place. The
 * ticketCategory stays in English because it is a routing key, not copy.
 */
export const TALENT_HELP_ES: Record<string, HelpEntry> = {
  "talent-services": {
    audience: "Talent",
    category: "Tus servicios (Servicios)",
    purpose:
      "Servicios es la lista de lo que vendes. Los mismos servicios, precios y fotos aparecen en tu página pública, donde tus clientes los reservan.",
    youCanHere: [
      "Agregar un servicio, o agregar muchos a la vez desde una lista de precios",
      "Abrir un servicio para cambiar su nombre, precio, minutos, foto y la forma en que se reserva",
      "Guardarlo como borrador, o publicarlo para que tus clientes puedan reservarlo",
      "Ver la vista previa, compartir, duplicar, ocultar o archivar un servicio desde el menú ⋯ de su fila",
    ],
    ticketCategory: "Bookings & inquiries",
    faqs: [
      {
        q: "¿Cómo agrego un servicio?",
        a: "Abre Servicios en la barra lateral y toca Agregar un servicio. Para agregar muchos a la vez, usa Agregar varios. Nada es público hasta que lo guardas y lo publicas.",
      },
      {
        q: "¿Cómo cambio el precio de un servicio?",
        a: "Abre Servicios en la barra lateral, toca el servicio, cambia el Precio y guarda. Las reservas que ya se hicieron conservan el precio acordado.",
      },
      {
        q: "¿Cómo agrego una foto a un servicio?",
        a: "Abre el servicio y usa Agregar una foto. Puedes elegir una de tu portafolio o tomarla con la cámara.",
      },
      {
        q: "¿Por qué no puedo publicar mi servicio?",
        a: "Un servicio necesita nombre, precio y minutos para poder publicarse. Si el precio depende del trabajo, elige Cotizar cada vez y solo necesita nombre. Un borrador sin precio muestra Falta precio en su fila.",
      },
      {
        q: "¿Qué significan Reserva instantánea, Pedir reserva y cotización?",
        a: "Reserva instantánea confirma la reserva de inmediato. Pedir reserva te manda la solicitud para que tú la confirmes primero. Un servicio con cotización no tiene precio fijo: el cliente pide una cotización y tú le respondes con una.",
      },
      {
        q: "¿Qué significa que a un servicio le falte el nombre en inglés?",
        a: "El servicio todavía no tiene nombre en inglés, así que quien visita tu página en inglés ve el nombre en español. Abre el servicio y agrega el nombre en inglés.",
      },
      {
        q: "¿Cómo quito un servicio de mi página sin borrarlo?",
        a: "Usa Ocultar en el menú ⋯ de su fila. Sale de tus páginas en unos minutos y nadie puede reservarlo después. Las reservas que ya se hicieron no cambian, y puedes volver a mostrarlo cuando quieras con el mismo enlace.",
      },
    ],
  },
  "talent-messages": {
    audience: "Talent",
    category: "Mensajes",
    purpose:
      "Mensajes es donde tus clientes te escriben desde tu página, y donde tú respondes, mandas cotizaciones y das seguimiento.",
    youCanHere: [
      "Leer y responder las conversaciones con tus clientes",
      "Iniciar una tú mismo con Nueva conversación",
      "Copiar el enlace de tu página para compartirlo, así las conversaciones nuevas llegan aquí",
    ],
    ticketCategory: "Bookings & inquiries",
    faqs: [
      {
        q: "¿Por qué no tengo mensajes?",
        a: "Tus clientes te escriben desde tu página. Copia tu enlace en la pantalla de Mensajes y compártelo en Instagram, WhatsApp o donde te encuentren tus clientes.",
      },
    ],
  },
  "talent-dashboard": {
    audience: "Talent",
    category: "Tu panel",
    purpose:
      "Tu panel en app.tulala.digital/talent. La barra lateral tiene Hoy, Mensajes, Calendario, Clientes, Dinero, Perfil, Mi presencia, Servicios, Reseñas y Ajustes.",
    youCanHere: [
      "Ver las reservas de hoy y lo que necesita tu atención en Hoy",
      "Editar tu perfil y cómo se ve tu página en Perfil y Mi presencia",
      "Administrar lo que vendes y sus precios en Servicios",
      "Abrir Soporte al final de la barra lateral para preguntarnos lo que quieras",
    ],
    ticketCategory: "General",
    faqs: [
      {
        q: "¿Dónde están mis precios?",
        a: "En Servicios: abre el servicio y edita su Precio.",
      },
      {
        q: "¿Cómo veo mi página pública?",
        a: "Usa Vista previa del sitio al final de la barra lateral, o el acceso al sitio en vivo en la parte de arriba de la pantalla.",
      },
    ],
  },
  "talent-hours": {
    audience: "Talent",
    category: "Tus horarios (Calendario)",
    purpose:
      "Tu horario de trabajo define las horas en que tus clientes pueden reservar contigo. Lo configuras en Calendario.",
    youCanHere: [
      "Abrir Calendario en la barra lateral y tocar Disponibilidad para abrir tu Horario",
      "Definir tu horario semanal y guardarlo",
      "Encontrar la tarjeta Horario de reservas más abajo en la página de Calendario, con el mismo horario semanal",
      "Definir el aviso mínimo y el margen después de cada reserva en Servicios, en Valores predeterminados",
    ],
    ticketCategory: "Bookings & inquiries",
    faqs: [
      {
        q: "¿Cómo cambio mi horario?",
        a: "Abre Calendario y toca Disponibilidad. Edita tu Horario semanal y guarda. Tus clientes solo ven horas dentro de este horario.",
      },
      {
        q: "¿Cómo evito que me reserven a ciertas horas?",
        a: "Tu horario semanal es lo único que tus clientes pueden reservar, así que quita o acorta ese día en Disponibilidad y guarda.",
      },
      {
        q: "¿Cómo dejo un margen entre reservas o pido aviso con anticipación?",
        a: "Abre Servicios y luego Valores predeterminados. En Preparación y márgenes define el tiempo de espera después de cada reserva, y define el Aviso mínimo que aceptas.",
      },
    ],
  },
  "talent-deposits": {
    audience: "Talent",
    category: "Anticipo y cancelación (Servicios)",
    purpose:
      "Cada servicio tiene sus propias reglas para el anticipo y para la cancelación. Están dentro del servicio, y tus Valores predeterminados completan lo que no definas.",
    youCanHere: [
      "Abrir un servicio en Servicios y encontrar Reglas que usa este servicio",
      "Elegir su Anticipo: Ninguna, 20, 25, 30 o 50 por ciento",
      "Elegir su plazo de Cancelación: 12, 24, 48 o 72 horas",
      "Tocar Usar mi predeterminado para volver a tus valores predeterminados",
    ],
    ticketCategory: "Billing",
    faqs: [
      {
        q: "¿Cómo cobro un anticipo?",
        a: "Abre Servicios, abre el servicio y, en Reglas que usa este servicio, toca Editar en Anticipo. Elige 20, 25, 30 o 50 por ciento. Elige Ninguna si el cliente paga todo el día del servicio.",
      },
      {
        q: "¿Cómo pongo el mismo anticipo en todos mis servicios?",
        a: "Abre Servicios, luego Valores predeterminados, y define ahí el Anticipo. Todo servicio sin anticipo propio lo sigue.",
      },
      {
        q: "¿Qué pasa con el anticipo si el cliente cancela?",
        a: "La cancelación gratis dura hasta las horas que elegiste antes de la reserva. Dentro de ese plazo el anticipo se queda contigo. Antes de ese plazo, se le devuelve completo al cliente.",
      },
    ],
  },
  "talent-payouts": {
    audience: "Talent",
    category: "Cobros (Dinero y Depósitos)",
    purpose:
      "Dinero muestra lo que has ganado. La página de Depósitos es donde conectas la cuenta bancaria a la que se envía tu parte de cada reserva.",
    youCanHere: [
      "Abrir Dinero en la barra lateral para ver tus ganancias",
      "En la página de Depósitos, tocar Configurar pagos, elegir tu país y conectar tu banco",
      "Tocar Actualizar banco o datos de depósito ahí mismo para cambiarlos después",
      "Ver en la misma página los depósitos que necesitan atención y el motivo",
    ],
    ticketCategory: "Billing",
    faqs: [
      {
        q: "¿Cómo configuro mis depósitos o conecto mi banco?",
        a: "Abre la página de Depósitos y toca Configurar pagos. Elige tu país de residencia y luego conecta tu banco. Una vez configurado, tu parte de cada reserva llega a tu banco automáticamente.",
      },
      {
        q: "¿Cómo cambio mi banco o mis datos de depósito?",
        a: "En la página de Depósitos toca Actualizar banco o datos de depósito.",
      },
      {
        q: "¿Por qué mi depósito está retenido o falló?",
        a: "Un depósito retenido se libera solo en cuanto tus datos de depósito están completos, y no se pierde nada. Si falló, revisa que tus datos de depósito estén completos. Si sigue igual, contacta a tu agencia o pídenos que lo revisemos.",
      },
    ],
  },
  "talent-presence": {
    audience: "Talent",
    category: "Tu página y perfil (Perfil, Mi presencia)",
    purpose:
      "Perfil guarda tus datos y Mi presencia es cómo se ve tu página pública. Tu página pública es la que visitan tus clientes para reservarte.",
    youCanHere: [
      "Editar tus datos y fotos en Perfil",
      "Cambiar cómo se ve tu página pública en Mi presencia",
      "Ver tu enlace público en Perfil cuando ya llenaste lo esencial",
      "Abrir Vista previa del sitio al final de la barra lateral para ver la página como la ve un cliente",
    ],
    ticketCategory: "Public site & domains",
    faqs: [
      {
        q: "¿Cómo publico mi sitio o mi página pública?",
        a: "Llena lo esencial en Perfil. Mientras tanto aparece como sin publicar, y cuando lo esencial está listo, Perfil te muestra la dirección donde vive tu página. Cambia el diseño en Mi presencia. Usa Vista previa del sitio para revisarla.",
      },
      {
        q: "¿Cómo cambio lo que muestra mi página?",
        a: "Abre Mi presencia en la barra lateral. Para elegir otro diseño o tema, presiona Cambiar diseño ahí. Tus servicios y precios vienen de Servicios, y tus datos y fotos de Perfil.",
      },
    ],
  },
  "talent-design": {
    audience: "Talent",
    category: "Diseño y tema (Cambiar diseño)",
    purpose:
      "Cambiar diseño es como eliges otro diseño o tema para tu sitio web. Está en Mi presencia, en la pestaña Mi sitio web.",
    youCanHere: [
      "Abrir Mi presencia, luego Mi sitio web, y presionar Cambiar diseño para elegir un diseño o tema nuevo",
      "Dentro del editor del sitio, abrir el panel Diseño para ajustar colores, tipografías y estilo",
    ],
    ticketCategory: "Public site & domains",
    faqs: [
      {
        q: "¿Cómo cambio mi diseño o tema?",
        a: "Abre Mi presencia, ve a Mi sitio web y presiona Cambiar diseño. En el editor también puedes usar el panel Diseño. Vista previa del sitio solo muestra la página, no cambia el diseño.",
      },
    ],
  },
  "talent-reviews": {
    audience: "Talent",
    category: "Reseñas",
    purpose:
      "Reseñas muestra lo que dicen tus clientes después de trabajar contigo.",
    youCanHere: [
      "Abrir Reseñas en la barra lateral para leer lo que dicen tus clientes",
      "Publicar la reseña de un cliente para que aparezca en tu perfil público",
    ],
    ticketCategory: "General",
    faqs: [
      {
        q: "¿Cómo muestro una reseña en mi perfil?",
        a: "Cuando un cliente deja una reseña, puedes publicarla con Publicar reseña. Mientras no la publiques, no aparece en tu perfil público.",
      },
    ],
  },
};
