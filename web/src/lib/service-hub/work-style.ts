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

// ── Changing the style later: never overwrite silently ───────────────────────

/** Setting the style sets client prices, the split and who gets requests: owner or admin only. */
export function canSetWorkStyle(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

export type StoredWorkStyle = { choice: WorkStyleChoice; preset: HubPreset };

const SPLIT_KINDS = ["percent", "margin", "all", "rent"] as const;

/** The stored row (`workspace_hub_defaults`) as choice + preset. Null (fail closed) on anything unknown. */
export function storedToPreset(row: Record<string, unknown> | null | undefined): StoredWorkStyle | null {
  const choice = rowToChoice(row);
  if (!row || !choice) return null;
  const kind = row.split_kind;
  if (!(SPLIT_KINDS as readonly unknown[]).includes(kind)) return null;
  const bps = typeof row.split_bps === "number" ? row.split_bps : null;
  const requestsGoTo = row.requests_go_to === "talent" || row.requests_go_to === "workspace" ? row.requests_go_to : null;
  const chatSeenBy = row.chat_seen_by === "talent" || row.chat_seen_by === "workspace" ? row.chat_seen_by : null;
  const priceShown = row.price_shown === "talent_price" || row.price_shown === "talent_plus_margin" || row.price_shown === "workspace_price" ? row.price_shown : null;
  if (!requestsGoTo || !chatSeenBy || !priceShown) return null;
  let split: Split;
  if (kind === "percent" || kind === "margin") {
    if (bps === null) return null;
    split = { kind, bps };
  } else split = kind === "all" ? { kind: "all", bps: null } : { kind: "rent", bps: null, amountCents: null };
  return { choice, preset: { requestsGoTo, chatSeenBy, priceShown, split, safetyOfficer: row.safety_officer === true } };
}

export type ChangeField = "requestsGoTo" | "chatSeenBy" | "priceShown" | "split" | "safetyOfficer";
export type Change = { field: ChangeField; from: string; to: string };

function splitKey(s: Split): string {
  return s.bps === null ? s.kind : `${s.kind}:${s.bps}`;
}

function valueKey(field: ChangeField, p: HubPreset): string {
  return field === "split" ? splitKey(p.split) : String(p[field]);
}

const CHANGE_FIELDS: readonly ChangeField[] = ["requestsGoTo", "chatSeenBy", "priceShown", "split", "safetyOfficer"];

export type WorkStylePlan =
  | { kind: "first_time" }
  | { kind: "same" }
  | { kind: "confirm"; changes: Change[] };

/**
 * What saving `choice` would do. Nothing stored: first-time setup, fills everything, nothing
 * is overwritten. Stored: only settings that would actually change are listed, and the
 * caller must get an explicit confirm before anything is written.
 */
export function planWorkStyleChange(current: StoredWorkStyle | null, choice: WorkStyleChoice): WorkStylePlan {
  if (!current) return { kind: "first_time" };
  const next = presetFor(choice);
  const changes: Change[] = [];
  for (const field of CHANGE_FIELDS) {
    const from = valueKey(field, current.preset);
    const to = valueKey(field, next);
    if (from !== to) changes.push({ field, from, to });
  }
  if (changes.length === 0 && current.choice === choice) return { kind: "same" };
  // Same settings under a different style label: still a confirm (the label changes), no lines.
  return { kind: "confirm", changes };
}

const FIELD_LABEL: Record<ChangeField, { es: string; en: string }> = {
  requestsGoTo: { es: "Quién recibe las solicitudes", en: "Who gets requests" },
  chatSeenBy: { es: "Quién ve el chat con el cliente", en: "Who sees the client chat" },
  priceShown: { es: "Precio que ve el cliente", en: "Price shown" },
  split: { es: "Tu parte", en: "Your share" },
  safetyOfficer: { es: "Cuidas la seguridad de la red", en: "You keep the network safe" },
};

function valueLabel(field: ChangeField, key: string, locale: WorkStyleLocale): string {
  const es = locale === "es";
  switch (field) {
    case "requestsGoTo":
    case "chatSeenBy":
      return key === "workspace" ? (es ? "Tú" : "You") : es ? "Cada persona" : "Each person";
    case "priceShown":
      return key === "talent_plus_margin"
        ? es ? "Precio de la persona más tu parte" : "Person's price plus your share"
        : key === "workspace_price"
          ? es ? "Precio de tu negocio" : "Your business's price"
          : es ? "Precio de la persona" : "Person's price";
    case "safetyOfficer":
      return key === "true" ? (es ? "Sí" : "Yes") : es ? "No" : "No";
    case "split": {
      const [kind, bps] = key.split(":");
      const pct = bps ? `${Number(bps) / 100}%` : "";
      if (kind === "all") return es ? "Todo" : "Everything";
      if (kind === "rent") return es ? "Renta (tú fijas el monto)" : "Rent (you set the amount)";
      return es ? `${pct}${kind === "margin" ? " sobre el precio" : ""}` : `${pct}${kind === "margin" ? " on top of the price" : ""}`;
    }
  }
}

/** Plain lines for the confirm: "Price shown: A → B". */
export function describeChanges(changes: readonly Change[], locale: WorkStyleLocale): string[] {
  return changes.map((c) => `${FIELD_LABEL[c.field][locale]}: ${valueLabel(c.field, c.from, locale)} → ${valueLabel(c.field, c.to, locale)}`);
}

const TRADE_WORDS: Record<ExampleTrade, RegExp> = {
  chefs: /\b(chef|chefs|cocin\w*|cook\w*|catering|banquet\w*|comida|food|menu|menú)\b/i,
  cleaners: /\b(clean\w*|limpi\w*|maid|housekeep\w*|janitor\w*|aseo)\b/i,
  nails: /\b(nail\w*|u[ñn]as?|manicur\w*|pedicur\w*|beauty|salon|salón|belleza|hair|cabello)\b/i,
  guides: /\b(tour\w*|guid\w*|gu[ií]as?|excursi\w*|travel|viaje\w*|experienc\w*)\b/i,
  models: /\b(model\w*|modelos?|talent|talento|photograph\w*|fot[oó]graf\w*|casting)\b/i,
};

/** TUL-1474: the trade an industry preset speaks, when the services alone say nothing. null = no clear trade. */
export function tradeFromIndustryPreset(preset: unknown): ExampleTrade | null {
  const id = typeof preset === "string" ? preset.trim().toLowerCase() : "";
  if (id === "restaurant" || id === "bar_club" || id === "beach_club" || id === "private_chef") return "chefs";
  if (id === "home_services" || id === "dropoff_service") return "cleaners";
  if (id === "salon_barber" || id === "spa_wellness" || id === "pet_grooming") return "nails";
  if (id === "tours_activities") return "guides";
  if (id === "act" || id === "portfolio" || id === "agency") return "models";
  return null;
}

/**
 * The trade the examples should speak, read from the workspace's own service categories and
 * titles (TUL-1474). The trade with the most matching services wins; a tie or no match is null
 * (the caller falls back to a stable pick). Never a client value.
 */
export function tradeFromCategories(texts: readonly (string | null | undefined)[]): ExampleTrade | null {
  const score = new Map<ExampleTrade, number>();
  for (const t of texts) {
    if (!t) continue;
    for (const trade of EXAMPLE_TRADES) if (TRADE_WORDS[trade].test(t)) score.set(trade, (score.get(trade) ?? 0) + 1);
  }
  let best: ExampleTrade | null = null;
  let bestN = 0;
  let tie = false;
  for (const trade of EXAMPLE_TRADES) {
    const n = score.get(trade) ?? 0;
    if (n > bestN) { best = trade; bestN = n; tie = false; } else if (n === bestN && n > 0) tie = true;
  }
  return tie ? null : best;
}
