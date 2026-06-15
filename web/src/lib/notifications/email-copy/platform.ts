/**
 * Platform-admin alert copy (EN + ES). Aggregated by `../email-copy.ts`.
 * Audience = platform super-admins; tone is internal/operational. ES is natural
 * Mexican Spanish. `PLATFORM_ES: typeof PLATFORM_EN` enforces parity.
 */

export const PLATFORM_EN = {
  "platform.new_workspace": {
    subject: "New workspace: {workspaceName}",
    preview: "New workspace signed up",
    heading: "New workspace signed up",
    body: "{workspaceName} just created a workspace on Tulala.",
    ownerLabel: "Owner",
    planRowLabel: "Plan",
    note: "Review it in the platform admin console.",
    button: "Open in admin →",
  },
  "platform.workspace_over_quota": {
    subject: "{workspaceName} is over quota",
    preview: "Workspace over quota",
    heading: "Workspace over quota",
    body: "{workspaceName} has exceeded its {metricLabel} quota.",
    usageRowLabel: "Usage",
    note: "Review usage and consider reaching out about an upgrade.",
    button: "Open in admin →",
  },
  "platform.workspace_signup_failed": {
    subject: "A workspace signup didn't complete",
    preview: "Workspace signup failed",
    heading: "Workspace signup failed",
    body: "A workspace signup didn't complete and may need a manual follow-up.",
    emailLabel: "Email",
    reasonLabel: "Reason",
    note: "Check the logs and follow up if needed.",
    button: "Open in admin →",
  },
};

export const PLATFORM_ES: typeof PLATFORM_EN = {
  "platform.new_workspace": {
    subject: "Nuevo espacio de trabajo: {workspaceName}",
    preview: "Nuevo espacio de trabajo registrado",
    heading: "Nuevo espacio de trabajo registrado",
    body: "{workspaceName} acaba de crear un espacio de trabajo en Tulala.",
    ownerLabel: "Propietario",
    planRowLabel: "Plan",
    note: "Revísalo en la consola de administración de la plataforma.",
    button: "Abrir en administración →",
  },
  "platform.workspace_over_quota": {
    subject: "{workspaceName} superó su cuota",
    preview: "Espacio de trabajo sobre la cuota",
    heading: "Espacio de trabajo sobre la cuota",
    body: "{workspaceName} superó su cuota de {metricLabel}.",
    usageRowLabel: "Uso",
    note: "Revisa el uso y considera proponerle una mejora de plan.",
    button: "Abrir en administración →",
  },
  "platform.workspace_signup_failed": {
    subject: "Un registro de espacio de trabajo no se completó",
    preview: "Registro de espacio de trabajo fallido",
    heading: "Registro de espacio de trabajo fallido",
    body: "Un registro de espacio de trabajo no se completó y puede necesitar seguimiento manual.",
    emailLabel: "Correo",
    reasonLabel: "Motivo",
    note: "Revisa los registros y da seguimiento si es necesario.",
    button: "Abrir en administración →",
  },
};
