/** Spanish for the homepage network preview card (bucket TUL-518, was TUL-499). */
export type NetworkPreviewCard = { name: string; meta: string; kind: "Agency" | "Hub"; kindLabel: string };

export function networkPreviewCopy(locale: string): {
  eyebrow: string;
  headline: string;
  tags: string[];
  openTag: string;
  cards: NetworkPreviewCard[];
} {
  const es = locale.trim().toLowerCase().startsWith("es");
  if (es) {
    return {
      eyebrow: "Agencias y hubs",
      headline: "Busca en la red antes de postularte.",
      tags: ["Abierto", "Tulum", "Belleza", "Comida", "Música en vivo"],
      openTag: "Abierto",
      cards: [
        { name: "Impronta Models", meta: "Tulum · modelos, creadores, anfitriones", kind: "Agency", kindLabel: "Agencia" },
        { name: "Tulala Service Hub", meta: "Red · chefs, belleza, hogar", kind: "Hub", kindLabel: "Hub" },
        { name: "Nova Crew", meta: "Ciudad de México · eventos, artistas", kind: "Agency", kindLabel: "Agencia" },
        { name: "Private Pro Network", meta: "Remoto · especialistas, equipos", kind: "Hub", kindLabel: "Hub" },
      ],
    };
  }
  return {
    eyebrow: "Agencies & hubs",
    headline: "Search the network before you apply.",
    tags: ["Open", "Tulum", "Beauty", "Food", "Live music"],
    openTag: "Open",
    cards: [
      { name: "Impronta Models", meta: "Tulum · models, creators, hosts", kind: "Agency", kindLabel: "Agency" },
      { name: "Tulala Service Hub", meta: "Network · chefs, beauty, home", kind: "Hub", kindLabel: "Hub" },
      { name: "Nova Crew", meta: "Mexico City · events, performers", kind: "Agency", kindLabel: "Agency" },
      { name: "Private Pro Network", meta: "Remote · specialists, teams", kind: "Hub", kindLabel: "Hub" },
    ],
  };
}
