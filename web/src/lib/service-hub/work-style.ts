/**
 * TUL-1442 · "How you work with people" (pure, no DB).
 *
 * One question for a new workspace owner, five icon cards. Each card presets the hub
 * settings (who gets requests, who sees the chat, the price shown, the money split and
 * whether the network acts as safety officer). Everything stays changeable later in
 * Settings. Works for every trade: the examples rotate by trade, the choices never do.
 *
 * The five ids are the same `work_model` values the terms card (TUL-1368) uses, so a
 * workspace's choice becomes the default model when it proposes terms to a talent.
 */

export const WORK_STYLE_CHOICES = [
  "coordinator_agency",
  "open_network",
  "team_studio",
  "rental_studio",
  "friends_collective",
] as const;
export type WorkStyleChoice = (typeof WORK_STYLE_CHOICES)[number];

export type WorkStyleLocale = "es" | "en";

export function isWorkStyleChoice(v: unknown): v is WorkStyleChoice {
  return typeof v === "string" && (WORK_STYLE_CHOICES as readonly string[]).includes(v);
}

/** The stored row (`workspace_hub_defaults`) as a choice. Null (fail closed) on anything unknown. */
export function rowToChoice(row: Record<string, unknown> | null | undefined): WorkStyleChoice | null {
  const v = row?.work_model;
  return isWorkStyleChoice(v) ? v : null;
}

/** Highest share or margin a workspace may take (matches the terms card: the talent keeps at least 10%). */
export const MAX_SPLIT_BPS = 9000;

export type PriceShown = "talent_price" | "talent_plus_margin" | "workspace_price";
export type Split =
  | { kind: "percent"; bps: number }
  | { kind: "margin"; bps: number }
  | { kind: "all"; bps: null }
  /** Rent has no default amount: the owner types it (and its currency) later. */
  | { kind: "rent"; bps: null; amountCents: null };

export type HubPreset = {
  /** Who gets a new request first. */
  requestsGoTo: "workspace" | "talent";
  /** Who reads the client chat. The talent always sees their own job card. */
  chatSeenBy: "workspace" | "talent";
  priceShown: PriceShown;
  split: Split;
  /** The network keeps a safety officer in the private chat of an open-network request. */
  safetyOfficer: boolean;
};

const PRESETS: Record<WorkStyleChoice, HubPreset> = {
  coordinator_agency: { requestsGoTo: "workspace", chatSeenBy: "workspace", priceShown: "talent_plus_margin", split: { kind: "margin", bps: 2000 }, safetyOfficer: false },
  open_network: { requestsGoTo: "talent", chatSeenBy: "talent", priceShown: "talent_price", split: { kind: "percent", bps: 2000 }, safetyOfficer: true },
  team_studio: { requestsGoTo: "workspace", chatSeenBy: "workspace", priceShown: "workspace_price", split: { kind: "all", bps: null }, safetyOfficer: false },
  rental_studio: { requestsGoTo: "talent", chatSeenBy: "talent", priceShown: "talent_price", split: { kind: "rent", bps: null, amountCents: null }, safetyOfficer: false },
  friends_collective: { requestsGoTo: "workspace", chatSeenBy: "workspace", priceShown: "talent_price", split: { kind: "percent", bps: 1000 }, safetyOfficer: false },
};

/** A copy of the choice's preset (the caller may edit it; the shared one never changes). */
export function presetFor(choice: WorkStyleChoice): HubPreset {
  const p = PRESETS[choice];
  return { ...p, split: { ...p.split } as Split };
}

export type ChoiceIcon = "network" | "handshake" | "building" | "key" | "users";

