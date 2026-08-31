/**
 * questions.ts — the intake question bank, as versioned data.
 *
 * WHY NOT PROSE IN A SYSTEM PROMPT
 * ────────────────────────────────
 * A question embedded in a prompt string cannot be measured, versioned,
 * compared or A/B tested, and it cannot be named in an event. Every metric the
 * learning loop needs is keyed on a question id:
 *
 *   - abandonment point: which question was on screen when the session went cold
 *   - yield per question: how many facts it produced, at what confidence
 *   - re-ask rate: how often the answer did not parse
 *   - could-not-answer: which industry a question is wrong for
 *
 * None of that is recoverable after the fact. Retrofitting ids later makes every
 * measurement taken before the retrofit worthless, which is why this file exists
 * before the first conversation does.
 *
 * WHAT A QUESTION IS
 * ──────────────────
 * A question is a REQUEST FOR SPECIFIC FACTS, not a line of dialogue. `targets`
 * is the contract: this is what asking it is supposed to obtain. That is what
 * makes "the Agent already knows this, skip it" a lookup rather than a judgement
 * call, and it is what makes yield measurable.
 *
 * The Agent does NOT read these out verbatim. It is given the question's intent
 * and its phrasing as a reference, and speaks naturally. The id is what gets
 * logged, so a reworded delivery is still attributable.
 *
 * NO SELF-EDITING
 * ───────────────
 * Deliberately static data in source control. The Agent may PROPOSE a rewording;
 * a human approves it and ships it here, exactly as L20 governs generated
 * content. A question bank that rewrites itself on metrics drifts somewhere
 * nobody signed off on, and the whole point of versioning is that someone can
 * say which version a measurement belongs to.
 */

import { isKnownFactKey } from "./fact-keys";
import { allPackQuestions, type IndustryPack } from "./industry-packs";

// ─── Stages ───────────────────────────────────────────────────────────────────

/**
 * The conversation's stages, in their natural order.
 *
 * Order is a default, not a script. Stages are SKIPPABLE: someone who opens with
 * "I'm Sofia, makeup artist in Tulum, I own Glow Studio, three artists including
 * me" has answered five stages in one sentence, and asking twelve questions
 * after that is the single fastest way to lose them.
 */
export const STAGES = [
  "discovery",
  "identity",
  "work",
  "structure",
  "presence",
  "maturity",
  "brand",
  "operations",
  "goals",
  /**
   * Industry-pack detail, and LAST for a reason. Stage order is the priority
   * order, so nothing a pack asks can displace a question that decides the
   * recommendation. Someone who leaves after six turns must have spent them on
   * what they are going to be charged, not on shoot turnaround times.
   */
  "specifics",
] as const;

export type Stage = (typeof STAGES)[number];

// ─── Shape ────────────────────────────────────────────────────────────────────

export type QuestionPhrasing = {
  /** What the Agent is asking for, in one line. Shown in the UI when needed. */
  text: string;
  /** Optional nudge if the first answer was empty or unusable. */
  followUp?: string;
};

export type Question = {
  /** Stable forever. Renaming one orphans every event ever logged against it. */
  id: string;
  /**
   * Bumped when the PHRASING changes in a way that could change the answer.
   * Typo fixes do not count. This is what lets two phrasings be compared.
   */
  version: number;
  stage: Stage;
  /** Fact keys this question exists to obtain. Validated against the vocabulary. */
  targets: readonly string[];
  /**
   * True when the question is open-ended, so the open-versus-closed tradeoff can
   * be read off the metrics rather than argued about. Open phrasings should show
   * higher facts-per-turn AND a higher re-ask rate; both are logged.
   */
  open: boolean;
  /**
   * Load-bearing for the plan choice. These are the four operating questions
   * plus the shape fork; skipping one means the engine guesses at what someone
   * pays. Flagged so the Agent knows what it must not leave unasked.
   */
  decisive?: boolean;
  /** Only ask when this returns true, given the facts so far. */
  askWhen?: (known: ReadonlySet<string>) => boolean;
  phrasing: Record<"en" | "es", QuestionPhrasing>;
};

// ─── The bank ─────────────────────────────────────────────────────────────────

/**
 * Bumped when the SET changes: a question added, removed, or re-staged. Stored
 * alongside intake events so a cohort can be identified.
 */
export const QUESTION_BANK_VERSION = 1;

const knows = (known: ReadonlySet<string>, ...keys: string[]) =>
  keys.some((k) => known.has(k));

