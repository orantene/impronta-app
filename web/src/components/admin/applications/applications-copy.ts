/**
 * TUL-1896 · Roster · Applications copy, English and Spanish. Pure (no React, no Next), so the
 * server page and the client list read one source and a test can pin both languages.
 */
export type ApplicationsLang = "en" | "es";

export type ApplicationStatusKey = "pending" | "approved" | "rejected" | "withdrawn";

export function applicationsCopy(lang: ApplicationsLang) {
  const es = lang === "es";
  return {
    back: es ? "← Roster" : "← Roster",
    title: es ? "Roster · Solicitudes" : "Roster · Applications",
    intro: es
      ? "Talentos que solicitaron unirse a tu roster. Al aprobar, se añaden a tu roster de inmediato y reciben tus términos de trabajo para aceptarlos."
      : "Talent who applied to join your roster. Approving adds them to your roster right away, and they get your terms to accept.",
    status: {
      pending: es ? "Pendiente" : "Pending",
      approved: es ? "Aprobada" : "Approved",
      rejected: es ? "Rechazada" : "Rejected",
      withdrawn: es ? "Retirada" : "Withdrawn",
    } satisfies Record<ApplicationStatusKey, string>,
    acceptTitle: es ? "Aceptar solicitudes abiertas" : "Accept open applications",
    acceptOn: es
      ? "Los talentos pueden enviar solicitudes para unirse a tu roster. Apágalo para pausar."
      : "Talents can submit applications to join your roster. Flip off to pause.",
    acceptOff: es
      ? "Las solicitudes están en pausa: los talentos no verán tu espacio de trabajo en la página de solicitudes."
      : "Applications are paused: talents won't see your workspace in the apply page.",
    approvedToast: (name: string) =>
      es ? `${name} aprobado. Ya está en tu roster.` : `Approved ${name}. They are now on your roster.`,
    rejectedToast: (name: string) => (es ? `${name} rechazado.` : `Rejected ${name}.`),
    openRoster: es ? "Abrir roster →" : "Open roster →",
    goToRoster: es ? "Ir al roster →" : "Go to Roster →",
    addToRoster: es ? "Añadir al roster" : "Add to roster",
    emptyClosed: es
      ? "Aún no hay solicitudes. Activa el interruptor de arriba para empezar a recibirlas."
      : "No applications yet. Flip the toggle above to start accepting them.",
    emptyOpen: es
      ? "Aún no hay solicitudes: tu espacio de trabajo está abierto. Los talentos que te encuentren en Descubrir agencias pueden solicitar."
      : "No applications yet: your workspace is open. Talents who find you on the Discover Agencies page can apply.",
    pendingHeading: es ? "Pendientes" : "Pending",
    noPending: es ? "No hay solicitudes pendientes." : "No pending applications.",
    decidedHeading: es ? "Resueltas" : "Decided",
    dialogTitle: (decision: "approved" | "rejected", name: string) =>
      es
        ? `¿${decision === "approved" ? "Aprobar" : "Rechazar"} a ${name}?`
        : `${decision === "approved" ? "Approve" : "Reject"} ${name}?`,
    approveBody: es
      ? "La solicitud se marca como aprobada, el talento se añade a tu roster y se le avisa. Recibirá tus términos de trabajo para aceptarlos; lo que propuso queda en su nota."
      : "This marks the application as approved, adds the talent to your roster and notifies them. They get your terms to accept; anything they proposed stays in their note.",
    notePlaceholder: es ? "Nota opcional para el talento…" : "Optional note to the talent…",
    cancel: es ? "Cancelar" : "Cancel",
    saving: es ? "Guardando…" : "Saving…",
    approve: es ? "Aprobar" : "Approve",
    reject: es ? "Rechazar" : "Reject",
    decisionNote: es ? "Nota de la decisión:" : "Decision note:",
    submitted: es ? "Enviada" : "Submitted",
    decided: es ? "resuelta" : "decided",
    dateLocale: es ? "es" : "en-GB",
  };
}