const COPY: Record<WorkStyleChoice, { icon: ChoiceIcon; es: { title: string; line: string }; en: { title: string; line: string } }> = {
  coordinator_agency: {
    icon: "network",
    es: { title: "Yo coordino a mi gente", line: "Los clientes me escriben a mí y yo asigno a quién." },
    en: { title: "I coordinate my people", line: "Clients write to me and I decide who does the job." },
  },
  open_network: {
    icon: "handshake",
    es: { title: "Cada quien vende y yo cobro una parte", line: "Cada persona atiende a su cliente; yo cuido que todo sea seguro." },
    en: { title: "People sell directly, I take a share", line: "Each person serves their own client; I keep things safe." },
  },
  team_studio: {
    icon: "building",
    es: { title: "Mi equipo trabaja para mi negocio", line: "El cliente es de mi negocio y el precio es el mío." },
    en: { title: "My team works for my business", line: "The client is my business's and the price is mine." },
  },
  rental_studio: {
    icon: "key",
    es: { title: "Rento estaciones o espacios", line: "Cada quien atiende a sus clientes y me paga la renta." },
    en: { title: "I rent stations or rooms", line: "Each person serves their own clients and pays me rent." },
  },
  friends_collective: {
    icon: "users",
    es: { title: "Unos amigos trabajamos juntos", line: "Yo recibo las solicitudes y reparto el trabajo entre todos." },
    en: { title: "A few friends working together", line: "I receive the requests and share the work around." },
  },
};

export function choiceIcon(choice: WorkStyleChoice): ChoiceIcon {
  return COPY[choice].icon;
}

export function choiceCopy(choice: WorkStyleChoice, locale: WorkStyleLocale): { title: string; line: string } {
  return COPY[choice][locale];
}

export const EXAMPLE_TRADES = ["chefs", "cleaners", "nails", "guides", "models"] as const;
export type ExampleTrade = (typeof EXAMPLE_TRADES)[number];

const EXAMPLES: Record<WorkStyleChoice, Record<ExampleTrade | "generic", { es: string; en: string }>> = {
  coordinator_agency: {
    chefs: { es: "Una agencia de chefs que asigna al chef de cada evento.", en: "A chef agency that picks the chef for each event." },
    cleaners: { es: "Una empresa de limpieza que manda a la persona indicada.", en: "A cleaning company that sends the right person." },
    nails: { es: "Un estudio de uñas que reparte las citas entre sus artistas.", en: "A nail studio that hands out appointments to its artists." },
    guides: { es: "Una agencia de guías que arma cada recorrido.", en: "A guide agency that puts each tour together." },
    models: { es: "Una agencia de modelos que propone a quién enviar.", en: "A model agency that proposes who to send." },
    generic: { es: "Un negocio que recibe las solicitudes y asigna a su gente.", en: "A business that takes requests and assigns its people." },
  },
  open_network: {
    chefs: { es: "Una red de chefs donde cada uno cierra con su cliente.", en: "A chef network where each chef deals with their own client." },
    cleaners: { es: "Una red de limpieza donde cada persona fija su precio.", en: "A cleaning network where each person sets their price." },
    nails: { es: "Una red de artistas de uñas independientes.", en: "A network of independent nail artists." },
    guides: { es: "Una red de guías locales que atienden por su cuenta.", en: "A network of local guides who work on their own." },
    models: { es: "Una red de modelos que reciben sus propios contactos.", en: "A network of models who get their own enquiries." },
    generic: { es: "Una red donde cada persona atiende a su propio cliente.", en: "A network where each person serves their own client." },
  },
  team_studio: {
    chefs: { es: "Un restaurante con su propio equipo de cocina.", en: "A restaurant with its own kitchen team." },
    cleaners: { es: "Una empresa con personal contratado.", en: "A company with employed staff." },
    nails: { es: "Un salón con sus empleadas.", en: "A salon with its own employees." },
    guides: { es: "Una operadora con guías de planta.", en: "A tour operator with in-house guides." },
    models: { es: "Un estudio con su propio talento de planta.", en: "A studio with its own in-house talent." },
    generic: { es: "Un negocio con empleados que atiende a sus propios clientes.", en: "A business with employees serving its own clients." },
  },
  rental_studio: {
    chefs: { es: "Una cocina compartida que se renta a chefs.", en: "A shared kitchen rented out to chefs." },
    cleaners: { es: "Una bodega que se renta a equipos de limpieza.", en: "A depot rented to cleaning crews." },
    nails: { es: "Un salón que renta sillas a artistas de uñas.", en: "A salon that rents chairs to nail artists." },
    guides: { es: "Un local que renta espacio a guías y tours.", en: "A space rented to guides and tour hosts." },
    models: { es: "Un estudio que se renta por hora a fotógrafos y modelos.", en: "A studio rented by the hour to photographers and models." },
    generic: { es: "Un espacio que se renta a profesionales independientes.", en: "A space rented to independent professionals." },
  },
  friends_collective: {
    chefs: { es: "Cuatro chefs amigos con una sola página.", en: "Four chef friends with one page." },
    cleaners: { es: "Unas amigas que limpian juntas y comparten clientes.", en: "Friends who clean together and share clients." },
    nails: { es: "Unas amigas artistas de uñas con una sola página.", en: "Nail artist friends sharing one page." },
    guides: { es: "Unos amigos guías que se cubren entre sí.", en: "Guide friends who cover for each other." },
    models: { es: "Unos amigos modelos que se recomiendan.", en: "Model friends who refer each other." },
    generic: { es: "Unos amigos que venden juntos desde una sola página.", en: "Friends selling together from one page." },
  },
};

