"use client";

import { useMemo } from "react";

import { useDashboardLocale } from "@/i18n/use-dashboard-locale";

function isSpanish(locale: string): boolean {
  return locale.toLowerCase().startsWith("es");
}

const ES_TEXT: Record<string, string> = {
  // Global chrome / nav
  "Prototype control bar": "Barra de control del prototipo",
  "Workspace sections": "Secciones del espacio de trabajo",
  "Overview": "Resumen",
  "Messages": "Mensajes",
  "Calendar": "Calendario",
  "Roster": "Lista",
  "Clients": "Clientes",
  "Pitches": "Propuestas",
  "Operations": "Operaciones",
  "Production": "Producción",
  "Website": "Sitio web",
  "Media": "Medios",
  "Settings": "Ajustes",
  "Workspace": "Espacio",
  "Workspace Admin": "Admin del espacio",
  "Talent": "Talento",
  "talent": "talento",
  "workspace": "espacio",
  "client": "cliente",
  "platform": "plataforma",
  "sections": "secciones",
  "Agency": "Agencia",
  "Studio": "Estudio",
  "Network": "Red",
  "Public site": "Sitio público",
  "Billing": "Facturación",
  "Inbox": "Bandeja",
  "Workflow": "Flujo",
  "Today": "Hoy",
  "Activity": "Actividad",
  "Agencies": "Agencias",
  "Public page": "Página pública",
  "Discover": "Descubrir",
  "Shortlists": "Selecciones",
  "Inquiries": "Consultas",
  "Bookings": "Reservas",
  "Notifications": "Notificaciones",
  "unread": "sin leer",
  "Mark all read": "Marcar todo como leído",
  "All caught up.": "Todo al día.",
  "Action needed": "Acción requerida",
  "Updates": "Actualizaciones",
  "System": "Sistema",
  "Notification preferences": "Preferencias de notificaciones",
  "Dismiss": "Descartar",
  "pending approval": "aprobación pendiente",
  "Booking confirmed": "Reserva confirmada",
  "payment cleared.": "pago confirmado.",
  "Review": "Revisar",
  "ongoing": "en curso",
  "Compare plans": "Comparar planes",
  "4 of 5 talent slots used": "4 de 5 espacios de talento usados",
  "You'll hit the Free cap with 1 more talent. Studio is €29/mo.": "Llegarás al límite Gratis con 1 talento más. Estudio cuesta €29/mes.",
  "Tenants": "Espacios",
  "Users": "Usuarios",
  "Search": "Buscar",
  "Search anything (⌘K)": "Buscar en todo (⌘K)",
  "Workspace settings": "Ajustes del espacio",
  "Switch to sidebar layout": "Cambiar a navegación lateral",
  "More": "Más",
  "More sections": "Más secciones",
  "Send feedback": "Enviar comentarios",
  "Help": "Ayuda",
  "Sign out": "Cerrar sesión",
  "Signed out": "Sesión cerrada",
  "Signing out…": "Cerrando sesión...",
  "Signed in as": "Sesión iniciada como",
  "Open account menu": "Abrir menú de cuenta",
  "Profile": "Perfil",
  "View / edit your public profile": "Ver o editar tu perfil público",
  "Name, domain, branding, team": "Nombre, dominio, marca y equipo",
  "Email, push, digest preferences": "Preferencias de correo, push y resumen",
  "Language": "Idioma",
  "Dashboard display language": "Idioma del dashboard",
  "Keyboard shortcuts": "Atajos de teclado",
  "Press ? anywhere": "Presiona ? en cualquier lugar",
  "Create your talent page": "Crear tu página de talento",
  "Take bookings as a talent on this workspace": "Recibe reservas como talento en este espacio",
  "Switch between Talent and Workspace": "Cambiar entre Talento y Espacio",
  "Switch between your talent profile and your workspace": "Cambia entre tu perfil de talento y tu espacio",
  "Click to dismiss": "Haz clic para cerrar",
  "Business client": "Cliente empresa",
  "Personal client": "Cliente personal",
  "Primary agency": "Agencia principal",
  "Free": "Gratis",
  "Pro": "Pro",
  "Enterprise": "Enterprise",
  "viewer": "lector",
  "editor": "editor",
  "manager": "gerente",
  "admin": "admin",
  "owner": "propietario",
  "agency": "agencia",
  "hub": "hub",
  "inquiry": "consulta",
  "inquiries": "consultas",
  "open": "abiertas",
  "pending approvals": "aprobaciones pendientes",
  "items need attention": "elementos necesitan atención",
  "pending": "pendiente",

  // Workspace page descriptions
  "Today's snapshot: unread, pending actions, recent activity": "Resumen de hoy: no leídos, pendientes y actividad reciente",
  "All threads across active inquiries and bookings": "Todos los hilos de consultas y reservas activas",
  "Scheduled shoots, holds, and deadlines": "Sesiones, bloqueos y fechas límite programadas",
  "Your talent, availability, and performance": "Tu talento, disponibilidad y desempeño",
  "Client accounts, trust tiers, and booking history": "Cuentas de cliente, niveles de confianza e historial de reservas",
  "Analytics, queues, SLAs, automations, and team workload": "Analítica, colas, SLA, automatizaciones y carga del equipo",
  "Casting, crew bookings, call sheets, rights, and safety": "Casting, equipo, call sheets, derechos y seguridad",
  "Pages, posts, redirects, custom code, tracking, SEO, domain": "Páginas, posts, redirecciones, código personalizado, tracking, SEO y dominio",
  "Workspace photo library, watermark control, and usage tracking": "Biblioteca de fotos, marca de agua y seguimiento de uso",
  "Curated talent suggestions sent to clients": "Sugerencias curadas de talento enviadas a clientes",
  "Account, plan, branding, integrations, team, and danger zone": "Cuenta, plan, marca, integraciones, equipo y zona crítica",

  // Quick create
  "New": "Nuevo",
  "New inquiry": "Nueva consulta",
  "Capture a lead from a client": "Captura un lead de un cliente",
  "New booking": "Nueva reserva",
  "Confirmed job — skip the inquiry": "Trabajo confirmado, sin pasar por consulta",
  "Add talent": "Agregar talento",
  "Create a roster profile": "Crear perfil en la lista",
  "Add client": "Agregar cliente",
  "Track a relationship": "Registrar una relación",
  "Invite teammate": "Invitar al equipo",
  "Add a coordinator or editor": "Agregar coordinador o editor",
  "New snippet": "Nuevo fragmento",
  "Reusable reply for the message composer": "Respuesta reutilizable para el compositor",
  "Share talent": "Compartir talento",
  "Send a client-facing standalone link": "Enviar un enlace independiente para cliente",
  "Quick create": "Crear rápido",
  "Quick actions": "Acciones rápidas",
  "Open quick actions": "Abrir acciones rápidas",
  "Close quick actions": "Cerrar acciones rápidas",
  "Press G then a key from anywhere to quick-create": "Presiona G y luego una tecla desde cualquier lugar para crear rápido",

  // Drawer rail and headers
  "Essentials": "Esenciales",
  "Visual": "Visual",
  "Type-specific": "Específico del tipo",
  "Booking": "Reservas",
  "Track record": "Trayectoria",
  "Admin": "Admin",
  "Identity": "Identidad",
  "Services": "Servicios",
  "Location": "Ubicación",
  "Albums": "Álbumes",
  "Polaroids": "Polaroids",
  "About": "Acerca de",
  "Physical": "Físico",
  "Wardrobe": "Vestuario",
  "Details": "Detalles",
  "Rates": "Tarifas",
  "Availability": "Disponibilidad",
  "Languages": "Idiomas",
  "Extra details": "Detalles extra",
  "Credits": "Créditos",
  "Restrictions": "Restricciones",
  "Files": "Archivos",
  "Past clients": "Clientes anteriores",
  "Trust": "Confianza",
  "New profile": "Nuevo perfil",
  "Edit your profile": "Editar tu perfil",
  "Saved": "Guardado",
  "Not saved yet": "Sin guardar aún",
  "Not saved this session": "Sin guardar en esta sesión",
  "Last server update": "Última actualización en servidor",
  "Trust preview note": "Las señales de confianza aquí son de vista previa; la persistencia sigue el flujo de verificación y el editor completo.",
  "Refinement moved note": "Las habilidades con nivel se editan en Servicios.",
  "Undo": "Deshacer",
  "Redo": "Rehacer",
  "Saving…": "Guardando...",
  "✓ Saved": "✓ Guardado",
  "Save": "Guardar",
  "Save & exit": "Guardar y salir",
  "View as client": "Ver como cliente",
  "Review changes": "Revisar cambios",
  "Full editor": "Editor completo",
  "Remove": "Quitar",
  "Draft": "Borrador",
  "Pending": "Pendiente",
  "Published": "Publicado",
  "Hidden": "Oculto",
  "Archived": "Archivado",
  "Save changes": "Guardar cambios",
  "Submit for review": "Enviar a revisión",
  "Update": "Actualizar",
  "Unhide": "Mostrar",
  "Publish": "Publicar",
  "Add to publish": "Agregar para publicar",
  "Close": "Cerrar",
  "More actions": "Más acciones",
  "Open full editor": "Abrir editor completo",
  "Remove from roster": "Quitar de la lista",
  "Undo (⌘Z)": "Deshacer (⌘Z)",
  "Redo (⌘⇧Z)": "Rehacer (⌘⇧Z)",
  "Undone": "Deshecho",
  "Redone": "Rehecho",
  "No talent context yet — finish creating first.": "Aún no hay contexto de talento. Termina de crearlo primero.",
  "Saved — closing drawer": "Guardado. Cerrando panel.",

  // Talent drawer sections
  "Name, pronouns, DOB. Each field has its own privacy.": "Nombre, pronombres y fecha de nacimiento. Cada campo tiene su propia privacidad.",
  "Tagline": "Tagline",
  "One line clients see at a glance.": "Una línea que los clientes ven de inmediato.",
  "e.g. Editorial fashion model · Madrid": "p. ej., Modelo editorial · Madrid",
  "What this person is booked as. The most important section.": "Lo que se le puede contratar. La sección más importante.",
  "Location & service area": "Ubicación y área de servicio",
  "Current location + upcoming travel.": "Ubicación actual y próximos viajes.",

  // Identity editor
  "Stage / professional name": "Nombre artístico / profesional",
  "What clients see on the public profile.": "Lo que ven los clientes en el perfil público.",
  "First name": "Nombre",
  "Last name": "Apellido",
  "Legal name": "Nombre legal",
  "ADMIN ONLY": "SOLO ADMIN",
  "+ Add legal name": "+ Agregar nombre legal",
  "(admin-only)": "(solo admin)",
  "Demographics": "Datos demográficos",
  "Pronouns": "Pronombres",
  "Select pronouns": "Seleccionar pronombres",
  "Gender": "Género",
  "Select gender": "Seleccionar género",
  "Date of birth": "Fecha de nacimiento",
  "Used to compute age.": "Se usa para calcular la edad.",
  "Show age as": "Mostrar edad como",
  "Exact": "Exacta",
  "Range": "Rango",
  "Origin & residence": "Origen y residencia",
  "Nationality": "Nacionalidad",
  "Citizenship country.": "País de ciudadanía.",
  "Country of residence": "País de residencia",
  "Tax + payout routing.": "Impuestos y ruta de pagos.",
  "Search country…": "Buscar país...",
  "Passport, work eligibility & license live in Location & travel.": "Pasaporte, permiso de trabajo y licencia están en Ubicación y viajes.",
  "Contact": "Contacto",
  "Email": "Correo",
  "Direct contact. Never shown publicly.": "Contacto directo. Nunca se muestra públicamente.",
  "Phone": "Teléfono",
  "Business line": "Línea de trabajo",
  "Secondary email, agency handle, or manager contact.": "Correo secundario, usuario de la agencia o contacto del manager.",
  "Same as phone or different": "Igual que el teléfono o diferente",
  "manager@agency.com or @handle": "manager@agency.com o @usuario",
  "For direct client coordination.": "Para coordinación directa con clientes.",
  "Service commitment": "Compromiso de respuesta",
  "Reply time": "Tiempo de respuesta",
  "Surfaces on Discover as a chip.": "Aparece en Descubrir como etiqueta.",
  "Select…": "Seleccionar...",
  "— select —": "— seleccionar —",
  "Within 1h": "En menos de 1 h",
  "Within 4h": "En menos de 4 h",
  "Within 24h": "En menos de 24 h",
  "48h+": "48 h+",
  "Locked by your agency": "Bloqueado por tu agencia",
  "Talent can't edit this. Tap to unlock.": "El talento no puede editar esto. Toca para desbloquear.",
  "Talent can edit this. Tap to lock.": "El talento puede editar esto. Toca para bloquear.",
  "Talent can't edit": "Talento sin edición",
  "Talent can edit": "Talento puede editar",
  "No locked fields. Open a section and tap \"🔓 Talent can edit\" next to a field to lock it.": "No hay campos bloqueados. Abre una sección y toca \"🔓 Talento puede editar\" junto a un campo para bloquearlo.",
  "Visible to": "Visible para",
  "click to change": "clic para cambiar",
  "Public": "Público",
  "Private": "Privado",
  "Public + agency": "Público + agencia",
  "Agency only": "Solo agencia",
  "Not visible": "No visible",
  "Discovery hub + your public profile page": "Hub de descubrimiento + tu perfil público",
  "Coordinators at agencies that represent you": "Coordinadores de las agencias que te representan",
  "Only you (and admins for compliance)": "Solo tú (y admins por cumplimiento)",
  "Stage name": "Nombre artístico",
  "Primary type": "Tipo principal",
  "Specialties": "Especialidades",
  "Social proof": "Prueba social",
  "Documents": "Documentos",
  "Limits": "Límites",

  // Pronouns / gender
  "she / her": "ella",
  "he / him": "él",
  "they / them": "elle",
  "ze / zir": "ze / zir",
  "she/her": "ella",
  "he/him": "él",
  "they/them": "elle",
  "ze/zir": "ze/zir",
  "custom": "personalizado",
  "Woman": "Mujer",
  "Man": "Hombre",
  "Non-binary": "No binario",
  "Prefer not to say": "Prefiere no decir",
  "Other": "Otro",

  // Services / skills
  "Category fields (live)": "Campos por categoría (en vivo)",
  "DB-resolved field catalog for this talent's types": "Catálogo de campos resuelto desde la DB para los tipos de este talento",
  "One primary category · up to two secondary categories · max 9 skills total": "Una categoría principal · hasta dos categorías secundarias · máximo 9 habilidades en total",
  "Primary category": "Categoría principal",
  "Secondary category": "Categoría secundaria",
  "Not set": "Sin configurar",
  "skill": "habilidad",
  "skills": "habilidades",
  "Add skill in this category": "Agregar habilidad en esta categoría",
  "Add another skill in this category": "Agregar otra habilidad en esta categoría",
  "Add first secondary category": "Agregar primera categoría secundaria",
  "Add second secondary category": "Agregar segunda categoría secundaria",
  "Loading skills…": "Cargando habilidades...",
  "Featured on roster card": "Destacada en la tarjeta de lista",
  "Set as featured skill": "Marcar como habilidad destacada",
  "FEATURED": "DESTACADA",
  "saving…": "guardando...",
  "Remove skill": "Quitar habilidad",
  "Years:": "Años:",
  "Verify proficiency": "Verificar nivel",
  "✓ Verified": "✓ Verificado",
  "Unrated": "Sin nivel",
  "(unverified)": "(sin verificar)",
  "← tap a dot to set level": "← toca un punto para definir nivel",
  "Beginner": "Principiante",
  "Intermediate": "Intermedio",
  "Advanced": "Avanzado",
  "Expert": "Experto",
  "Master": "Maestro",
  "Just starting · learning · open to gigs": "Está empezando · aprendiendo · abierto/a a trabajos",
  "Done it a few times · comfortable": "Lo ha hecho varias veces · se siente cómodo/a",
  "Regular paid work": "Trabajo pagado con regularidad",
  "Top of category · signature skill": "Nivel alto de la categoría · habilidad distintiva",
  "Industry-leading work": "Trabajo referente en la industria",
  "Remove interest": "Quitar interés",
  "Career interests · open to grow into": "Intereses profesionales · abierto/a a desarrollarse en",
  "Talent types this person is open to learning / accepting if invited. Doesn't count toward the 9-skill cap.": "Tipos de talento que esta persona está abierta a aprender o aceptar si se le invita. No cuentan para el límite de 9 habilidades.",
  "+ Add interest": "+ Agregar interés",
  "Add a career interest": "Agregar interés profesional",
  "A talent type they're open to growing into. Doesn't replace current skills.": "Un tipo de talento en el que esta abierto/a a desarrollarse. No reemplaza sus habilidades actuales.",
  "← Back to categories": "← Volver a categorías",
  "No matching types.": "Sin tipos coincidentes.",
  "Done": "Listo",

  // Skill picker
  "← Back": "← Volver",
  "Pick a skill": "Elegir habilidad",
  "Pick a category, then choose the specific role.": "Elige una categoría y luego el rol específico.",
  "Select one or more skills to add.": "Selecciona una o más habilidades para agregar.",
  "Search…": "Buscar...",
  "Loading…": "Cargando...",
  "No matching roles.": "Sin roles coincidentes.",
  "On profile": "En el perfil",
  "✦ Don't see your skill? Suggest one →": "✦ ¿No ves tu habilidad? Sugerir una →",
  "Adding…": "Agregando...",
  "Suggest a new skill": "Sugerir una nueva habilidad",
  "Don't see what you're looking for? Tell us what's missing. Our team reviews suggestions and adds genuine gaps to the catalog within a few business days.": "¿No ves lo que buscas? Cuéntanos qué falta. Nuestro equipo revisa las sugerencias y agrega huecos reales al catálogo en pocos días hábiles.",
  "We'll file this under": "La registraremos en",
  "Skill name": "Nombre de la habilidad",
  "Why do you need this?": "¿Por qué la necesitas?",
  "(optional)": "(opcional)",
  "e.g. Doula, Sound Healer, Underwater Photographer": "p. ej. doula, terapeuta de sonido, fotógrafo submarino",
  "e.g. 'We book 3–5 doulas per month and they don't fit any existing category.'": "p. ej. 'Reservamos 3 a 5 doulas al mes y no encajan en ninguna categoría actual.'",
  "Skill name must be at least 2 characters.": "El nombre debe tener al menos 2 caracteres.",
  "Cancel": "Cancelar",
  "Sending…": "Enviando...",
  "Send suggestion": "Enviar sugerencia",
  "✓ Skill suggestion sent. We'll review it and let you know.": "✓ Sugerencia enviada. La revisaremos y te avisaremos.",

  // Verification dialog
  "You're staking your agency's reputation on this assessment. Verified skills are surfaced to clients as trusted; only verify what you've witnessed firsthand or have evidence for.": "Estás respaldando esta evaluación con la reputación de tu agencia. Las habilidades verificadas se muestran a clientes como confiables; verifica solo lo que hayas visto de primera mano o puedas comprobar.",
  "Verifying at level": "Verificando en nivel",
  "Verification scope": "Alcance de verificación",
  "This agency": "Esta agencia",
  "Visible to this tenant only.": "Visible solo para este espacio.",
  "Platform-wide": "Toda la plataforma",
  "Tulala-verified, visible to all tenants.": "Verificado por Tulala, visible para todos los espacios.",
  "Verification note (optional, internal)": "Nota de verificación (opcional, interna)",
  "e.g. 'Saw them perform at the Maya Beach Club opening, May 2026.'": "p. ej. 'Les vi trabajar en la apertura de Maya Beach Club, mayo de 2026.'",
  "Verifying…": "Verificando...",
  "✓ Verify": "✓ Verificar",

  // Taxonomy and role labels surfaced by DB/prototype catalogs
  "Hosts & Promo": "Anfitriones y promoción",
  "Hostesses": "Hostesses",
  "Guest Experience Hosts": "Anfitriones de experiencia",
  "Event Hosts": "Anfitriones de eventos",
  "MCs & Presenters": "MCs y presentadores",
  "Brand Ambassadors": "Embajadores de marca",
  "Beach Club Hostess": "Hostess de beach club",
  "Concierge Host": "Anfitrión concierge",
  "Corporate Event Host": "Anfitrión de evento corporativo",
  "Event Hostess": "Hostess de eventos",
  "Event Presenter": "Presentador de eventos",
  "Hotel Hostess": "Hostess de hotel",
  "Luxury Brand Ambassador": "Embajador/a de marca de lujo",
  "Luxury Brand Host": "Anfitrión de marca de lujo",
  "Master of Ceremonies": "Maestro/a de ceremonias",
  "Performers": "Performers",
  "Models": "Modelos",
  "Artists": "Artistas",
  "Creators": "Creadores",
};

