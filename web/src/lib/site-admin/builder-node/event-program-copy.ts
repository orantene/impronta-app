/**
 * event_program copy, es/en in-file like `ticket-picker-copy.ts`. Item text
 * arrives already localised from the loader (the row's `i18n` overlay); this
 * is only the block chrome. No em dashes.
 */
import type { ProgramLocale } from "./event-program-model";

export function pickProgramLocale(raw?: string): ProgramLocale {
  return raw?.toLowerCase().startsWith("es") ? "es" : "en";
}

export const PROGRAM_COPY: Record<ProgramLocale, Record<string, string>> = {
  en: {
    loading: "Loading the program...",
    not_configured: "This block is not set up yet: it needs an event whose program to show.",
    disabled: "The program is switched off for this event. Turn it on under the event's Program tab.",
    empty: "The program is on its way.",
    unavailable: "The program could not be loaded right now.",
    tba: "Time to be confirmed",
    performerTba: "Performer to be announced",
    now: "Now",
    nowLabel: "Happening now",
    nextDay: "next day",
    nights: "Nights",
    places: "Places",
    viewProfile: "View profile",
    kind_doors: "Doors",
    kind_close: "Close",
    kind_break: "Break",
  },
  es: {
    loading: "Cargando el programa...",
    not_configured: "Este bloque aún no está configurado: necesita un evento cuyo programa mostrar.",
    disabled: "El programa está apagado para este evento. Actívalo en la pestaña Programa del evento.",
    empty: "El programa está en camino.",
    unavailable: "No se pudo cargar el programa en este momento.",
    tba: "Hora por confirmar",
    performerTba: "Artista por anunciar",
    now: "En curso",
    nowLabel: "Sucediendo ahora",
    nextDay: "día siguiente",
    nights: "Noches",
    places: "Lugares",
    viewProfile: "Ver perfil",
    kind_doors: "Apertura de puertas",
    kind_close: "Cierre",
    kind_break: "Descanso",
  },
};