export const QUESTIONS: readonly Question[] = [
  // ── Discovery ──────────────────────────────────────────────────────────────
  {
    id: "discovery.opening",
    version: 1,
    stage: "discovery",
    // Targets nothing specific on purpose. The opening question is a net, and
    // whatever it catches gets extracted. Declaring targets here would imply the
    // Agent should chase them, which is how an opening turns into an interview.
    targets: [],
    open: true,
    phrasing: {
      en: {
        text: "Tell me what you do today, and what you would like to build.",
        followUp: "Even a sentence is enough to start. What kind of work do you do?",
      },
      es: {
        text: "Cuéntame a qué te dedicas hoy y qué te gustaría construir.",
        followUp: "Con una frase basta para empezar. ¿Qué tipo de trabajo haces?",
      },
    },
  },

  // ── Identity ───────────────────────────────────────────────────────────────
  {
    id: "identity.name",
    version: 1,
    stage: "identity",
    targets: ["person.name", "person.professional_name"],
    open: false,
    phrasing: {
      en: { text: "What name do you work under? Your own, or a stage name, either is fine." },
      es: { text: "¿Con qué nombre trabajas? El tuyo o un nombre artístico, cualquiera vale." },
    },
  },
  {
    id: "identity.city",
    version: 1,
    stage: "identity",
    targets: ["person.city", "person.country"],
    open: false,
    phrasing: {
      en: { text: "Where do you work? A city is enough." },
      es: { text: "¿Dónde trabajas? Con la ciudad basta." },
    },
  },

  // ── Work ───────────────────────────────────────────────────────────────────
  {
    id: "work.what_you_do",
    version: 1,
    stage: "work",
    targets: ["work.discipline", "work.industry", "work.services"],
    open: true,
    phrasing: {
      en: { text: "What do people actually book you for?" },
      es: { text: "¿Para qué te contrata la gente exactamente?" },
    },
  },
  {
    id: "work.booked_by_name",
    version: 1,
    stage: "work",
    targets: ["work.booked_by_name", "work.performs_service_personally"],
    open: false,
    phrasing: {
      en: {
        text: "When someone books, are they asking for you specifically, or for the service?",
      },
      es: {
        text: "Cuando alguien reserva, ¿te pide a ti en concreto o pide el servicio?",
      },
    },
  },

  // ── Structure: the four questions that actually pick the product ───────────
  {
    id: "structure.works_from",
    version: 1,
    stage: "structure",
    targets: ["business.works_from"],
    open: false,
    decisive: true,
    phrasing: {
      en: {
        text: "Where does the work happen? Your place, someone else's, or wherever the client is?",
      },
      es: {
        text: "¿Dónde ocurre el trabajo? En tu sitio, en el de otra persona, o donde esté el cliente?",
      },
    },
  },
  {
    id: "structure.others_involved",
    version: 1,
    stage: "structure",
    targets: ["business.has_staff", "business.represents_others", "business.works_alone"],
    open: false,
    decisive: true,
    phrasing: {
      en: { text: "Does anyone else work with you, or under you?" },
      es: { text: "¿Trabaja alguien más contigo o para ti?" },
    },
  },
  {
    id: "structure.arrangement",
    version: 1,
    stage: "structure",
    targets: ["business.other_workers_arrangement", "business.takes_commission", "business.staff_count"],
    open: false,
    decisive: true,
    // Only meaningful once we know somebody else is involved. Asking a sole
    // trader how she splits the money is the kind of question that makes the
    // conversation feel like it is not listening.
    askWhen: (known) => knows(known, "business.has_staff", "business.represents_others"),
    phrasing: {
      en: {
        text: "How does the money work with them? You take a share, they pay you rent, or they are on a wage?",
        followUp: "Roughly is fine. And how many of you are there in total?",
      },
      es: {
        text: "¿Cómo funciona el dinero con ellos? Te llevas una parte, te pagan alquiler, o van a sueldo?",
        followUp: "Aproximado vale. ¿Y cuántos sois en total?",
      },
    },
  },
  {
    id: "structure.who_do_clients_choose",
    version: 1,
    stage: "structure",
    targets: ["business.clients_choose_provider"],
    open: false,
    decisive: true,
    askWhen: (known) => knows(known, "business.has_staff", "business.represents_others"),
    phrasing: {
      en: {
        text: "When a client books, are they picking a specific person, or just a time at your place?",
      },
      es: {
        text: "Cuando un cliente reserva, ¿elige a una persona concreta o solo una hora en tu sitio?",
      },
    },
  },

  // ── Existing presence ──────────────────────────────────────────────────────
  {
    id: "presence.links",
    version: 1,
    stage: "presence",
    targets: ["presence.instagram_handle", "presence.website_url"],
    open: false,
    phrasing: {
      en: {
        text: "Do you have an Instagram or a site already? Paste it and I will read it rather than making you type it all out.",
      },
      es: {
        text: "¿Ya tienes Instagram o una web? Pégala y la leo, así no tienes que escribirlo todo.",
      },
    },
  },
  {
    id: "presence.brand_separate",
    version: 1,
    stage: "presence",
    targets: ["presence.business_social_separate", "presence.has_logo", "presence.owns_domain"],
    open: false,
    askWhen: (known) => knows(known, "business.name", "business.exists"),
    phrasing: {
      en: {
        text: "Does the business have its own accounts and logo, separate from your personal ones?",
      },
      es: {
        text: "¿El negocio tiene sus propias cuentas y logo, aparte de las tuyas personales?",
      },
    },
  },

  // ── Business maturity ──────────────────────────────────────────────────────
  {
    id: "maturity.business_name",
    version: 1,
    stage: "maturity",
    targets: ["business.name", "business.exists", "business.description"],
    open: true,
    phrasing: {
      en: {
        text: "Is there a business name behind this, or is it all under your own name for now?",
      },
      es: {
        text: "¿Hay un nombre de negocio detrás de esto, o por ahora va todo a tu nombre?",
      },
    },
  },
  {
    id: "maturity.employment",
    version: 1,
    stage: "maturity",
    targets: ["business.employed_by_other"],
    open: false,
    phrasing: {
      en: {
        text: "Are you employed somewhere as well? It changes nothing about your profile, I just want the picture right.",
      },
      es: {
        text: "¿Trabajas también empleada en algún sitio? No cambia nada de tu perfil, solo quiero entenderlo bien.",
      },
    },
  },

  // ── Brand ──────────────────────────────────────────────────────────────────
  {
    id: "brand.audience",
    version: 1,
    stage: "brand",
    targets: ["brand.audience", "brand.price_position"],
    open: true,
    phrasing: {
      en: { text: "Who are your best clients, and roughly where do you sit on price?" },
      es: { text: "¿Quiénes son tus mejores clientes y más o menos dónde estás de precio?" },
    },
  },
  {
    id: "brand.differentiator",
    version: 1,
    stage: "brand",
    targets: ["brand.differentiator", "brand.tone"],
    open: true,
    phrasing: {
      en: { text: "Why do people pick you over someone else nearby?" },
      es: { text: "¿Por qué te eligen a ti y no a otra persona cerca?" },
    },
  },

  // ── Operations ─────────────────────────────────────────────────────────────
  {
    id: "operations.bookings",
    version: 1,
    stage: "operations",
    targets: ["operations.takes_bookings", "operations.booking_method", "operations.takes_payments"],
    open: false,
    phrasing: {
      en: { text: "How do people book you today, and do you take payment up front?" },
      es: { text: "¿Cómo te reservan hoy y cobras algo por adelantado?" },
    },
  },
  {
    id: "operations.business_receives",
    version: 1,
    stage: "operations",
    targets: ["operations.business_receives_bookings"],
    open: false,
    decisive: true,
    askWhen: (known) => knows(known, "business.name", "business.exists"),
    phrasing: {
      en: {
        text: "Do bookings come in for the business itself, or always for you personally?",
      },
      es: {
        text: "¿Las reservas entran para el negocio en sí, o siempre para ti personalmente?",
      },
    },
  },

  // ── Goals ──────────────────────────────────────────────────────────────────
  {
    id: "goals.primary",
    version: 1,
    stage: "goals",
    targets: ["goals.primary", "goals.wants_website"],
    open: true,
    phrasing: {
      en: { text: "If this worked perfectly, what would be different in six months?" },
      es: { text: "Si esto saliera perfecto, ¿qué sería distinto en seis meses?" },
    },
  },
  {
    id: "goals.growth",
    version: 1,
    stage: "goals",
    targets: ["goals.wants_to_grow_team"],
    open: false,
    phrasing: {
      en: { text: "Any plans to bring other people on?" },
      es: { text: "¿Tienes planes de sumar a más gente?" },
    },
  },
];

