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
};