export function translateDashboardText(
  value: string | null | undefined,
  locale: string,
): string {
  if (!value) return "";
  if (!isSpanish(locale)) return value;
  return ES_TEXT[value] ?? value;
}

export function translateDashboardTerm({
  nameEn,
  nameEs,
  locale,
}: {
  nameEn: string | null | undefined;
  nameEs?: string | null;
  locale: string;
}): string {
  if (isSpanish(locale) && nameEs?.trim()) return nameEs.trim();
  return translateDashboardText(nameEn ?? "", locale);
}

export function useDashboardText() {
  const locale = useDashboardLocale();

  return useMemo(() => {
    const es = isSpanish(locale);
    const t = (value: string | null | undefined) =>
      translateDashboardText(value, locale);
    const term = (nameEn: string | null | undefined, nameEs?: string | null) =>
      translateDashboardTerm({ nameEn, nameEs, locale });

    return {
      locale,
      isSpanish: es,
      t,
      term,
      addSkillTitle: (role: "primary" | "secondary") =>
        es
          ? `Agregar habilidad ${role === "primary" ? "principal" : "secundaria"}`
          : `Add a ${role === "primary" ? "primary" : "secondary"} skill`,
      addSkillsButton: (count: number) =>
        es
          ? `Agregar ${count} habilidad${count === 1 ? "" : "es"}`
          : `Add ${count} skill${count === 1 ? "" : "s"}`,
      addToPublish: (count: number) =>
        es ? `Agregar ${count} para publicar` : `Add ${count} to publish`,
      skillCount: (count: number) =>
        es
          ? `${count} habilidad${count === 1 ? "" : "es"}`
          : `${count} skill${count === 1 ? "" : "s"}`,
      skillsLeft: (remaining: number, total: number) =>
        es ? `${remaining} de ${total} disponibles` : `${remaining} of ${total} left`,
      skillsUsed: (count: number, total: number) =>
        es
          ? `${count} de ${total} habilidades usadas`
          : `${count} of ${total} skills used`,
      secondaryCategory: (index: number) =>
        es ? `Categoría secundaria ${index}` : `Secondary category ${index}`,
      savedStatus: (savedAt: Date | null, ageText: string) => {
        if (!savedAt) return t("Not saved this session");
        if (!ageText) return t("Saved");
        if (!es) return `Saved ${ageText}`;
        if (ageText === "just now") return "Guardado ahora";
        const seconds = ageText.match(/^(\d+)s ago$/u)?.[1];
        if (seconds) return `Guardado hace ${seconds} s`;
        const minutes = ageText.match(/^(\d+)m ago$/u)?.[1];
        if (minutes) return `Guardado hace ${minutes} min`;
        const hours = ageText.match(/^(\d+)h ago$/u)?.[1];
        if (hours) return `Guardado hace ${hours} h`;
        const days = ageText.match(/^(\d+)d ago$/u)?.[1];
        if (days) return `Guardado hace ${days} d`;
        return t("Saved");
      },
      /** Subtitle under the profile name: session save, server row time, or idle. */
      profileDrawerSaveSubtitle: (input: {
        saveStatus: "idle" | "saving" | "saved" | "error";
        savedAt: Date | null;
        serverUpdatedAtMs: number | null;
        ageText: string;
      }) => {
        if (input.saveStatus === "saving") return t("Saving…");
        if (input.saveStatus === "error") return es ? "No se pudo guardar" : "Couldn't save";
        if (input.savedAt) {
          if (!input.ageText) return t("Saved");
          if (!es) return `Saved ${input.ageText}`;
          if (input.ageText === "just now") return "Guardado ahora";
          const seconds = input.ageText.match(/^(\d+)s ago$/u)?.[1];
          if (seconds) return `Guardado hace ${seconds} s`;
          const minutes = input.ageText.match(/^(\d+)m ago$/u)?.[1];
          if (minutes) return `Guardado hace ${minutes} min`;
          const hours = input.ageText.match(/^(\d+)h ago$/u)?.[1];
          if (hours) return `Guardado hace ${hours} h`;
          const days = input.ageText.match(/^(\d+)d ago$/u)?.[1];
          if (days) return `Guardado hace ${days} d`;
          return t("Saved");
        }
        if (input.serverUpdatedAtMs != null && Number.isFinite(input.serverUpdatedAtMs)) {
          const d = new Date(input.serverUpdatedAtMs);
          const locale = es ? "es" : "en-US";
          const now = new Date();
          const sameCalendarDay =
            d.getFullYear() === now.getFullYear() &&
            d.getMonth() === now.getMonth() &&
            d.getDate() === now.getDate();
          const timePart = d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
          if (sameCalendarDay) {
            return es
              ? `${t("Last server update")}: ${timePart}`
              : `Last server update: ${timePart}`;
          }
          return es
            ? `${t("Last server update")}: ${d.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}`
            : `Last server update: ${d.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}`;
        }
        return t("Not saved this session");
      },
      profileDrawerSaveSubtitleTitle: (input: {
        saveStatus: "idle" | "saving" | "saved" | "error";
        savedAt: Date | null;
        serverUpdatedAtMs: number | null;
        saveError: string | null;
      }) => {
        if (input.saveStatus === "error" && input.saveError) return input.saveError;
        if (input.savedAt) {
          const locale = es ? "es" : "en-US";
          return input.savedAt.toLocaleString(locale, { dateStyle: "full", timeStyle: "short" });
        }
        if (input.serverUpdatedAtMs != null && Number.isFinite(input.serverUpdatedAtMs)) {
          const locale = es ? "es" : "en-US";
          return new Date(input.serverUpdatedAtMs).toLocaleString(locale, { dateStyle: "full", timeStyle: "short" });
        }
        return "";
      },
      verifyButton: (scope: "platform" | "agency" | null, canChooseScope: boolean) =>
        es
          ? `✓ Verificar${canChooseScope && scope ? ` (${scope === "platform" ? "plataforma" : "agencia"})` : ""}`
          : `✓ Verify${canChooseScope && scope ? ` (${scope})` : ""}`,
      verifyTitle: (skillName: string) =>
        es ? `¿Verificar ${skillName}?` : `Verify ${skillName}?`,
      proficiencyDots: (label: string, dots: number) =>
        es ? `${t(label)} (${dots} de 5 puntos)` : `${label} (${dots} of 5 dots)`,
      setProficiencyTitle: (label: string, description: string) =>
        es ? `Definir ${t(label)} · ${t(description)}` : `Set ${label} · ${description}`,
    };
  }, [locale]);
}