// ─── Lookup ───────────────────────────────────────────────────────────────────

/**
 * Core bank plus every pack's questions, for LOOKUP ONLY.
 *
 * Selection must never see this list — a pack's questions are asked only when
 * that pack matched. But an event logged against `photo.deliverables` has to
 * resolve months later regardless of which pack the reader has in mind, so id
 * resolution is global and unconditional. Ids are unique across the whole set,
 * which `questions.test.ts` asserts.
 */
const ALL_QUESTIONS: readonly Question[] = [...QUESTIONS, ...allPackQuestions()];

const BY_ID: ReadonlyMap<string, Question> = new Map(ALL_QUESTIONS.map((q) => [q.id, q]));

export function questionById(id: string): Question | null {
  return BY_ID.get(id) ?? null;
}

export function questionsInStage(stage: Stage): Question[] {
  return QUESTIONS.filter((q) => q.stage === stage);
}

/** Every fact key any question claims to obtain. Used to assert coverage. */
export function allTargetedFactKeys(): string[] {
  return Array.from(new Set(ALL_QUESTIONS.flatMap((q) => q.targets)));
}

export function unknownTargets(): string[] {
  return allTargetedFactKeys().filter((k) => !isKnownFactKey(k));
}

// ─── Selection ────────────────────────────────────────────────────────────────

