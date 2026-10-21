/**
 * event-board.ts — the board for a multi-person job: roles, who is confirmed,
 * what is still open, and a call sheet (TUL-1373). Pure.
 *
 * Only a CONFIRMED person fills a seat: an invited person is a maybe and a
 * declined one is nothing. Messages go per role: a person gets their own role,
 * time and event in their own language, and nothing about anyone else or money.
 */

export type BoardPerson = {
  talentProfileId: string;
  name: string;
  status: "confirmed" | "invited" | "declined";
  /** Their language ("es", "en"...). Empty falls back to English. */
  locale: string;
};

export type BoardRole = {
  id: string;
  role: string;
  needed: number;
  /** When this role reports (ISO), or null when not set yet. */
  callTime: string | null;
  people: BoardPerson[];
};

export type BoardRoleState = { id: string; role: string; needed: number; confirmed: number; invited: number; open: number; state: "filled" | "partial" | "open" };

export type EventBoard = {
  roles: BoardRoleState[];
  totals: { needed: number; confirmed: number; invited: number; open: number };
  complete: boolean;
  callSheet: Array<{ roleId: string; role: string; name: string; talentProfileId: string; callTime: string | null }>;
};

export function buildEventBoard(roles: readonly BoardRole[]): EventBoard {
  const states: BoardRoleState[] = roles.map((r) => {
    const confirmed = r.people.filter((p) => p.status === "confirmed").length;
    const invited = r.people.filter((p) => p.status === "invited").length;
    const needed = Math.max(0, Math.floor(r.needed) || 0);
    const open = Math.max(0, needed - confirmed);
    return { id: r.id, role: r.role, needed, confirmed, invited, open, state: open === 0 && needed > 0 ? "filled" : confirmed > 0 ? "partial" : "open" };
  });
  const sum = (k: "needed" | "confirmed" | "invited" | "open") => states.reduce((s, r) => s + r[k], 0);
  const sheet: EventBoard["callSheet"] = [];
  for (const r of roles) {
    for (const p of r.people) {
      if (p.status === "confirmed") sheet.push({ roleId: r.id, role: r.role, name: p.name, talentProfileId: p.talentProfileId, callTime: r.callTime });
    }
  }
  sheet.sort((a, b) => {
    const ta = a.callTime ? Date.parse(a.callTime) : Infinity;
    const tb = b.callTime ? Date.parse(b.callTime) : Infinity;
    if (ta !== tb) return ta < tb ? -1 : 1;
    return a.role.localeCompare(b.role) || a.name.localeCompare(b.name);
  });
  return {
    roles: states,
    totals: { needed: sum("needed"), confirmed: sum("confirmed"), invited: sum("invited"), open: sum("open") },
    complete: states.length > 0 && states.every((s) => s.state === "filled"),
    callSheet: sheet,
  };
}

const COPY = {
  en: {
    intro: (event: string) => `You are on ${event}.`,
    role: (r: string) => `Your role: ${r}.`,
    call: (when: string) => `Your call: ${when}.`,
    noCall: "Your call time will follow.",
  },
  es: {
    intro: (event: string) => `Estás en ${event}.`,
    role: (r: string) => `Tu rol: ${r}.`,
    call: (when: string) => `Tu llamado: ${when}.`,
    noCall: "Te avisaremos tu hora de llamado.",
  },
} as const;

/** The message one person gets: their own role, time and event only. */
export function roleMessage(input: {
  role: Pick<BoardRole, "role">;
  person: Pick<BoardPerson, "locale">;
  eventTitle: string;
  startsAt: string | null;
  timeZone: string;
}): string {
  const lang = input.person.locale.toLowerCase().startsWith("es") ? "es" : "en";
  const c = COPY[lang];
  let when: string | null = null;
  if (input.startsAt && Number.isFinite(Date.parse(input.startsAt))) {
    try {
      when = new Intl.DateTimeFormat(lang, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: input.timeZone }).format(new Date(input.startsAt));
    } catch {
      when = null;
    }
  }
  return [c.intro(input.eventTitle), c.role(input.role.role), when ? c.call(when) : c.noCall].join(" ");
}
