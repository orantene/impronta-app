/**
 * TUL-1413: the sentences for a session's room (inline ES/EN, so no shared message file is
 * touched). Plain words: no codes, no jargon.
 */
export type RoomMessageCode = "room_taken" | "room_unavailable" | "room_release_failed";

const MESSAGES: Record<RoomMessageCode, { es: string; en: string }> = {
  room_taken: {
    es: "Ese espacio ya está ocupado a esa hora. Elige otra hora u otro espacio.",
    en: "That room is already taken at that time. Pick another time or room.",
  },
  room_unavailable: {
    es: "No se pudo reservar el espacio de esta clase. No se programó nada; inténtalo otra vez.",
    en: "Could not reserve this class's room. Nothing was scheduled; try again.",
  },
  room_release_failed: {
    es: "La sesión se canceló, pero el espacio no se liberó. Vuelve a pulsar Cancelar para liberarlo.",
    en: "The session was cancelled, but its room was not released. Press Cancel again to release it.",
  },
};

export function roomMessage(code: RoomMessageCode, locale: string | null | undefined): string {
  return MESSAGES[code][(locale ?? "").toLowerCase().startsWith("es") ? "es" : "en"];
}