export type AskedRecord = {
  questionId: string;
  /** How many times it has been put to the user. Second time is a re-ask. */
  asks: number;
};

/**
 * The next question worth asking, or null when there is nothing left.
 *
 * The skip rule is the whole reason `targets` exists: a question every one of
 * whose targets is already known is DONE, whoever supplied the answer and
 * however they phrased it. Someone who volunteers five facts in their opening
 * sentence skips five questions, which is the difference between a conversation
 * and a form with a chat interface.
 *
 * Decisive questions are ordered first within their stage, because they are the
 * ones that decide what someone pays, and a session that goes cold having
 * skipped one leaves the engine guessing.
 */
export function nextQuestion(
  knownFactKeys: ReadonlySet<string>,
  asked: readonly AskedRecord[],
  options: { maxAsksPerQuestion?: number; pack?: IndustryPack | null } = {},
): Question | null {
  const maxAsks = options.maxAsksPerQuestion ?? 2;
  const askCount = new Map(asked.map((a) => [a.questionId, a.asks]));
  const pool = questionPool(options.pack ?? null);

  const candidates = pool.filter((q) => {
    if ((askCount.get(q.id) ?? 0) >= maxAsks) return false;
    if (q.askWhen && !q.askWhen(knownFactKeys)) return false;
    // Fully satisfied. Note that PARTIAL satisfaction still asks: a question
    // targeting three facts that produced one has two left to get.
    if (q.targets.length > 0 && q.targets.every((t) => knownFactKeys.has(t))) return false;
    // The opening question targets nothing, so it can never be satisfied by
    // facts. It is done once it has been asked.
    if (q.targets.length === 0 && (askCount.get(q.id) ?? 0) > 0) return false;
    return true;
  });

  if (candidates.length === 0) return null;

  const stageIndex = (s: Stage) => STAGES.indexOf(s);
  return (
    candidates.sort((a, b) => {
      const stageDiff = stageIndex(a.stage) - stageIndex(b.stage);
      if (stageDiff !== 0) return stageDiff;
      if (a.decisive !== b.decisive) return a.decisive ? -1 : 1;
      return pool.indexOf(a) - pool.indexOf(b);
    })[0] ?? null
  );
}

/**
 * The questions in play for this visitor.
 *
 * Exactly the core bank, plus the ONE matched pack's questions. Not every pack:
 * asking a barber about dietary requirements is the specific failure the
 * matching exists to avoid, and it would read as the system not having listened.
 */
export function questionPool(pack: IndustryPack | null): readonly Question[] {
  return pack ? [...QUESTIONS, ...pack.questions] : QUESTIONS;
}

/**
 * Decisive questions still unanswered.
 *
 * What the Agent must not walk away without. Reported separately from
 * `nextQuestion` so the approval screen can say "I still do not know how the
 * money works with them" instead of quietly guessing.
 */
export function missingDecisiveQuestions(
  knownFactKeys: ReadonlySet<string>,
): Question[] {
  // Pack questions are never decisive by construction, so the core bank is the
  // whole search space here. See `packQuestion` in `industry-packs.ts`.
  return QUESTIONS.filter(
    (q) =>
      q.decisive &&
      (!q.askWhen || q.askWhen(knownFactKeys)) &&
      !q.targets.every((t) => knownFactKeys.has(t)),
  );
}

/** Progress through the stages, for the "What I know" panel. */
export function stageProgress(
  knownFactKeys: ReadonlySet<string>,
  pack: IndustryPack | null = null,
): Array<{ stage: Stage; satisfied: number; total: number }> {
  const pool = questionPool(pack);
  return STAGES.map((stage) => {
    const questions = pool.filter((q) => q.stage === stage);
    const satisfied = questions.filter(
      (q) => q.targets.length > 0 && q.targets.every((t) => knownFactKeys.has(t)),
    ).length;
    return { stage, satisfied, total: questions.length };
  });
}
