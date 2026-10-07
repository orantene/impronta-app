/**
 * Spanish for the English that still showed on Spanish dashboard screens
 * (TUL-146: Settings cards, the profile drawer's Services list and publish
 * checklist, the product-orders list).
 *
 * WHY A MODULE OF ITS OWN. `dashboard-i18n.ts` is held at its size-ratchet
 * budget, so new rows go in a sibling that the rail table spreads in, the same
 * call `dashboard-i18n-links.ts` and `dashboard-i18n-rail.ts` made.
 *
 * Keys are the English literal the component passes to `copy.t()`. A key that
 * is already translated by another dashboard module must NOT be repeated here:
 * `dashboard-i18n-spanish-leaks.test.ts` fails on any overlap, so the later
 * spread cannot silently change a settled wording.
 *
 * Mexican Spanish, tu form, no em dashes.
 */
export const SPANISH_LEAKS_ES_TEXT: Record<string, string> = {

  // ── Services list inside the profile drawer ──
  "What kind of thing?": "¿Qué quieres vender?",
  "For example:": "Por ejemplo:",
  "Something you do at an agreed time. It goes on your calendar.":
    "Algo que haces a una hora acordada. Aparece en tu calendario.",
  "acrylic set, lash lift, a haircut": "juego de acrílico, lifting de pestañas, un corte de cabello",
  "3 gel appointments, bridal trial + wedding day": "3 citas de gel, prueba de novia + día de la boda",
  "A thing the client takes home or you send. No appointment.":
    "Algo que el cliente se lleva o que tú envías. Sin cita.",
  "press-on sets, cuticle oil, a print": "uñas postizas, aceite para cutículas, una impresión",
  "An extra, like glitter or nail art, is added inside the service it goes with: open the service, then Options & extras.":
    "Un extra, como brillitos o arte de uñas, se agrega dentro del servicio al que pertenece: abre el servicio y entra a Opciones y extras.",
  "60-min session": "Sesión de 60 min",
  "Full-day rate": "Tarifa por día completo",
  "Signature package": "Paquete estrella",
  "Custom quote": "Cotización a la medida",
  "Your catalogue": "Tu catálogo",
  "What customers can order from your site. Each item belongs to the workspace, not to a person on the roster.":
    "Lo que tus clientes pueden pedir en tu sitio. Cada elemento pertenece al espacio de trabajo, no a una persona de la lista.",
  "Everything clients can book or buy from your page: services, packages and products. A photo on each one is what gets it booked.":
    "Todo lo que tus clientes pueden reservar o comprar en tu página: servicios, paquetes y productos. Una foto en cada uno es lo que consigue la reserva.",
  "+ Add something to sell": "+ Agregar algo para vender",
  "+ Add a menu item": "+ Agregar un elemento al menú",
  "+ Add a service": "+ Agregar un servicio",
  "Build your menu": "Arma tu menú",
  "Show people what they can book": "Muestra lo que pueden reservar",
  "Add your first menu item. It will only appear on your site once you publish it.":
    "Agrega tu primer elemento al menú. Solo aparecerá en tu sitio cuando lo publiques.",
  "Start with the one clients ask for most. Add a photo and a price. Nothing shows publicly until you publish it.":
    "Empieza por lo que más te piden. Agrega una foto y un precio. Nada se ve en público hasta que lo publiques.",
  "+ Add your first menu item": "+ Agrega tu primer elemento al menú",
  "+ Add your first service": "+ Agrega tu primer servicio",
  "Import my existing rates & packages": "Importar mis tarifas y paquetes actuales",
  "We'll turn your old rates, packages and menu into editable services.":
    "Convertiremos tus tarifas, paquetes y menú anteriores en servicios editables.",
  "Filter what you sell": "Filtrar lo que vendes",
  "Nothing needs attention. Every live item has a photo and a price.":
    "Nada necesita atención. Cada elemento activo tiene foto y precio.",
  "Nothing here yet.": "Aún no hay nada aquí.",
  "(untitled)": "(sin título)",
  "Featured": "Destacado",
  "Hidden from page": "Oculto en la página",
  "No photo": "Sin foto",
  "Sold out": "Agotado",
  "Direct booking": "Reserva directa",
  "Hide from page": "Ocultar en la página",
  "Show on page": "Mostrar en la página",
  "Feature on top": "Destacar arriba",
  "Talent Type": "tipo de talento",
  "1 more photo": "1 foto más",
  "2 more photos": "2 fotos más",
  "3 more photos": "3 fotos más",
  "Visible across Tulala": "Visible en todo Tulala",
  "Profile visibility": "Visibilidad del perfil",
  "Paused: your profile is hidden everywhere": "En pausa: tu perfil está oculto en todos lados",
  "Hidden from this agency's site": "Oculto en el sitio de esta agencia",
  "Shown on this agency's site": "Visible en el sitio de esta agencia",
  "Control where your profile appears.": "Controla dónde aparece tu perfil.",
  "Your profile can appear on agency directories, search and public pages.":
    "Tu perfil puede aparecer en directorios de agencias, en búsquedas y en páginas públicas.",
  "Hidden everywhere. You won't appear on any site until you turn this back on.":
    "Oculto en todos lados. No aparecerás en ningún sitio hasta que lo vuelvas a activar.",
  "Agency sites": "Sitios de agencias",
  "Turn your profile back on above to choose individual sites.":
    "Vuelve a activar tu perfil arriba para elegir sitios individuales.",
  "Choose which of your agencies may show you on their public site.":
    "Elige qué agencias pueden mostrarte en su sitio público.",
  "You're not on any agency roster yet.": "Aún no estás en la lista de ninguna agencia.",
  "Plan gift active": "Regalo de plan activo",
  "Loading your plan…": "Cargando tu plan…",
  "Your personal page plan": "El plan de tu página personal",
  "Could not load your plan.": "No se pudo cargar tu plan.",
  "Default for every talent": "Incluido para todo talento",
  "Richer presentation": "Una presentación más completa",
  "Your website, fully unlocked": "Tu sitio web, con todo desbloqueado",
  "Your branded talent page": "Tu página de talento con tu marca",
  "For getting started": "Para empezar",
};
