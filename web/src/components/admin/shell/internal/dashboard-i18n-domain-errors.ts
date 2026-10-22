/**
 * Spanish for the custom-domain drawer and the messages its server actions
 * return. The actions keep returning English text (a stable code in practice);
 * the client maps it through `copy.t`, so the drawer speaks the dashboard
 * language. No em dashes.
 */
export const DOMAIN_ERRORS_ES_TEXT: Record<string, string> = {
  "yourname.com": "tunombre.com",
  "Domains cannot contain spaces.": "Los dominios no pueden tener espacios.",
  "Enter a valid domain like example.com.": "Escribe un dominio válido, como ejemplo.com.",
  "Use a real hostname instead of localhost.": "Usa un dominio real en lugar de localhost.",
  "Domains need at least one dot, like example.com.": "El dominio necesita al menos un punto, como ejemplo.com.",
  "IP addresses cannot be used as custom domains.": "Las direcciones IP no se pueden usar como dominios propios.",
  "That domain contains an invalid hostname label.": "Ese dominio tiene una parte no válida.",
  "That host is reserved by Tulala. Use your own brand domain.": "Ese dominio está reservado por Tulala. Usa el dominio de tu marca.",
  "You must be signed in.": "Debes iniciar sesión.",
  "We could not find your talent profile.": "No encontramos tu perfil de talento.",
  "Custom domains need Web Office. Upgrade to unlock this feature.": "Los dominios propios requieren Oficina Web. Mejora tu plan para desbloquearlos.",
  "Custom domains unlock after the Web Office trial ends.": "Los dominios propios se desbloquean al terminar la prueba de Oficina Web.",
  "Add an email to your account before buying a domain.": "Agrega un correo a tu cuenta antes de comprar un dominio.",
  "Too many searches. Try again in a minute.": "Demasiadas búsquedas. Inténtalo de nuevo en un minuto.",
  "Domain search is not configured yet. Use Connect or Get help instead.": "La búsqueda de dominios aún no está configurada. Usa Conectar u Obtener ayuda.",
  "Could not check that domain.": "No pudimos revisar ese dominio.",
  "Only USD registrar quotes are supported right now. Try Connect or Get help.": "Por ahora solo se admiten precios del registrador en USD. Prueba Conectar u Obtener ayuda.",
  "Invalid domain price.": "Precio de dominio no válido.",
  "That domain is no longer available at this price.": "Ese dominio ya no está disponible a este precio.",
  "The price changed. Search again before checkout.": "El precio cambió. Busca de nuevo antes de pagar.",
  "Could not create the support ticket.": "No pudimos crear el ticket de soporte.",
  "Existing domain records could not be checked.": "No pudimos revisar los registros del dominio.",
  "Verification could not be restarted for that domain.": "No pudimos reiniciar la verificación de ese dominio.",
  "That domain is already connected somewhere else.": "Ese dominio ya está conectado en otro lugar.",
  "That domain could not be saved.": "No pudimos guardar ese dominio.",
  "The saved domain record could not be loaded.": "No pudimos cargar el registro guardado del dominio.",
  "That custom domain is not attached to your site.": "Ese dominio propio no está conectado a tu sitio.",
  "No verification token is saved for that domain. Reconnect it for a fresh token.": "No hay un token de verificación guardado para ese dominio. Reconéctalo para obtener uno nuevo.",
  "The domain could not be re-checked right now.": "No pudimos volver a revisar el dominio ahora.",
  "Routing and SSL could not be checked right now.": "No pudimos revisar el enrutamiento y el SSL ahora.",
  "That domain is not attached to your site.": "Ese dominio no está conectado a tu sitio.",
  "Your primary domain could not be updated.": "No pudimos actualizar tu dominio principal.",
  "That custom domain could not be removed.": "No pudimos quitar ese dominio propio.",
  "Download my data": "Descargar mis datos",
  // WAVE 1B D6 — plan grace / transfer-out / expire
  "Your Web Office plan ended. Your custom domain is paused. Restore Web Office by {date} to keep it.":
    "Tu plan de Oficina Web terminó. Tu dominio propio está en pausa. Restaura Oficina Web antes del {date} para conservarlo.",
  "Your Web Office plan ended. Your custom domain is paused. Restore Web Office within 30 days to keep it.":
    "Tu plan de Oficina Web terminó. Tu dominio propio está en pausa. Restaura Oficina Web en 30 días para conservarlo.",
  "After the grace period we disconnect the domain from Tulala. Purchased domains will not keep auto-renewing at our cost.":
    "Después del periodo de gracia desconectamos el dominio de Tulala. Los dominios comprados no seguirán renovándose a nuestro costo.",
  "Restore plan": "Restaurar plan",
  "Restore plan to keep your domain": "Restaura el plan para conservar tu dominio",
  "Transfer out (auth code)": "Transferir (código de autorización)",
  "Let it expire": "Dejar que expire",
  "Transfer-out selected. Auto-renew is off.": "Transferencia elegida. La renovación automática está desactivada.",
  "This domain will expire. Auto-renew is off.": "Este dominio expirará. La renovación automática está desactivada.",
  "Transfer-out is only available for domains purchased through Tulala.":
    "La transferencia solo está disponible para dominios comprados a través de Tulala.",
  "Expire is only available for domains purchased through Tulala.":
    "Expirar solo está disponible para dominios comprados a través de Tulala.",
  "Could not save your transfer-out choice.": "No pudimos guardar tu elección de transferencia.",
  "Could not save your expire choice.": "No pudimos guardar tu elección de expiración.",
  "Transfer-out saved. Auto-renew will turn off when domain tools are configured. Check back for your auth code.":
    "Transferencia guardada. La renovación automática se desactivará cuando las herramientas de dominio estén configuradas. Vuelve más tarde por tu código de autorización.",
  "This domain is used by another Vercel project. Remove it from that project or transfer it to Tulala, then try again.":
    "Este dominio lo usa otro proyecto de Vercel. Quítalo de ese proyecto o transfiérelo a Tulala y vuelve a intentar.",
  "Vercel could not attach this domain. Check the domain status and try again.":
    "Vercel no pudo conectar este dominio. Revisa el estado del dominio e inténtalo de nuevo.",
  "Vercel could not attach this domain.": "Vercel no pudo conectar este dominio.",
  "Vercel could not verify this domain.": "Vercel no pudo verificar este dominio.",
  "DNS instructions are ready for {domain}. Add the records below to verify it.":
    "Las instrucciones DNS ya están listas para {domain}. Agrega los registros de abajo para verificarlo.",
  "1. Add these DNS records from Vercel": "1. Agrega estos registros DNS de Vercel",
  "2. Also add this ownership TXT record": "2. También agrega este registro TXT de propiedad",
  "3. Then point the domain at Vercel": "3. Luego apunta el dominio a Vercel",
  "Vercel API timed out": "La API de Vercel agotó el tiempo de espera",
  "Could not add domain to Vercel project.": "No pudimos agregar el dominio al proyecto de Vercel.",
  "Could not verify domain ownership on Vercel project.":
    "No pudimos verificar la propiedad del dominio en el proyecto de Vercel.",
  "Vercel provisioning is not configured yet; finish DNS and re-check after env setup.":
    "La conexión con Vercel aún no está lista. Termina el DNS y vuelve a revisar más tarde.",
  "{domain} is already connected.": "{domain} ya está conectado.",
  "{domain} is already verified.": "{domain} ya está verificado.",
  "{domain} is now verified.": "{domain} ya quedó verificado.",
  "TXT record for {domain} still has not been found within the verification window. Add it now and reconnect the domain for a fresh token.":
    "Todavía no encontramos el registro TXT de {domain} dentro del plazo de verificación. Agrégalo ahora y vuelve a conectar el dominio para obtener un token nuevo.",
  "TXT record not found for {domain} yet. DNS changes may still be propagating.":
    "Aún no encontramos el registro TXT de {domain}. Los cambios de DNS pueden tardar en propagarse.",
  "{domain} still needs TXT verification before routing can be checked.":
    "{domain} aún necesita la verificación TXT antes de revisar el enrutamiento.",
  "{domain} is now live with routing and HTTPS on Vercel.": "{domain} ya está activo, con enrutamiento y HTTPS en Vercel.",
  "{domain} routing is detected. HTTPS is still finishing on Vercel.":
    "Detectamos el enrutamiento de {domain}. HTTPS todavía se está configurando en Vercel.",
  "Routing records for {domain} are not live yet. Add the Vercel A/CNAME record and check again.":
    "Los registros de enrutamiento de {domain} aún no están activos. Agrega el registro A/CNAME de Vercel y vuelve a revisar.",
  "{domain} is already your primary domain.": "{domain} ya es tu dominio principal.",
  "{domain} must finish routing and SSL checks before it can become your primary domain.":
    "{domain} debe terminar las revisiones de enrutamiento y SSL antes de ser tu dominio principal.",
  "{domain} is now your primary domain.": "{domain} ahora es tu dominio principal.",
  "{domain} was removed.": "Quitamos {domain}.",
  // Workspace Settings > Domain (admin/settings/domain-actions.ts): every ?derr= / ?dmsg= text.
  "Workspace access could not be confirmed.": "No pudimos confirmar tu acceso al espacio de trabajo.",
  "Workspace details could not be loaded.": "No pudimos cargar los datos del espacio de trabajo.",
  "Only the workspace owner can manage custom domains.": "Solo la persona propietaria del espacio de trabajo puede gestionar dominios propios.",
  "Domain settings are unavailable until Supabase is configured.": "Los ajustes de dominio no están disponibles hasta que se configure Supabase.",
  "No verification token is saved for that domain.": "No hay un token de verificación guardado para ese dominio.",
  "That domain is not attached to this workspace.": "Ese dominio no está conectado a este espacio de trabajo.",
  "That custom domain is not attached to this workspace.": "Ese dominio propio no está conectado a este espacio de trabajo.",
  "The primary public URL could not be updated.": "No pudimos actualizar la dirección pública principal.",
  "The fallback host could not be restored before removal.": "No pudimos restaurar el dominio de respaldo antes de quitarlo.",
  "A branded fallback host is required before the primary custom domain can be removed.":
    "Hace falta un dominio de respaldo de tu marca antes de quitar el dominio propio principal.",
  "{domain} is already the primary public URL.": "{domain} ya es la dirección pública principal.",
  "{domain} is now the primary public URL.": "{domain} ahora es la dirección pública principal.",
  "{domain} is now the Tulala fallback primary URL.": "{domain} ahora es la dirección principal de respaldo de Tulala.",
  "{domain} must finish routing and SSL checks before it can become the primary public URL.":
    "{domain} debe terminar las revisiones de enrutamiento y SSL antes de ser la dirección pública principal.",
  "{domain} was removed. The branded Tulala fallback host is primary again.":
    "Quitamos {domain}. El dominio de respaldo de Tulala vuelve a ser el principal.",
  "TXT record for {domain} still has not been found. You can add it now and check again, or reconnect the domain for a fresh token.":
    "Todavía no encontramos el registro TXT de {domain}. Puedes agregarlo ahora y volver a revisar, o reconectar el dominio para obtener un token nuevo.",
  "DNS instructions are ready for {domain}. Add the TXT record to verify it.":
    "Las instrucciones DNS ya están listas para {domain}. Agrega el registro TXT para verificarlo.",
  "Vercel project provisioning is not configured yet; finish DNS and run the verification sweep after env setup.":
    "La conexión con el proyecto de Vercel aún no está lista. Termina el DNS y ejecuta la revisión cuando se configure.",
  "DNS token is ready, but Vercel project provisioning needs attention.":
    "El token DNS está listo, pero la conexión con el proyecto de Vercel necesita atención.",
};

