/**
 * Billing email copy fragment (EN + ES). Aggregated by `../email-copy.ts`.
 *
 * `BILLING_ES: typeof BILLING_EN` enforces key + shape parity at build time. No
 * `as const` — values stay `string` so ES can hold different words.
 *
 * Keys are the catalog `templateId` strings found in `catalog-entries-billing.ts`.
 * Placeholders use `{var}` (filled via `interpolate`):
 *   {name}  = recipient display name
 *   {brand} = the agency / workspace account name
 *   {plan}, {fromPlan}, {toPlan}, {effective}, {trialEnds} = billing values
 *
 * Multi-templateId templates:
 *  - TrialStarted renders both `billing.trial_started.workspace` and
 *    `billing.trial_started.talent` (identical copy).
 *  - TrialWillEnd renders both `billing.trial_will_end.workspace` and
 *    `billing.trial_will_end.talent` (identical copy).
 *  - SubscriptionCanceled renders `billing.subscription_cancelled` (full cancel)
 *    and `billing.plan_downgraded` (plan change); it branches internally on
 *    `isFullCancel`, so the single `billing.subscription_cancelled` entry holds
 *    BOTH the full-cancel and the plan-change strings (headingChange/bodyChange).
 */

export const BILLING_EN = {
  "payment.invoice_issued.client": {
    subject: "Your invoice from {brand}",
    preview: "Your invoice",
    heading: "Your invoice",
    intro: "Here's your invoice for your booking with {brand}.",
    invoiceRowLabel: "Invoice",
    amountRowLabel: "Amount",
    dateRowLabel: "Date",
    note: "A copy is always available from your bookings.",
    button: "View booking →",
  },
  "workspace.payment_failed": {
    subject: "Payment failed — action needed",
    preview: "Payment failed",
    heading: "Payment failed",
    intro: "We couldn't process the latest payment for {brand}.",
    note: "Update your payment method to avoid any interruption to your workspace.",
    button: "Update payment →",
  },
  "billing.plan_upgraded": {
    // Static: the channel interpolates subjects from the raw payload (toPlan is a
    // slug, not a label), so keep the plan name out of the subject. The body
    // still shows the friendly {plan} label (interpolated in the template).
    subject: "Your plan was upgraded",
    subjectFallback: "Your plan was upgraded",
    preview: "You're on {plan}",
    heading: "You're on {plan}",
    intro: "{brand} is now on the {plan} plan. Your new features are active immediately.",
    note: "Manage your plan and billing anytime.",
    button: "Manage billing →",
  },
  "billing.subscription_cancelled": {
    subject: "Your subscription is canceled",
    previewCancel: "{brand} — subscription canceled",
    previewChange: "{brand} — plan changed to {toPlan}",
    headingCancel: "Your subscription is canceled",
    headingChange: "Plan change confirmed",
    intro: "{brand} moved from {fromPlan} to {toPlan}, effective {effective}.",
    bodyCancel:
      "Your roster, inquiries, and booking history stay intact. Public site pages stop publishing and any custom domain disconnects. Resubscribe any time at tulala.digital.",
    bodyChange:
      "Entitlements for your new tier are active immediately. Anything that requires the higher tier (custom domain, advanced analytics) is paused; everything else continues.",
    button: "Manage billing →",
  },
  "billing.trial_started.workspace": {
    subject: "Your trial is active",
    preview: "Your trial is active",
    heading: "Your trial is active",
    introWithDate:
      "Hi {name}, your {plan} trial is live — explore everything it unlocks. You won't be charged until {trialEnds}, and you can manage your subscription anytime.",
    introNoDate:
      "Hi {name}, your {plan} trial is live — explore everything it unlocks. You won't be charged during the trial, and you can manage your subscription anytime.",
    fieldPlan: "Plan",
    fieldTrialEnds: "Trial ends",
    button: "Manage subscription →",
  },
  "billing.discount_ending.workspace": {
    subject: "Your discount ends soon",
    preview: "Your discount ends soon",
    heading: "Your discount ends soon",
    introWithDate:
      "Hi {name}, the discount on your {plan} plan ends on {discountEnds}. From your next invoice you will be billed the standard rate.",
    introNoDate:
      "Hi {name}, the discount on your {plan} plan is ending. From your next invoice you will be billed the standard rate.",
    fieldPlan: "Plan",
    fieldDiscountEnds: "Discount ends",
    fieldNextAmount: "Next invoice",
    note: "Nothing changes today, and you do not need to do anything. We are telling you early so the amount is never a surprise.",
    button: "Manage billing",
  },
  "billing.trial_will_end.workspace": {
    subject: "Your trial is ending soon",
    preview: "Your trial is ending soon",
    heading: "Your trial is ending soon",
    introWithDate:
      "Hi {name}, your {plan} trial ends on {trialEnds}. To keep your features without interruption, add a payment method or confirm your subscription.",
    introNoDate:
      "Hi {name}, your {plan} trial is ending soon. To keep your features without interruption, add a payment method or confirm your subscription.",
    fieldPlan: "Plan",
    fieldTrialEnds: "Trial ends",
    note: "You won't be charged until your trial ends.",
    button: "Manage billing →",
  },
};

