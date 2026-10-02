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
  "Custom domains need Web Office. Upgrade to unlock this feature.": "Los dominios propios requieren Web Office. Mejora tu plan para desbloquearlos.",
  "Custom domains unlock after the Web Office trial ends.": "Los dominios propios se desbloquean al terminar la prueba de Web Office.",
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
};
