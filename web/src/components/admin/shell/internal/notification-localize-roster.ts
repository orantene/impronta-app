/**
 * TUL-1928: roster and join-request bells (catalog.ts) are stored with English
 * text. Render them in the viewer's language at display time. Unknown text
 * returns null so the caller falls through to its other rules, and an English
 * viewer never reaches this (the caller short-circuits first).
 */

const EXACT_ES: Record<string, string> = {
  "Review and approve or decline the request.": "Revisa y aprueba o rechaza la solicitud.",
  "Your roster request was approved": "Tu solicitud para unirte a la lista fue aprobada",
  "You're now part of the team roster.": "Ya formas parte de la lista del equipo.",
  "Update on your roster request": "Novedades sobre tu solicitud para unirte a la lista",
  "Your request wasn't approved at this time.": "Tu solicitud no fue aprobada por ahora.",
  "Your profile is approved": "Tu perfil fue aprobado",
  "It's now visible and discoverable to clients.": "Ahora es visible y los clientes pueden encontrarlo.",
  "Your roster is over its plan limit": "Tu lista superó el límite de tu plan",
  "Your roster is above your plan's seat limit.": "Tu lista supera el límite de lugares de tu plan.",
};

export function localizeRosterNotificationEs(text: string): string | null {
  const exact = EXACT_ES[text];
  if (exact) return exact;
  const requested = text.match(/^(.+) requested to join your roster$/u);
  if (requested) return `${requested[1] === "A talent" ? "Un talento" : requested[1]} pidió unirse a tu lista`;
  const onRoster = text.match(/^You're on (.+)'s roster$/u);
  if (onRoster) return `Estás en la lista de ${onRoster[1]}`;
  const declined = text.match(/^(.+) isn't able to add you to their roster right now\.$/u);
  if (declined) return `${declined[1]} no puede agregarte a su lista por ahora.`;
  const over = text.match(/^Your roster has (\d+) talent — above your plan's limit of (\d+)\.$/u);
  if (over) return `Tu lista tiene ${over[1]} talentos, por encima del límite de tu plan de ${over[2]}.`;
  return null;
}
