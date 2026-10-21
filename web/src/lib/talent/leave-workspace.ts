/**
 * TUL-1469 · leaving a workspace, the part that is not the database. Pure.
 * The RPC answer (or its error) becomes one of four outcomes with a plain sentence in ES/EN.
 */
export type LeaveOutcome = "left" | "not_member" | "forbidden" | "unavailable" | "failed";

export function leaveOutcomeFromRpc(res: { data: unknown; error: { code?: string; message?: string } | null }): LeaveOutcome {
  if (res.error) {
    const code = res.error.code ?? "";
    if (code === "42501") return "forbidden";
    // PGRST202 / 42883 / 42P01: the held function is not applied yet.
    if (code === "PGRST202" || code === "42883" || code === "42P01" || code === "PGRST205") return "unavailable";
    return "failed";
  }
  return res.data === "left" ? "left" : res.data === "not_member" ? "not_member" : "failed";
}

const COPY = {
  es: {
    leave: "Salir",
    confirmTitle: (name: string) => `¿Salir de ${name}?`,
    confirmBody: "Dejarás de aparecer ahí y tus servicios se ocultan en ese negocio. Los trabajos ya reservados se mantienen.",
    confirm: "Sí, salir",
    cancel: "Cancelar",
    left: "Saliste de este negocio. Los trabajos ya reservados se mantienen.",
    not_member: "Ya no eres parte de este negocio.",
    forbidden: "No puedes hacer este cambio.",
    unavailable: "Esto aún no está disponible. Inténtalo más tarde.",
    failed: "No se pudo completar. Inténtalo otra vez.",
  },
  en: {
    leave: "Leave",
    confirmTitle: (name: string) => `Leave ${name}?`,
    confirmBody: "You will stop appearing there and your services are hidden in that business. Jobs already booked stay.",
    confirm: "Yes, leave",
    cancel: "Cancel",
    left: "You left this business. Jobs already booked stay.",
    not_member: "You are no longer part of this business.",
    forbidden: "You cannot make this change.",
    unavailable: "This is not available yet. Please try again later.",
    failed: "Could not finish. Please try again.",
  },
} as const;

export function leaveCopy(locale: string) {
  return COPY[locale.toLowerCase().startsWith("es") ? "es" : "en"];
}
