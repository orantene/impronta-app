import type { HelpEntry } from "@/components/admin/shell/internal/help-registry";

/**
 * Spanish (Mexico) twins of TALENT_EDITION_HELP (TUL-1392). Same slugs, so a
 * locale swap replaces an entry in place. Labels are the Spanish ones of the
 * dashboard. ticketCategory stays in English because it is a routing key.
 */
export const TALENT_EDITION_HELP_ES: Record<string, HelpEntry> = {
  "talent-promos": {
    audience: "Talent",
    category: "Promos",
    purpose:
      "Promos te deja ofrecer un descuento, un extra gratis o un código secreto para llenar los días que tienes libres. La oferta aparece en tu página pública y se aplica cuando un cliente reserva.",
    youCanHere: [
      "Abrir Promos y tocar Nueva, y elegir una razón como Llena tu semana, Último momento o Código secreto",
      "Ajustar el Descuento, las Fechas y el Cupo de la oferta",
      "Ver Así lo verán y lo que ganarías aproximadamente antes de publicar",
      "Publicar ahora, Programar o Guardar borrador",
      "Seguir tus promos en las pestañas Activas, Programadas y Pasadas",
    ],
    ticketCategory: "Billing",
    faqs: [
      {
        q: "¿Cómo creo una promo?",
        a: "Abre Promos y toca Nueva. Elige una razón, ajusta el Descuento, las Fechas y el Cupo, revisa Así lo verán y toca Publicar.",
      },
      {
        q: "¿Mi primera promo es gratis?",
        a: "Sí. El plan gratis incluye una promo de prueba, hasta 7 días y 5 usos. Con Pro publicas todas las que quieras, además de códigos y ofertas personales.",
      },
      {
        q: "¿Cómo hago un código de promo?",
        a: "Elige Código secreto como razón, o elige Con código en Cómo se activa. Los códigos son parte de Pro. Tus clientes escriben el código en ¿Tienes un código? al reservar.",
      },
      {
        q: "¿Cómo pauso o termino una promo?",
        a: "Abre la promo desde la pestaña Activas y usa Activar o pausar. Las reservas que ya se hicieron conservan su precio.",
      },
      {
        q: "¿Qué ve el cliente?",
        a: "El precio anterior tachado, el precio nuevo y cuántos lugares quedan. En el pago, el descuento aparece en su propia línea. Si la oferta se agota mientras reserva, no se cobra nada y ve el precio normal.",
      },
    ],
  },
  "talent-posts": {
    audience: "Talent",
    category: "Posts (Sitio web)",
    purpose:
      "Los posts son artículos cortos en tu propio sitio web. Ayudan a que te encuentren en Google. Los encuentras en Sitio web, y luego Posts.",
    youCanHere: [
      "Abrir Posts y tocar Nuevo post para escribir uno",
      "Agregar un título, una portada con descripción para Google y escribir con bloques",
      "Guardarlo como borrador (gratis), programarlo o publicarlo",
      "Filtrar tu lista por Todos, Publicados, Borradores y Programados",
      "Cambiar cómo se ven todos tus posts con Diseño de post",
    ],
    ticketCategory: "Public site & domains",
    faqs: [
      {
        q: "¿Cómo escribo un post?",
        a: "Abre Posts y toca Nuevo post. Agrega primero un título y luego escribe. Tu trabajo se guarda mientras avanzas. Cuando estés listo, toca Publicar.",
      },
      {
        q: "¿Por qué no puedo publicar mi post?",
        a: "Los borradores son gratis, pero publicar es parte de Oficina Web. Al tocar Publicar en el plan gratis se abre una ventana con el plan. Además, un post necesita un título para poder publicarse.",
      },
      {
        q: "¿Qué significan SEO listo y SEO mejorable?",
        a: "Es una revisión rápida de qué tan fácil es que Google encuentre el post. Un título claro y una portada con descripción lo mejoran.",
      },
      {
        q: "¿Por qué mi post dice Oculto por Tulala?",
        a: "Tulala lo ocultó de tu sitio. Escríbenos desde Ayuda y lo revisamos contigo.",
      },
    ],
  },
  "talent-client-account": {
    audience: ["Talent", "Client"],
    category: "Cuentas de clientes (Clientes)",
    purpose:
      "Tus clientes pueden tener una cuenta en tu sitio. Inician sesión para ver sus reservas, mensajes y recibos en un solo lugar. Tú ves a las personas con las que trabajas en Clientes.",
    youCanHere: [
      "Abrir Clientes para ver quién ha reservado contigo",
      "Decirle a tus clientes que pueden iniciar sesión en tu sitio para encontrar Mis reservas, Mensajes, Recibos y Mi cuenta",
      "Responder a un cliente desde Mensajes",
    ],
    ticketCategory: "Bookings & inquiries",
    faqs: [
      {
        q: "¿Cómo inicia sesión un cliente?",
        a: "Desde el botón de cuenta de tu sitio, con Google, con contraseña o con un código que le llega a su correo.",
      },
      {
        q: "¿Dónde encuentra un cliente sus recibos?",
        a: "En su cuenta, en Recibos. Sus reservas están en Mis reservas y sus mensajes en Mensajes.",
      },
      {
        q: "¿Dónde veo a mis clientes?",
        a: "Abre Clientes en la barra lateral.",
      },
    ],
  },
  "talent-get-found": {
    audience: "Talent",
    category: "Que te encuentren en Google",
    purpose:
      "Que te encuentren te muestra una puntuación de qué tan fácil te encuentra Google, te dice el siguiente paso y te guía por tu Perfil de Negocio de Google y Google Search Console con tus datos ya llenos.",
    youCanHere: [
      "Abrir la página para ver tu puntuación y lo siguiente que conviene arreglar",
      "Seguir la guía del Perfil de Negocio de Google, con tu nombre, ciudad y sitio ya llenos",
      "Seguir la guía de Search Console para avisarle a Google de tu sitio",
    ],
    ticketCategory: "Public site & domains",
    faqs: [
      {
        q: "¿Cómo aparezco en Google?",
        a: "Abre la página. Tu puntuación revisa ocho cosas: sitio publicado, 3 servicios con precio, una bio de al menos 120 caracteres, 5 o más fotos, tu ciudad, tus idiomas, una reseña y tu propio dominio como extra. Arregla primero lo que más pesa.",
      },
      {
        q: "¿Cómo configuro mi Perfil de Negocio de Google?",
        a: "Abre la página y sigue la guía del Perfil de Negocio de Google. Te prepara el nombre, la categoría, la ciudad, el horario y la dirección de tu sitio para copiarlos en Google.",
      },
      {
        q: "¿Qué es Search Console?",
        a: "Es la herramienta de Google que muestra cómo llega la gente a tu sitio. La guía te lleva paso a paso a verificar tu sitio.",
      },
    ],
  },
  "talent-support": {
    audience: "Talent",
    category: "Soporte",
    purpose:
      "El soporte está dentro de tu panel. Haz una pregunta y recibe respuesta de las guías de ayuda, o escribe a una persona real de Tulala.",
    youCanHere: [
      "Abrir Ayuda y escribir tu pregunta en ¿Cómo podemos ayudarte?",
      "Tocar Iniciar chat en vivo para hablar con una persona, normalmente en minutos",
      "Tocar Abrir un ticket cuando algo está roto o falta",
      "Tocar Enviar una idea para contarnos qué haría mejor a Tulala",
    ],
    ticketCategory: "General",
    faqs: [
      {
        q: "¿Cómo hablo con una persona?",
        a: "Abre Ayuda en tu panel y toca Iniciar chat en vivo. El mensaje llega con tu cuenta y tu página ya adjuntas, así que no tienes que explicar quién eres.",
      },
      {
        q: "¿Cómo reporto algo que está roto?",
        a: "Abre Ayuda y toca Abrir un ticket. Cuéntanos qué estabas haciendo y qué esperabas.",
      },
      {
        q: "¿Puedo preguntar en español?",
        a: "Sí. Pregunta en español o en inglés, como prefieras.",
      },
    ],
  },
};