export const BILLING_ES: typeof BILLING_EN = {
  "payment.invoice_issued.client": {
    subject: "Tu factura de {brand}",
    preview: "Tu factura",
    heading: "Tu factura",
    intro: "Aquí está tu factura por tu reservación con {brand}.",
    invoiceRowLabel: "Factura",
    amountRowLabel: "Importe",
    dateRowLabel: "Fecha",
    note: "Siempre tienes una copia disponible en tus reservaciones.",
    button: "Ver reservación →",
  },
  "workspace.payment_failed": {
    subject: "Pago rechazado — acción requerida",
    preview: "Pago rechazado",
    heading: "Pago rechazado",
    intro: "No pudimos procesar el último pago de {brand}.",
    note: "Actualiza tu método de pago para evitar cualquier interrupción en tu espacio de trabajo.",
    button: "Actualizar pago →",
  },
  "billing.plan_upgraded": {
    subject: "Tu plan fue actualizado",
    subjectFallback: "Tu plan fue actualizado",
    preview: "Ya estás en {plan}",
    heading: "Ya estás en {plan}",
    intro: "{brand} ahora está en el plan {plan}. Tus nuevas funciones están activas de inmediato.",
    note: "Administra tu plan y facturación cuando quieras.",
    button: "Administrar facturación →",
  },
  "billing.subscription_cancelled": {
    subject: "Tu suscripción está cancelada",
    previewCancel: "{brand} — suscripción cancelada",
    previewChange: "{brand} — plan cambiado a {toPlan}",
    headingCancel: "Tu suscripción está cancelada",
    headingChange: "Cambio de plan confirmado",
    intro: "{brand} pasó de {fromPlan} a {toPlan}, a partir del {effective}.",
    bodyCancel:
      "Tu roster, las solicitudes y el historial de reservas permanecen intactos. Las páginas públicas de tu sitio dejan de publicarse y cualquier dominio personalizado se desconecta. Puedes volver a suscribirte cuando quieras en tulala.digital.",
    bodyChange:
      "Los beneficios de tu nuevo nivel están activos de inmediato. Todo lo que requiere el nivel superior (dominio personalizado, analíticas avanzadas) queda en pausa; lo demás continúa.",
    button: "Administrar facturación →",
  },
  "billing.trial_started.workspace": {
    subject: "Tu prueba está activa",
    preview: "Tu prueba está activa",
    heading: "Tu prueba está activa",
    introWithDate:
      "Hola {name}, tu prueba de {plan} ya está activa — explora todo lo que desbloquea. No se te cobrará hasta el {trialEnds}, y puedes administrar tu suscripción cuando quieras.",
    introNoDate:
      "Hola {name}, tu prueba de {plan} ya está activa — explora todo lo que desbloquea. No se te cobrará durante la prueba, y puedes administrar tu suscripción cuando quieras.",
    fieldPlan: "Plan",
    fieldTrialEnds: "La prueba termina",
    button: "Administrar suscripción →",
  },
  "billing.discount_ending.workspace": {
    subject: "Tu descuento termina pronto",
    preview: "Tu descuento termina pronto",
    heading: "Tu descuento termina pronto",
    introWithDate:
      "Hola {name}, el descuento de tu plan {plan} termina el {discountEnds}. Desde tu próxima factura se te cobrará la tarifa habitual.",
    introNoDate:
      "Hola {name}, el descuento de tu plan {plan} está por terminar. Desde tu próxima factura se te cobrará la tarifa habitual.",
    fieldPlan: "Plan",
    fieldDiscountEnds: "El descuento termina",
    fieldNextAmount: "Próxima factura",
    note: "Hoy no cambia nada y no tienes que hacer nada. Te avisamos con tiempo para que el monto nunca sea una sorpresa.",
    button: "Gestionar facturación",
  },
  "billing.trial_will_end.workspace": {
    subject: "Tu prueba está por terminar",
    preview: "Tu prueba está por terminar",
    heading: "Tu prueba está por terminar",
    introWithDate:
      "Hola {name}, tu prueba de {plan} termina el {trialEnds}. Para conservar tus funciones sin interrupciones, agrega un método de pago o confirma tu suscripción.",
    introNoDate:
      "Hola {name}, tu prueba de {plan} está por terminar. Para conservar tus funciones sin interrupciones, agrega un método de pago o confirma tu suscripción.",
    fieldPlan: "Plan",
    fieldTrialEnds: "La prueba termina",
    note: "No se te cobrará hasta que termine tu prueba.",
    button: "Administrar facturación →",
  },
};
