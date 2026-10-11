/**
 * Spanish for the guest trust chip on a talent thread (identity chip, signal
 * ticks, Block / Report, report reasons, one-line risk read) and the empty
 * thread state. Keyed by the English literal like every dashboard catalog.
 * Kept out of dashboard-i18n.ts, which sits on the size ratchet.
 */
export const TRUST_ES_TEXT: Record<string, string> = {
  Guest: "Invitado",
  Identified: "Identificado",
  "Email verified": "Correo verificado",
  Account: "Cuenta",
  Email: "Correo",
  Phone: "Teléfono",
  Social: "Redes",
  Payment: "Pago",
  Block: "Bloquear",
  Unblock: "Desbloquear",
  Blocked: "Bloqueado",
  Report: "Reportar",
  Cancel: "Cancelar",
  "Sender blocked": "Remitente bloqueado",
  "Already blocked": "Ya bloqueado",
  "Block this sender": "Bloquear a este remitente",
  Spam: "Spam",
  Harassment: "Acoso",
  "Scam or fraud": "Estafa o fraude",
  "Off-platform solicitation": "Solicitud fuera de la plataforma",
  "Inappropriate content": "Contenido inapropiado",
  Other: "Otro",
  "Could not submit report. Try again.": "No se pudo enviar el reporte. Inténtalo de nuevo.",
  "verified": "verificado",
  "unverified": "sin verificar",
  "not provided": "no proporcionado",
  "Name + email captured — not verified": "Nombre y correo capturados, sin verificar",
  "New guest — unverified": "Invitado nuevo, sin verificar",
  "Email verified — not yet booked": "Correo verificado, aún sin reservas",
  "Registered client — not yet booked": "Cliente registrado, aún sin reservas",
  "Report submitted": "Reporte enviado",
  "No messages yet": "Aún no hay mensajes",
  "Start the conversation below — your message will go to the right people in this thread.":
    "Empieza la conversación abajo: tu mensaje llegará a las personas correctas de este hilo.",
  // TUL-500 residuals: TrustBadge tiers + booking count on the chip.
  Basic: "Básico",
  Verified: "Verificado",
  Silver: "Plata",
  Gold: "Oro",
  "{tier} client": "Cliente {tier}",
  "{tier} client — trust level granted by account activity":
    "Cliente {tier}: nivel de confianza por actividad de la cuenta",
  "Trust level: {tier}": "Nivel de confianza: {tier}",
  "1 booking": "1 reserva",
  "{n} bookings": "{n} reservas",
};

/** "Gold client · booked 3x on Tulala" / "Booked 3x on Tulala": counts are dynamic, so translate by shape. */
export function translateRiskLine(line: string, es: boolean, lookup: (s: string) => string): string {
  if (!es) return line;
  const tiered = /^(Gold|Silver|Verified) client · booked (\d+)x on Tulala$/.exec(line);
  if (tiered) {
    const tier = { Gold: "Oro", Silver: "Plata", Verified: "Verificado" }[tiered[1] as "Gold" | "Silver" | "Verified"];
    return `Cliente ${tier} · ${tiered[2]} reserva${tiered[2] === "1" ? "" : "s"} en Tulala`;
  }
  const plain = /^Booked (\d+)x on Tulala$/.exec(line);
  if (plain) return `${plain[1]} reserva${plain[1] === "1" ? "" : "s"} en Tulala`;
  return lookup(line);
}
