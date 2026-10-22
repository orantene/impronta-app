import type { JoinStudioErrorCode } from "@/lib/onboarding/join-studio";

type Pair = { en: string; es: string };

export const JS_TITLE: Pair = { en: "Work with a studio", es: "Trabajar con un estudio" };
export const JS_DESC: Pair = {
  en: "Ask a studio on Tulala to add you to its team. Your own page stays yours.",
  es: "Pide a un estudio en Tulala que te sume a su equipo. Tu página sigue siendo tuya.",
};

export const JS_UI = {
  label: { en: "Studio address or link", es: "Dirección o enlace del estudio" } as Pair,
  placeholder: { en: "studio-name", es: "nombre-del-estudio" } as Pair,
  discover: { en: "Browse studios that take applications", es: "Ver estudios que reciben solicitudes" } as Pair,
  send: { en: "Send request", es: "Enviar solicitud" } as Pair,
  working: { en: "Sending…", es: "Enviando…" } as Pair,
  pending: {
    en: "Request sent to {studio}. You will hear back when they approve it.",
    es: "Solicitud enviada a {studio}. Te avisaremos cuando la aprueben.",
  } as Pair,
  active: { en: "You are on the {studio} team now.", es: "Ya formas parte del equipo de {studio}." } as Pair,
};

export const JS_ERRORS: Record<JoinStudioErrorCode, Pair> = {
  read_only: { en: "Read-only while acting as another user.", es: "Solo lectura mientras actúas como otra persona." },
  signed_out: { en: "Sign in again to send a request.", es: "Vuelve a iniciar sesión para enviar la solicitud." },
  bad_address: {
    en: "Paste the studio's Tulala address or its short name, for example studio-name.",
    es: "Pega la dirección del estudio en Tulala o su nombre corto, por ejemplo nombre-del-estudio.",
  },
  too_many: { en: "Too many requests. Try again in an hour.", es: "Demasiadas solicitudes. Inténtalo en una hora." },
  no_profile: {
    en: "Finish your profile first, then send the request.",
    es: "Termina tu perfil primero y luego envía la solicitud.",
  },
  not_found: {
    en: "We could not find a studio taking requests at that address. Ask the studio for an invite.",
    es: "No encontramos un estudio que reciba solicitudes en esa dirección. Pide una invitación al estudio.",
  },
  already_pending: {
    en: "You already have a request waiting with this studio.",
    es: "Ya tienes una solicitud en espera con este estudio.",
  },
  exclusive: {
    en: "You are in an exclusive relationship right now, so requests are paused until it ends.",
    es: "Tienes una relación de exclusividad ahora, así que las solicitudes están en pausa hasta que termine.",
  },
  failed: { en: "Could not send the request. Try again.", es: "No se pudo enviar la solicitud. Inténtalo de nuevo." },
};