/** Messages the domain actions build with the domain inside; keys of the map above. */
const DOMAIN_MESSAGE_TEMPLATES = Object.keys(DOMAIN_ERRORS_ES_TEXT).filter((k) => k.includes("{domain}"));

/** Trailing sentences the actions append to a message; each has its own row in the map. */
const ACTION_HINT_SUFFIXES = [
  "Vercel provisioning is not configured yet; finish DNS and re-check after env setup.",
  "Vercel project provisioning is not configured yet; finish DNS and run the verification sweep after env setup.",
  "DNS token is ready, but Vercel project provisioning needs attention.",
];

function templateMatch(template: string, text: string): string | null {
  const [before = "", after = ""] = template.split("{domain}");
  if (text.length <= before.length + after.length) return null;
  if (!text.startsWith(before) || !text.endsWith(after)) return null;
  return text.slice(before.length, text.length - after.length);
}

/**
 * Translate a domain action message that carries the domain inline
 * ("x.com was removed.") through its `{domain}` template, so the dictionary
 * can match it. Text with no template goes through `t` unchanged.
 */
export function translateDomainActionText(text: string, t: (value: string) => string): string {
  let body = text;
  let tail = "";
  for (const hint of ACTION_HINT_SUFFIXES) {
    if (body.endsWith(` ${hint}`)) {
      body = body.slice(0, -(hint.length + 1));
      tail = ` ${t(hint)}`;
      break;
    }
  }
  for (const template of DOMAIN_MESSAGE_TEMPLATES) {
    const domain = templateMatch(template, body);
    if (domain) return t(template).replaceAll("{domain}", domain) + tail;
  }
  return t(body) + tail;
}
