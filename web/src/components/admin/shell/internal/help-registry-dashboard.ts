import type { Audience, HelpEntry } from "./help-registry";

/**
 * Help for dashboard AREAS (sidebar pages and settings groups), not drawers.
 *
 * DRAWER_HELP is keyed by drawer ids. A Spanish owner asking "cómo cambio mis
 * horas" got a generic "check your profile settings" answer because nothing in
 * the corpus named Ajustes > Horarios (Settings > Hours) in either language.
 *
 * One source per area carries en + es. The support AI flattens both locales
 * into a single grounding entry so English and Spanish questions retrieve the
 * same slug, and the model can quote the labels the user actually sees.
 *
 * Add the next area here the same way; do not fork a second Spanish registry.
 */
export type LocalizedHelpBody = {
  purpose: string;
  youCanHere: string[];
  faqs: { q: string; a: string }[];
};

export type DashboardAreaHelp = {
  slug: string;
  /** Breadcrumb users see in the product nav. */
  area: { en: string; es: string };
  audience: Audience | Audience[];
  category: string;
  ticketCategory: string;
  en: LocalizedHelpBody;
  es: LocalizedHelpBody;
};

export const DASHBOARD_AREA_HELP: DashboardAreaHelp[] = [
  {
    slug: "settings-hours",
    area: { en: "Settings > Hours", es: "Ajustes > Horarios" },
    audience: ["Talent", "Workspace admin"],
    category: "Settings",
    ticketCategory: "Bookings & inquiries",
    en: {
      purpose:
        "Settings > Hours is where you change when clients can book you. Weekly open days, start and end times, closed days and buffers all live here (Working hours and days off).",
      youCanHere: [
        "Open Settings, then Hours (Working hours and days off)",
        "Turn each day on or off and set its start and end time",
        "Save so the public booking picker uses the new windows",
        "On a workspace with staff, set Booking hours under Settings > Appointments",
      ],
      faqs: [
        {
          q: "How do I change my hours?",
          a: "Go to Settings > Hours. Edit the weekly days and times, then save. Clients only see the windows you leave open.",
        },
        {
          q: "Where is Working hours?",
          a: "Settings > Hours opens the Working hours panel. From Calendar you can also open Working hours in the header.",
        },
      ],
    },
    es: {
      purpose:
        "Ajustes > Horarios es donde cambias cuándo te pueden reservar. Los días abiertos de la semana, hora de inicio y fin, días cerrados y buffers viven aquí (Horario y días libres).",
      youCanHere: [
        "Abre Ajustes y luego Horarios (Horario y días libres)",
        "Activa o apaga cada día y define su hora de inicio y fin",
        "Guarda para que el selector público use las ventanas nuevas",
        "En un espacio con personal, define Horario de reservas en Ajustes > Citas",
      ],
      faqs: [
        {
          q: "Cómo cambio mis horas?",
          a: "Ve a Ajustes > Horarios. Edita los días y horas de la semana y guarda. Los clientes solo ven las ventanas que dejas abiertas.",
        },
        {
          q: "Dónde está Horario?",
          a: "Ajustes > Horarios abre el panel de Horario. Desde Calendario también puedes abrir Horario en la cabecera.",
        },
      ],
    },
  },
];

/** Flatten one bilingual area into a HelpEntry the support corpus can merge. */
export function dashboardAreaAsHelpEntry(area: DashboardAreaHelp): HelpEntry {
  return {
    audience: area.audience,
    category: area.category,
    shortTitle: area.area.en,
    purpose: `${area.en.purpose} ${area.es.purpose}`,
    youCanHere: [...area.en.youCanHere, ...area.es.youCanHere],
    faqs: [...area.en.faqs, ...area.es.faqs],
    ticketCategory: area.ticketCategory,
    supportSlug: area.slug,
    devNotes: `Dashboard area ${area.area.en} / ${area.area.es}. One source, both locales.`,
  };
}

export const DASHBOARD_AREA_HELP_ENTRIES: Record<string, HelpEntry> = Object.fromEntries(
  DASHBOARD_AREA_HELP.map((area) => [area.slug, dashboardAreaAsHelpEntry(area)]),
);
