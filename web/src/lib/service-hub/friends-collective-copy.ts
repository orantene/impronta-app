/**
 * TUL-1374: ES and EN copy for the Friends collective preset. Kept as typed
 * constants (like the other service-hub copy) until the owner screen that shows
 * it lands; the screen reads it by locale. No dashes in user-facing copy.
 */
export type CollectiveCopy = {
  title: string;
  summary: string;
  ownerShare: string;
  capNote: string;
  membersSee: string;
  reviews: string;
  seatCap: string;
  apply: string;
  applied: string;
  memberHeading: string;
  percentLabel: string;
  fixedLabel: string;
  noShare: string;
  save: string;
  saved: string;
  ownerOnly: string;
  overCap: string;
};

export const COLLECTIVE_COPY: Record<"en" | "es", CollectiveCopy> = {
  en: {
    title: "Friends collective",
    summary:
      "A small group that sells together. One person, the owner, coordinates: every request goes to the owner's inbox, and members get the job and their own thread.",
    ownerShare:
      "The owner takes a percentage or a fixed amount from each member's price. The member's price is shown with her name.",
    capNote: "The owner can take up to 90% of a member's price, so every member keeps at least 10%.",
    membersSee:
      "Members see the job card and their own thread with the owner. They never see the client chat or the client's contact details.",
    reviews: "Reviews are collected on the owner's page. The member gets private feedback.",
    seatCap: "The Free plan includes up to 5 people.",
    apply: "Use the Friends collective model",
    applied: "Friends collective is on. Every new request goes to your inbox.",
    memberHeading: "What you take from each member's price",
    percentLabel: "Percent (max 90%)",
    fixedLabel: "Fixed amount per sale",
    noShare: "No share (the member keeps the whole price)",
    save: "Save",
    saved: "Saved. Orders priced from now on use this split.",
    ownerOnly: "Only the workspace owner can change this.",
    overCap: "The owner can take at most 90% of a member's price.",
  },
  es: {
    title: "Colectivo de amigos",
    summary:
      "Un grupo pequeño que vende junto. Una persona, la dueña, coordina: todas las solicitudes llegan a su bandeja, y los miembros reciben el trabajo y su propio hilo.",
    ownerShare:
      "La dueña se queda con un porcentaje o un monto fijo del precio de cada miembro. El precio del miembro se muestra con su nombre.",
    capNote: "La dueña puede quedarse hasta el 90% del precio de un miembro, así cada miembro conserva al menos el 10%.",
    membersSee:
      "Los miembros ven la tarjeta del trabajo y su propio hilo con la dueña. Nunca ven el chat del cliente ni sus datos de contacto.",
    reviews: "Las reseñas se reúnen en la página de la dueña. El miembro recibe comentarios privados.",
    seatCap: "El plan Gratis incluye hasta 5 personas.",
    apply: "Usar el modelo Colectivo de amigos",
    applied: "El Colectivo de amigos está activo. Toda solicitud nueva llega a tu bandeja.",
    memberHeading: "Lo que te quedas del precio de cada miembro",
    percentLabel: "Porcentaje (máx. 90%)",
    fixedLabel: "Monto fijo por venta",
    noShare: "Sin cargo (el miembro se queda con todo el precio)",
    save: "Guardar",
    saved: "Guardado. Los pedidos que se coticen desde ahora usan este reparto.",
    ownerOnly: "Solo la dueña del espacio puede cambiar esto.",
    overCap: "La dueña puede quedarse como máximo el 90% del precio de un miembro.",
  },
};
