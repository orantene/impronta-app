import type { HowYouWorkMove } from "@/lib/onboarding/how-you-work";
import type { OnboardingChoice } from "@/lib/onboarding/choice";

type Pair = { en: string; es: string };

export const HYW_TITLE: Pair = { en: "How you work", es: "Cómo trabajas" };
export const HYW_DESC: Pair = {
  en: "You can change this any time. Nothing you have built is deleted.",
  es: "Puedes cambiarlo cuando quieras. No se borra nada de lo que has creado.",
};
export const HYW_CURRENT: Record<OnboardingChoice, Pair> = {
  myself: { en: "Just me, I take bookings myself", es: "Solo yo, recibo mis reservas" },
  studio: { en: "A studio, I do not take bookings myself", es: "Un estudio, yo no recibo reservas" },
  both: { en: "A studio, and I take bookings too", es: "Un estudio, y yo también recibo reservas" },
};

export const HYW_MOVES: Record<HowYouWorkMove, { label: Pair; title: Pair; body: Pair; confirm: Pair }> = {
  open_studio: {
    label: { en: "Open a studio workspace", es: "Abrir un espacio de estudio" },
    title: { en: "Open a studio workspace?", es: "¿Abrir un espacio de estudio?" },
    body: {
      en: "We create a free workspace with you as owner and add you to its team as a bookable provider. Your own page stays as it is.",
      es: "Creamos un espacio gratis contigo como dueño y te sumamos al equipo como proveedor reservable. Tu página sigue igual.",
    },
    confirm: { en: "Open workspace", es: "Abrir espacio" },
  },
  add_provider: {
    label: { en: "Add me as a provider", es: "Agregarme como proveedor" },
    title: { en: "Add yourself as a provider?", es: "¿Agregarte como proveedor?" },
    body: {
      en: "We create your talent profile in this workspace and open it for bookings, like a fresh signup as both.",
      es: "Creamos tu perfil de talento en este espacio y lo abrimos a reservas, como un registro nuevo en ambos.",
    },
    confirm: { en: "Add me", es: "Agregarme" },
  },
  resume_bookings: {
    label: { en: "Take bookings myself again", es: "Volver a recibir reservas" },
    title: { en: "Take bookings again?", es: "¿Volver a recibir reservas?" },
    body: {
      en: "You show on your studio site again and clients can book you.",
      es: "Vuelves a aparecer en el sitio de tu estudio y los clientes pueden reservarte.",
    },
    confirm: { en: "Take bookings", es: "Recibir reservas" },
  },
  stop_bookings: {
    label: { en: "Stop taking bookings myself", es: "Dejar de recibir reservas" },
    title: { en: "Stop taking bookings yourself?", es: "¿Dejar de recibir reservas?" },
    body: {
      en: "You are hidden from booking. Your profile, history and clients stay, nothing is deleted, and you can turn this back on.",
      es: "Dejas de aparecer para reservar. Tu perfil, historial y clientes se quedan, no se borra nada y puedes volver a activarlo.",
    },
    confirm: { en: "Stop bookings", es: "Dejar de recibir" },
  },
};

export const HYW_UI = {
  cancel: { en: "Cancel", es: "Cancelar" } as Pair,
  workspaceName: { en: "Workspace name", es: "Nombre del espacio" } as Pair,
  slug: { en: "Address", es: "Dirección" } as Pair,
  working: { en: "Working…", es: "Un momento…" } as Pair,
  done: { en: "Done.", es: "Listo." } as Pair,
  loadError: { en: "Could not load this right now.", es: "No se pudo cargar ahora." } as Pair,
};