/** The example line under a card for this trade (a stable generic one when the trade is unknown). */
export function exampleFor(choice: WorkStyleChoice, trade: string | null | undefined, locale: WorkStyleLocale): string {
  const key = (EXAMPLE_TRADES as readonly string[]).includes(trade ?? "") ? (trade as ExampleTrade) : "generic";
  return EXAMPLES[choice][key][locale];
}

/** Rotate which trade the examples show, stable per workspace (no flicker between visits). */
export function tradeForSeed(seed: string): ExampleTrade {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return EXAMPLE_TRADES[h % EXAMPLE_TRADES.length];
}

/** The workspace's own copy of the plain-language lines under "what this sets up". */
export function presetSummary(choice: WorkStyleChoice, locale: WorkStyleLocale): string[] {
  const p = PRESETS[choice];
  const es = locale === "es";
  const lines: string[] = [];
  lines.push(p.requestsGoTo === "workspace" ? (es ? "Las solicitudes te llegan a ti primero." : "Requests reach you first.") : (es ? "Las solicitudes llegan a cada persona." : "Requests go straight to each person."));
  lines.push(p.chatSeenBy === "workspace" ? (es ? "Solo tú ves el chat con el cliente." : "Only you see the client chat.") : (es ? "Cada persona ve su propio chat con el cliente." : "Each person sees their own client chat."));
  lines.push(p.priceShown === "talent_plus_margin" ? (es ? "El cliente ve el precio de la persona más tu parte." : "Clients see the person's price plus your share.") : p.priceShown === "workspace_price" ? (es ? "El cliente ve el precio de tu negocio." : "Clients see your business's price.") : (es ? "El cliente ve el precio de cada persona." : "Clients see each person's price."));
  lines.push(p.split.kind === "all" ? (es ? "Todo lo que se cobra es de tu negocio." : "Everything charged goes to your business.") : p.split.kind === "rent" ? (es ? "Tú cobras renta; tú fijas el monto después." : "You charge rent; you set the amount later.") : (es ? `Tú te quedas con ${(p.split.bps ?? 0) / 100}%.` : `You keep ${(p.split.bps ?? 0) / 100}%.`));
  if (p.safetyOfficer) lines.push(es ? "Tú cuidas que todo sea seguro dentro de la red." : "You keep things safe across the network.");
  return lines;
}

/** Dark by default: exactly "true" turns the onboarding question on. */
export function workStyleOnboardingEnabled(env: string | undefined): boolean {
  return env === "true";
}

/** Where a freshly opened workspace lands: the question first when the flag is on, else the admin home. */
export function afterWorkspaceCreatedPath(adminPath: string, enabled: boolean): string {
  if (!enabled) return adminPath;
  return `${adminPath.replace(/\/+$/, "")}/work-style`;
}
