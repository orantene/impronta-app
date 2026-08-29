import type { Feature } from "./types";

/**
 * Stage 01, Build your presence. Plates 01 to 04.
 *
 * Depth note: plate 01 is Tier S and gets its long form in the Tier S content
 * pass. What is here is the popup and a real, publishable page body, so the
 * hub never ships a thin page waiting for content.
 */
export const PRESENCE_FEATURES: Feature[] = [

  {
    key: "talent-profiles",
    plate: 2,
    group: "presence",
    slugEn: "talent-profiles",
    slugEs: "portafolio-de-talento",
    tier: "A",
    status: "live",
    related: ["website-builder", "media-library", "directory", "reviews-and-trust"],
    en: {
      name: "Talent Profiles & Portfolios",
      title: "A portfolio that gets you hired",
      subtitle:
        "Professional pages with your photos, video and press, plus a PDF media kit you can send to a client in one click.",
      promise: "Your work, presented like it deserves.",
      popup: [
        [
          "A profile built for getting booked: photos, video, measurements or specialities, press and past work, all in a layout that looks deliberate instead of improvised.",
        ],
        [
          "One click turns it into a PDF media kit you can send to a client or a casting, with your details and your best work already laid out.",
        ],
        [
          "It carries your ",
          { f: "reviews-and-trust", label: "reviews and verification" },
          ", so a stranger has a reason to believe you.",
        ],
      ],
      intro: [
        [
          "Most people lose work before the conversation starts. A folder of screenshots, a slow gallery, a media kit made in a slideshow app two years ago. The work is good and the presentation says otherwise.",
        ],
      ],
      sections: [
        {
          heading: "Built for the way clients actually decide",
          body: [
            [
              "A client scanning ten profiles gives each one seconds. Yours leads with images, keeps the details they need within reach, and never makes them hunt for how to contact you.",
            ],
          ],
        },
        {
          heading: "A media kit without the design work",
          body: [
            [
              "Your profile generates a clean PDF on demand, so you are never rebuilding a document at midnight because someone asked for one. It updates when your profile does.",
            ],
          ],
        },
      ],
      highlights: [
        "Photo and video portfolio",
        "PDF media kit generated on demand",
        "Press, credits and past work",
        "Your own page templates",
        "Works as a standalone site on a paid plan",
      ],
      faq: [
        {
          q: "Can I have my own domain for my profile?",
          a: "Yes, on the top personal plan your profile becomes a full site on your own domain.",
        },
        {
          q: "Who can see my contact details?",
          a: "You choose what is public. Clients reach you through your inbox by default, so your personal number is not published to the internet.",
        },
      ],
    },
    es: {
      name: "Perfiles y portafolios",
      title: "Un portafolio que te consigue trabajo",
      subtitle:
        "Páginas profesionales con tus fotos, video y prensa, más un media kit en PDF que puedes enviar a un cliente en un clic.",
      promise: "Tu trabajo, presentado como se merece.",
      popup: [
        [
          "Un perfil hecho para que te contraten: fotos, video, medidas o especialidades, prensa y trabajos anteriores, en un diseño que se ve pensado y no improvisado.",
        ],
        [
          "Un clic lo convierte en un media kit en PDF que puedes mandar a un cliente o a un casting, con tus datos y tu mejor trabajo ya acomodados.",
        ],
        [
          "Lleva tus ",
          { f: "reviews-and-trust", label: "reseñas y verificación" },
          ", para que un desconocido tenga razones para creerte.",
        ],
      ],
      intro: [
        [
          "La mayoría pierde trabajo antes de que empiece la conversación. Una carpeta de capturas, una galería lenta, un media kit hecho en una app de presentaciones hace dos años. El trabajo es bueno y la presentación dice lo contrario.",
        ],
      ],
      sections: [
        {
          heading: "Hecho para cómo deciden los clientes en realidad",
          body: [
            [
              "Un cliente que revisa diez perfiles le da segundos a cada uno. El tuyo abre con imágenes, deja a la mano los datos que necesita y nunca lo obliga a buscar cómo contactarte.",
            ],
          ],
        },
        {
          heading: "Un media kit sin trabajo de diseño",
          body: [
            [
              "Tu perfil genera un PDF limpio cuando lo pidas, así nunca estás rehaciendo un documento a medianoche porque alguien te lo pidió. Se actualiza cuando actualizas tu perfil.",
            ],
          ],
        },
      ],
      highlights: [
        "Portafolio de foto y video",
        "Media kit en PDF generado al momento",
        "Prensa, créditos y trabajos anteriores",
        "Plantillas propias para tu página",
        "Funciona como sitio independiente en plan de pago",
      ],
      faq: [
        {
          q: "¿Puedo tener mi propio dominio para mi perfil?",
          a: "Sí, en el plan personal más alto tu perfil se convierte en un sitio completo con tu propio dominio.",
        },
        {
          q: "¿Quién puede ver mis datos de contacto?",
          a: "Tú eliges qué es público. Por defecto los clientes te escriben por tu bandeja de entrada, así que tu número personal no queda publicado en internet.",
        },
      ],
    },
  },

  {
    key: "services-storefront",
    plate: 3,
    group: "presence",
    slugEn: "services-storefront",
    slugEs: "vitrina-de-servicios",
    tier: "A",
    status: "live",
    related: ["appointments", "payments", "website-builder", "discounts-and-campaigns"],
    en: {
      name: "Services Storefront",
      title: "Publish your services, menus and prices",
      subtitle:
        "Show what you sell with services, menus, packages and rates, including variants and add ons, so people know the price before they ask.",
      promise: "What you sell, priced and ready to buy.",
      popup: [
        [
          "List your services and menus with real prices, or with a starting price when every job is different. Add options like length or size, and extras people can add on.",
        ],
        [
          "Each service carries its own rules: how long it takes, whether it can be ",
          { f: "appointments", label: "booked online" },
          ", and whether it needs a deposit.",
        ],
      ],
      intro: [
        [
          "Every message that starts with how much do you charge is a message you should not have needed to answer. Published prices filter out the people who were never going to pay and speed up the ones who were.",
        ],
      ],
      sections: [
        {
          heading: "Priced your way",
          body: [
            [
              "By the hour, by the day, per person, per event, or a flat package. Show an exact price, a from price, or invite a quote when the job is genuinely custom.",
            ],
          ],
        },
        {
          heading: "Variants and extras, without a second system",
          body: [
            [
              "A thirty minute version and a sixty minute version of the same service, or an add on that raises the price. The client picks, and the total is right before they book.",
            ],
          ],
        },
      ],
      highlights: [
        "Services, menus, packages and products",
        "Exact price, from price, or quote on request",
        "Variants and add ons",
        "Per service booking and deposit rules",
        "Shown on your site and your profile",
      ],
      faq: [
        {
          q: "What if my prices change per client?",
          a: "Use a from price or a quote on request. You can still publish the service so people know it exists and what it roughly costs.",
        },
        {
          q: "Is this the same as a restaurant menu?",
          a: "Yes. A menu is a list of things you sell with prices, so restaurants, barbers and salons all publish theirs the same way.",
        },
      ],
    },
    es: {
      name: "Vitrina de servicios",
      title: "Publica tus servicios, menús y precios",
      subtitle:
        "Muestra lo que vendes con servicios, menús, paquetes y tarifas, con variantes y extras, para que sepan el precio antes de preguntar.",
      promise: "Lo que vendes, con precio y listo para comprar.",
      popup: [
        [
          "Publica tus servicios y menús con precios reales, o con un precio desde cuando cada trabajo es distinto. Agrega opciones como duración o tamaño, y extras que la gente pueda añadir.",
        ],
        [
          "Cada servicio lleva sus propias reglas: cuánto dura, si se puede ",
          { f: "appointments", label: "reservar en línea" },
          " y si necesita anticipo.",
        ],
      ],
      intro: [
        [
          "Cada mensaje que empieza con cuánto cobras es un mensaje que no deberías haber tenido que contestar. Los precios publicados filtran a quien nunca iba a pagar y aceleran a quien sí.",
        ],
      ],
      sections: [
        {
          heading: "Con el precio que a ti te sirve",
          body: [
            [
              "Por hora, por día, por persona, por evento o como paquete cerrado. Muestra un precio exacto, un precio desde, o invita a cotizar cuando el trabajo es realmente a la medida.",
            ],
          ],
        },
        {
          heading: "Variantes y extras, sin un segundo sistema",
          body: [
            [
              "Una versión de treinta minutos y una de sesenta del mismo servicio, o un extra que sube el precio. El cliente elige y el total es correcto antes de reservar.",
            ],
          ],
        },
      ],
      highlights: [
        "Servicios, menús, paquetes y productos",
        "Precio exacto, precio desde o cotización",
        "Variantes y extras",
        "Reglas de reserva y anticipo por servicio",
        "Visible en tu sitio y en tu perfil",
      ],
      faq: [
        {
          q: "¿Y si mis precios cambian según el cliente?",
          a: "Usa un precio desde o cotización a solicitud. Aun así puedes publicar el servicio para que la gente sepa que existe y cuánto cuesta más o menos.",
        },
        {
          q: "¿Es lo mismo que un menú de restaurante?",
          a: "Sí. Un menú es una lista de lo que vendes con precios, así que restaurantes, barberías y salones publican el suyo de la misma forma.",
        },
      ],
    },
  },

  {
    key: "media-library",
    plate: 4,
    group: "presence",
    slugEn: "media-library",
    slugEs: "biblioteca-de-medios",
    tier: "B",
    status: "live",
    related: ["website-builder", "talent-profiles", "services-storefront"],
    en: {
      name: "Media Library",
      title: "All your photos and video in one place",
      subtitle:
        "Every image and video you use, organised and reusable across your site and profile, with stock photography and AI images included.",
      promise: "Upload once, use everywhere.",
      popup: [
        [
          "One place for your images and video, so you are not hunting through your phone every time you build a page.",
        ],
        [
          "Stock photography and AI generated images are included, which matters when you are starting out and do not have a shoot yet.",
        ],
      ],
      intro: [
        [
          "The reason half finished websites stay half finished is images. You sit down to build, realise you need a photo, and stop.",
        ],
      ],
      sections: [
        {
          heading: "Organised, not scattered",
          body: [
            [
              "Upload once and use the same image on your ",
              { f: "website-builder", label: "site" },
              ", your ",
              { f: "talent-profiles", label: "profile" },
              " and your services. Replace it in one place and it updates everywhere it appears.",
            ],
          ],
        },
        {
          heading: "Images when you do not have your own yet",
          body: [
            [
              "Included stock photography and AI image generation cover the gap while you build your own library, so a missing photo never blocks a launch.",
            ],
          ],
        },
      ],
      highlights: [
        "Photos and video in one library",
        "Reused across site, profile and services",
        "Included stock photography",
        "AI image generation",
        "Storage that scales with your plan",
      ],
      faq: [
        {
          q: "Who owns the images I upload?",
          a: "You do. They are yours, and you can remove them at any time.",
        },
        {
          q: "How much can I store?",
          a: "It depends on your plan, and the limit is shown in your dashboard so you are never surprised by it.",
        },
      ],
    },
    es: {
      name: "Biblioteca de medios",
      title: "Todas tus fotos y videos en un solo lugar",
      subtitle:
        "Cada imagen y video que usas, organizado y reutilizable en tu sitio y tu perfil, con fotografía de stock e imágenes con IA incluidas.",
      promise: "Súbelo una vez, úsalo en todos lados.",
      popup: [
        [
          "Un solo lugar para tus imágenes y videos, para que no andes buscando en el teléfono cada vez que armas una página.",
        ],
        [
          "Incluye fotografía de stock e imágenes generadas con IA, que es justo lo que hace falta cuando vas empezando y todavía no tienes una sesión propia.",
        ],
      ],
      intro: [
        [
          "La razón por la que los sitios a medio hacer se quedan a medio hacer son las imágenes. Te sientas a construir, te das cuenta de que falta una foto y paras.",
        ],
      ],
      sections: [
        {
          heading: "Organizado, no disperso",
          body: [
            [
              "Súbelo una vez y usa la misma imagen en tu ",
              { f: "website-builder", label: "sitio" },
              ", tu ",
              { f: "talent-profiles", label: "perfil" },
              " y tus servicios. Cámbiala en un lugar y se actualiza en todos.",
            ],
          ],
        },
        {
          heading: "Imágenes cuando todavía no tienes las tuyas",
          body: [
            [
              "La fotografía de stock incluida y la generación de imágenes con IA cubren el hueco mientras armas tu propia biblioteca, para que una foto faltante nunca frene un lanzamiento.",
            ],
          ],
        },
      ],
      highlights: [
        "Fotos y videos en una sola biblioteca",
        "Reutilizables en sitio, perfil y servicios",
        "Fotografía de stock incluida",
        "Generación de imágenes con IA",
        "Almacenamiento según tu plan",
      ],
      faq: [
        {
          q: "¿De quién son las imágenes que subo?",
          a: "Tuyas. Son tuyas y puedes eliminarlas cuando quieras.",
        },
        {
          q: "¿Cuánto puedo almacenar?",
          a: "Depende de tu plan, y el límite se muestra en tu panel para que nunca te tome por sorpresa.",
        },
      ],
    },
  },
];
